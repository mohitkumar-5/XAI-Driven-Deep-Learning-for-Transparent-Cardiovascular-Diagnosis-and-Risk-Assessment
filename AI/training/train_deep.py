import os
import sys

# Reconfigure streams to support UTF-8 characters (like emojis in PyTorch output) on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from typing import Tuple, List, Dict

# Add workspace root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import ast
import pickle
import json
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

from AI.utils.config import BASE_DIR, DATA_DIR, SAVED_MODELS_DIR, RANDOM_STATE, DIAGNOSTIC_SUPERCLASSES
from AI.utils.logger import get_logger
from AI.utils.download_dataset import setup_dataset
from AI.preprocessing.load_dataset import load_database_csv, load_ecg_signal
from AI.preprocessing.label_processing import process_labels
from AI.models.deep_ecg import ECGClassifier

# Adjust configuration dynamically
MAX_RECORDS = 1200
BATCH_SIZE = 64
EPOCHS_PRETRAIN = 8
EPOCHS_FINETUNE = 4
LEARNING_RATE = 0.001
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

logger = get_logger("train_deep")

class ECGDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.tensor(X, dtype=torch.float32).unsqueeze(1) # [batch, 1, 5000]
        self.y = torch.tensor(y, dtype=torch.long)
        
    def __len__(self):
        return len(self.X)
        
    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

def extract_signals_and_labels(df_metadata: pd.DataFrame, target_len=5000) -> Tuple[np.ndarray, np.ndarray]:
    """
    Load raw Lead II ECG signals from disk and match with their labels.
    """
    X_list = []
    y_list = []
    
    total_records = len(df_metadata)
    logger.info(f"Extracting signals for {total_records} records...")
    
    success_count = 0
    for idx, row in df_metadata.iterrows():
        rel_path = row['filename_hr']
        label = row['superclass']
        
        try:
            signal, lead_names = load_ecg_signal(rel_path, DATA_DIR)
            
            # Find Lead II index
            if 'II' in lead_names:
                lead_idx = lead_names.index('II')
            else:
                lead_idx = 1 # Fallback to index 1
                
            lead_signal = signal[:, lead_idx]
            
            # Ensure the length is exactly 5000 (10 seconds @ 500Hz)
            if len(lead_signal) < target_len:
                # Zero-pad
                padded = np.zeros(target_len)
                padded[:len(lead_signal)] = lead_signal
                lead_signal = padded
            elif len(lead_signal) > target_len:
                # Truncate
                lead_signal = lead_signal[:target_len]
                
            # Perform Z-score normalization on the signal
            mean = np.mean(lead_signal)
            std = np.std(lead_signal) + 1e-8
            lead_signal = (lead_signal - mean) / std
            
            X_list.append(lead_signal)
            y_list.append(label)
            success_count += 1
            
        except Exception as e:
            # Skip records that aren't downloaded or fail to load
            pass
            
    logger.info(f"Successfully loaded {success_count}/{total_records} ECG records.")
    return np.array(X_list), np.array(y_list)

def segment_patient_csv(csv_path: str, target_len=5000) -> np.ndarray:
    """
    Load data/patient_data.csv, clean out invalid entries,
    and segment the continuous ECG readings into blocks of target_len (5000).
    """
    if not os.path.exists(csv_path):
        logger.warning(f"Patient CSV not found at {csv_path}. Skipping local fine-tuning.")
        return np.array([])
        
    logger.info(f"Loading local patient data for calibration from {csv_path}...")
    df = pd.read_csv(csv_path)
    
    # Filter out invalid rows (keep only positive readings and connected leads)
    df_clean = df[
        (df['heart_rate'] > 0) & 
        (df['spo2'] > 0) & 
        (df['ecg'] > 0) & 
        (df['gsr'] > 0)
    ].copy()
    
    ecg_signal = df_clean['ecg'].values
    total_samples = len(ecg_signal)
    num_blocks = total_samples // target_len
    
    if num_blocks == 0:
        logger.warning(f"Not enough clean samples in patient_data.csv ({total_samples}) to make a 5000-sample block. Skipping fine-tuning.")
        return np.array([])
        
    logger.info(f"Segmenting {total_samples} samples into {num_blocks} blocks of size {target_len}...")
    blocks = []
    for i in range(num_blocks):
        block = ecg_signal[i*target_len : (i+1)*target_len]
        # Perform Z-score normalization to match PTB-XL scaling
        mean = np.mean(block)
        std = np.std(block) + 1e-8
        block = (block - mean) / std
        blocks.append(block)
        
    return np.array(blocks)

