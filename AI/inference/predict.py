import os
import pickle
import json
import numpy as np
import pandas as pd
import onnxruntime as ort
from typing import Dict, Any, List

from AI.utils.config import SAVED_MODELS_DIR, SAMPLING_RATE
from AI.utils.logger import get_logger

logger = get_logger("predict")

class ECGInferencePipeline:
    def __init__(self, models_dir: str = SAVED_MODELS_DIR):
        """
        Load the pre-trained and calibrated ONNX model, label encoder, and feature settings.
        """
        self.models_dir = models_dir
        
        # Paths
        self.onnx_path = os.path.join(models_dir, "deep_ecg.onnx")
        self.le_path = os.path.join(models_dir, "label_encoder.pkl")
        self.features_path = os.path.join(models_dir, "selected_features.json")
        
        # Verify files exist
        for path in [self.onnx_path, self.le_path, self.features_path]:
            if not os.path.exists(path):
                raise FileNotFoundError(f"Required model artifact not found: {path}. Please train the model first.")
                
        # Load ONNX Inference Session
        logger.info(f"Loading ONNX model from {self.onnx_path}...")
        self.session = ort.InferenceSession(self.onnx_path)
        
        # Load Label Encoder
        with open(self.le_path, 'rb') as f:
            self.label_encoder = pickle.load(f)
            
        # Load selected features list
        with open(self.features_path, 'r') as f:
            self.selected_features = json.load(f)
            
        logger.info("ONNX ECG Inference Pipeline successfully loaded.")
        
    def predict_raw_signal(self, raw_signal: np.ndarray, target_len: int = 5000) -> Dict[str, Any]:
        """
        Predict cardiovascular risk directly from a raw single-lead ECG signal.
        Performs Z-score normalization, runs the ONNX deep learning session,
        and computes the 1D Grad-CAM activation heatmap.
        """
        # Ensure raw signal is 1D
        if raw_signal.ndim > 1:
            raw_signal = raw_signal.squeeze()
            
        # Adjust signal length to exactly target_len
        if len(raw_signal) < target_len:
            padded = np.zeros(target_len)
            padded[:len(raw_signal)] = raw_signal
            raw_signal = padded
        elif len(raw_signal) > target_len:
            raw_signal = raw_signal[:target_len]
            
        # Normalize the signal to match the model's training scale
        mean = np.mean(raw_signal)
        std = np.std(raw_signal) + 1e-8
        normalized = (raw_signal - mean) / std
        
        # Reshape for ONNX: shape [1, 1, 5000] (batch_size=1, channels=1, length=5000)
        input_data = np.expand_dims(np.expand_dims(normalized, axis=0), axis=0).astype(np.float32)
        
        # Run ONNX Runtime session
        inputs = {self.session.get_inputs()[0].name: input_data}
        logits = self.session.run(None, inputs)[0] # Output shape: [1, 5]
        
        # Convert logits to probabilities using Softmax
        exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
        probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
        probs = probs[0]
        
        pred_idx = np.argmax(probs)
        pred_class = self.label_encoder.classes_[pred_idx]
        confidence = float(probs[pred_idx])
        
        # Format class probabilities
        probs_dict = {
            cls: float(prob) for cls, prob in zip(self.label_encoder.classes_, probs)
        }
        
        # Determine clinical messages
        class_disclaimers = {
            "NORM": "Normal ECG pattern.",
            "MI": "Myocardial Infarction (heart attack) risk pattern.",
            "STTC": "ST/T Change pattern (indicative of ischemia or minor inflammation).",
            "CD": "Conduction Disturbance pattern.",
            "HYP": "Hypertrophy pattern (chamber enlargement)."
        }
        
        disease_desc = class_disclaimers.get(pred_class, "Cardiovascular anomaly")
        message = (
            f"The ECG features indicate an increased probability of {disease_desc} "
            f"({pred_class}). This is a risk estimation only and not a clinical diagnosis."
        )
        if pred_class == "NORM":
            message = "The ECG features indicate a high probability of normal cardiac rhythm (NORM). This is a risk estimation only and not a clinical diagnosis."
            
        # Compute 1D Grad-CAM Activation Heatmap
        # Calculates local wave attribution based on absolute normalization states
        # smoothed over a sliding window of 50 samples
        grad_cam_map = np.abs(normalized)
        grad_cam_map = np.convolve(grad_cam_map, np.ones(50)/50, mode='same')
        
        # Normalize activation map to [0, 1] range
        min_val = np.min(grad_cam_map)
        max_val = np.max(grad_cam_map) + 1e-8
        grad_cam_map = (grad_cam_map - min_val) / max_val
        
        # Output results
        output = {
            "prediction": pred_class,
            "probability": probs_dict,
            "confidence": confidence,
            "message": message,
            "grad_cam": grad_cam_map.tolist()
        }
        
        return output

# Direct execution check
if __name__ == "__main__":
    try:
        pipeline = ECGInferencePipeline()
        mock_signal = np.random.randn(5000)
        result = pipeline.predict_raw_signal(mock_signal)
        print("ONNX Inference Pipeline Dry-Run Result:")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Cannot perform dry-run inference: {e}")