def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0
    correct = 0
    total = 0
    for X, y in loader:
        X, y = X.to(device), y.to(device)
        optimizer.zero_grad()
        outputs = model(X)
        loss = criterion(outputs, y)
        loss.backward()
        optimizer.step()
        
        total_loss += loss.item() * X.size(0)
        _, predicted = outputs.max(1)
        total += y.size(0)
        correct += predicted.eq(y).sum().item()
        
    return total_loss / total, correct / total

def val_epoch(model, loader, criterion, device):
    model.eval()
    total_loss = 0
    correct = 0
    total = 0
    with torch.no_grad():
        for X, y in loader:
            X, y = X.to(device), y.to(device)
            outputs = model(X)
            loss = criterion(outputs, y)
            
            total_loss += loss.item() * X.size(0)
            _, predicted = outputs.max(1)
            total += y.size(0)
            correct += predicted.eq(y).sum().item()
            
    return total_loss / total, correct / total

def main():
    logger.info("Initializing dataset setup...")
    # Change MAX_RECORDS temporarily in config setup
    from AI.utils import config
    config.MAX_RECORDS = MAX_RECORDS
    
    try:
        setup_dataset()
    except Exception as e:
        logger.warning(f"Setup dataset failed: {e}. Attempting to train with existing files.")
        
    # Load metadata
    df_ptbxl = load_database_csv(DATA_DIR)
    df_single_label = process_labels(df_ptbxl, DATA_DIR)
    
    if len(df_single_label) > MAX_RECORDS:
        logger.info(f"Limiting metadata to first {MAX_RECORDS} single-label records...")
        df_single_label = df_single_label.head(MAX_RECORDS)
        
    # Extract ECG traces and labels
    X_raw, y_raw = extract_signals_and_labels(df_single_label)
    
    if len(X_raw) == 0:
        logger.error("No valid ECG signals loaded. Training aborted.")
        return
        
    # Encode labels
    label_encoder = LabelEncoder()
    # Fit label encoder on target classes
    label_encoder.fit(DIAGNOSTIC_SUPERCLASSES)
    y_encoded = label_encoder.transform(y_raw)
    
    # Save label encoder
    os.makedirs(SAVED_MODELS_DIR, exist_ok=True)
    le_path = os.path.join(SAVED_MODELS_DIR, "label_encoder.pkl")
    with open(le_path, "wb") as f:
        pickle.dump(label_encoder, f)
    logger.info(f"Saved LabelEncoder to {le_path}")
    
    # Save target feature name lists for backend compatibility
    features_path = os.path.join(SAVED_MODELS_DIR, "selected_features.json")
    with open(features_path, "w") as f:
        json.dump(["heart_rate", "spo2", "temperature", "gsr"], f, indent=4)
        
    # Train-test split
    X_train, X_val, y_train, y_val = train_test_split(
        X_raw, y_encoded, test_size=0.2, random_state=RANDOM_STATE, stratify=y_encoded
    )
    
    train_dataset = ECGDataset(X_train, y_train)
    val_dataset = ECGDataset(X_val, y_val)
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)
    
    # Initialize PyTorch Model
    logger.info(f"Initializing PyTorch 1D CNN + BiLSTM model on device: {DEVICE}")
    model = ECGClassifier(num_classes=len(DIAGNOSTIC_SUPERCLASSES)).to(DEVICE)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    
    # -------------------------------------------------------------
    # 1. Pre-training on PTB-XL Dataset
    # -------------------------------------------------------------
    logger.info(f"--- STEP 1: Pre-training model on {len(X_train)} PTB-XL records ---")
    best_val_acc = 0.0
    model_pth_path = os.path.join(SAVED_MODELS_DIR, "deep_ecg_pretrained.pth")
    
    for epoch in range(EPOCHS_PRETRAIN):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, DEVICE)
        val_loss, val_acc = val_epoch(model, val_loader, criterion, DEVICE)
        
        logger.info(f"Epoch {epoch+1:02d}/{EPOCHS_PRETRAIN:02d} | "
                    f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc*100:.2f}% | "
                    f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc*100:.2f}%")
                    
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), model_pth_path)
            logger.info("  --> Saved new best pre-trained model weights.")
            
    # Load best pre-trained weights before fine-tuning
    model.load_state_dict(torch.load(model_pth_path))
    
    # -------------------------------------------------------------
    # 2. Transfer Learning Fine-Tuning on local patient_data.csv
    # -------------------------------------------------------------
    patient_csv = os.path.join(os.path.dirname(BASE_DIR), "data", "patient_data.csv")
    X_patient = segment_patient_csv(patient_csv)
    
    if len(X_patient) > 0:
        logger.info(f"--- STEP 2: Fine-Tuning Calibration on local patient data ({len(X_patient)} records) ---")
        
        # Label all local patient records as NORM (Normal cardiac rhythm index in encoder)
        norm_idx = list(label_encoder.classes_).index("NORM")
        y_patient = np.full(len(X_patient), norm_idx)
        
        # Freeze weights of Conv1D extraction layers and BiLSTM layers
        # Only self.fc1 and self.fc2 remain trainable
        for name, param in model.named_parameters():
            if "fc" not in name:
                param.requires_grad = False
                
        patient_dataset = ECGDataset(X_patient, y_patient)
        patient_loader = DataLoader(patient_dataset, batch_size=min(len(X_patient), 32), shuffle=True)
        
        # Setup specific fine-tuning optimizer for classification head
        ft_optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-4)
        
        for epoch in range(EPOCHS_FINETUNE):
            ft_loss, ft_acc = train_epoch(model, patient_loader, criterion, ft_optimizer, DEVICE)
            logger.info(f"Calibration Epoch {epoch+1:02d}/{EPOCHS_FINETUNE:02d} | "
                        f"Calibration Loss: {ft_loss:.4f}, Calibration Acc: {ft_acc*100:.2f}%")
                        
        logger.info("Calibration fine-tuning completed successfully.")
        
    # Unfreeze weights for export
    for param in model.parameters():
        param.requires_grad = True
        
    # Save final model weights
    final_model_path = os.path.join(SAVED_MODELS_DIR, "deep_ecg.pth")
    torch.save(model.state_dict(), final_model_path)
    logger.info(f"Saved final PyTorch model weights to {final_model_path}")
    
    # -------------------------------------------------------------
    # 3. Export to ONNX Format for AWS lightweight deployment
    # -------------------------------------------------------------
    logger.info("--- STEP 3: Exporting final model to ONNX ---")
    model.eval()
    dummy_input = torch.randn(1, 1, 5000).to(DEVICE)
    onnx_path = os.path.join(SAVED_MODELS_DIR, "deep_ecg.onnx")
    
    # Check if device is CUDA, map back to CPU for standard CPU inference ONNX export
    if DEVICE.type == "cuda":
        model_cpu = ECGClassifier(num_classes=len(DIAGNOSTIC_SUPERCLASSES)).cpu()
        model_cpu.load_state_dict(torch.load(final_model_path, map_location="cpu"))
        dummy_input = torch.randn(1, 1, 5000).cpu()
        torch.onnx.export(
            model_cpu,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=12,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
        )
    else:
        torch.onnx.export(
            model,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=12,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
        )
        
    logger.info(f"Successfully exported model to ONNX: {onnx_path}")
    logger.info("Deep Model Training & Calibration Completed Successfully!")

if __name__ == "__main__":
    from typing import Tuple
    main()
