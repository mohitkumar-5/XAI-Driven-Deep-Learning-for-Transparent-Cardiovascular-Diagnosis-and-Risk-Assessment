import os
import sys
import pickle
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix, roc_curve, auc
from sklearn.preprocessing import label_binarize
import shap

# Add workspace root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from AI.utils.config import DATA_DIR, SAVED_MODELS_DIR, TEST_SIZE, RANDOM_STATE, SAMPLING_RATE, ECG_LEAD
from AI.preprocessing.load_dataset import load_database_csv, load_ecg_signal
from AI.preprocessing.label_processing import process_labels
from AI.preprocessing.signal_filtering import filter_ecg
from AI.preprocessing.normalization import z_score_normalize
from AI.feature_extraction.r_peak_detection import detect_r_peaks
from AI.utils.logger import get_logger

logger = get_logger("generate_plots")

def generate_ecg_waveform_plot(data_dir: str, save_dir: str):
    """
    Load a real ECG signal, filter/normalize it, detect R-peaks,
    and plot the raw vs. preprocessed signal with highlighted clinical segments.
    """
    logger.info("Generating ECG waveform visualization...")
    df_ptbxl = load_database_csv(data_dir)
    df_single_label = process_labels(df_ptbxl, data_dir)
    
    # Load first record
    sample_row = df_single_label.iloc[0]
    rel_path = sample_row['filename_hr']
    true_label = sample_row['superclass']
    
    raw_signal, lead_names = load_ecg_signal(rel_path, data_dir)
    lead_idx = lead_names.index(ECG_LEAD) if ECG_LEAD in lead_names else 1
    raw_channel = raw_signal[:, lead_idx]
    
    # Filter and normalize
    cleaned = filter_ecg(raw_channel, SAMPLING_RATE)
    normalized = z_score_normalize(cleaned)
    
    # Find peaks
    r_peaks = detect_r_peaks(normalized, SAMPLING_RATE)
    
    # Plotting (take first 3 seconds for readability)
    plot_len = int(SAMPLING_RATE * 3)
    t = np.arange(plot_len) / SAMPLING_RATE
    
    fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True)
    
    # 1. Raw
    axes[0].plot(t, raw_channel[:plot_len], color='#e06666', linewidth=1.5)
    axes[0].set_title(f"Raw ECG Waveform - Lead {ECG_LEAD} (Class: {true_label})", fontsize=12, fontweight='bold')
    axes[0].set_ylabel("Amplitude (mV)")
    axes[0].grid(True, linestyle='--', alpha=0.6)
    
    # 2. Cleaned
    axes[1].plot(t, cleaned[:plot_len], color='#3d85c6', linewidth=1.5)
    axes[1].set_title("Filtered ECG Signal (Baseline Wander + 0.5-40Hz Bandpass + 50Hz Notch)", fontsize=12, fontweight='bold')
    axes[1].set_ylabel("Amplitude (mV)")
    axes[1].grid(True, linestyle='--', alpha=0.6)
    
    # 3. Cleaned + Normalized + R-Peaks
    norm_crop = normalized[:plot_len]
    axes[2].plot(t, norm_crop, color='#674ea7', linewidth=1.5, label="Z-score Clean ECG")
    
    # Plot R-peaks that lie within the 3-second window
    peaks_in_window = r_peaks[r_peaks < plot_len]
    axes[2].scatter(peaks_in_window / SAMPLING_RATE, norm_crop[peaks_in_window], 
                    color='red', marker='o', s=60, label="R-peaks (QRS centers)", zorder=5)
    
    # Annotate clinical features (mocking one beat for visualization)
    if len(peaks_in_window) >= 2:
        beat_x = peaks_in_window[0] / SAMPLING_RATE
        axes[2].axvspan(beat_x - 0.04, beat_x + 0.05, color='#ffd966', alpha=0.4, label="QRS Duration Area (~90ms)")
        axes[2].axvspan(beat_x - 0.04, beat_x + 0.36, color='#93c47d', alpha=0.3, label="QT Interval Segment (~400ms)")
        
    axes[2].set_title("Normalized Signal with Automated Peak Delineation", fontsize=12, fontweight='bold')
    axes[2].set_xlabel("Time (seconds)")
    axes[2].set_ylabel("Normalized Value")
    axes[2].legend(loc='upper right')
    axes[2].grid(True, linestyle='--', alpha=0.6)
    
    plt.tight_layout()
    plot_path = os.path.join(save_dir, "sample_ecg_plot.png")
    plt.savefig(plot_path, dpi=150)
    plt.close()
    logger.info(f"ECG waveform plot saved to {plot_path}")

def generate_model_1_plots(data_dir: str, save_dir: str):
    """
    Load Model 1 artifacts and plot confusion matrix, ROC curve, and SHAP feature importance.
    """
    logger.info("Generating Model 1 (Disease Risk) evaluation plots...")
    
    # Load Model 1 artifacts
    model_path = os.path.join(save_dir, "model.pkl")
    scaler_path = os.path.join(save_dir, "scaler.pkl")
    le_path = os.path.join(save_dir, "label_encoder.pkl")
    features_path = os.path.join(save_dir, "selected_features.json")
    
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    with open(le_path, 'rb') as f:
        le = pickle.load(f)
    with open(features_path, 'r') as f:
        selected_features = json.load(f)
        
    # Load extracted features matrix
    features_csv = os.path.join(data_dir, "extracted_features_raw.csv")
    if not os.path.exists(features_csv):
        logger.error(f"Extracted features CSV not found at {features_csv}. Cannot build evaluation plots.")
        return
        
    df = pd.read_csv(features_csv, index_col='ecg_id')
    
    X = df[selected_features]
    y = df['superclass']
    y_encoded = le.transform(y)
    
    # Split
    _, X_test, _, y_test = train_test_split(
        X, y_encoded, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y_encoded
    )
    
    X_test_scaled = scaler.transform(X_test)
    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)
    
    # 1. Confusion Matrix
    cm = confusion_matrix(y_test, y_pred)
    classes_list = le.classes_
    
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    
    ax.set_xticks(np.arange(cm.shape[1]))
    ax.set_yticks(np.arange(cm.shape[0]))
    ax.set_xticklabels(classes_list)
    ax.set_yticklabels(classes_list)
    
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
    
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], 'd'),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black")
                    
    ax.set_title("XGBoost Disease Risk (Model 1) Confusion Matrix", fontsize=12, fontweight='bold')
    ax.set_xlabel("Predicted Class Label")
    ax.set_ylabel("True Class Label")
    
    plt.tight_layout()
    cm_path = os.path.join(save_dir, "confusion_matrix_m1.png")
    plt.savefig(cm_path, dpi=150)
    plt.close()
    
    # 2. ROC Curves (One-vs-Rest)
    y_test_bin = label_binarize(y_test, classes=np.arange(len(le.classes_)))
    n_classes = len(le.classes_)
    
    plt.figure(figsize=(9, 7))
    colors = ['#3d85c6', '#674ea7', '#e06666', '#f1c232', '#93c47d']
    
    for i in range(n_classes):
        fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_prob[:, i])
        roc_auc = auc(fpr, tpr)
        plt.plot(fpr, tpr, color=colors[i % len(colors)], lw=2,
                 label=f"Class {le.classes_[i]} (AUC = {roc_auc:.2f})")
                 
    plt.plot([0, 1], [0, 1], 'k--', lw=1.5)
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel("False Positive Rate (FPR)")
    plt.ylabel("True Positive Rate (TPR)")
    plt.title("XGBoost Disease Risk ROC Curve (Model 1) - One-vs-Rest", fontsize=12, fontweight='bold')
    plt.legend(loc="lower right")
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    roc_path = os.path.join(save_dir, "roc_curve_m1.png")
    plt.savefig(roc_path, dpi=150)
    plt.close()
    
    # 3. SHAP Summary Plot
    logger.info("Plotting Model 1 SHAP Feature Importance...")
    try:
        explainer_path = os.path.join(save_dir, "shap_explainer.pkl")
        if os.path.exists(explainer_path):
            with open(explainer_path, 'rb') as f:
                explainer = pickle.load(f)
        else:
            explainer = shap.TreeExplainer(model)
            
        shap_vals = explainer.shap_values(X_test_scaled)
        
        plt.figure(figsize=(9, 6))
        shap.summary_plot(shap_vals, X_test_scaled, feature_names=selected_features, class_names=le.classes_, plot_type="bar", show=False)
        plt.title("Disease Risk Model 1 SHAP Global Feature Importance", fontsize=12, fontweight='bold')
        plt.tight_layout()
        shap_path = os.path.join(save_dir, "shap_importance_m1.png")
        plt.savefig(shap_path, dpi=150)
        plt.close()
    except Exception as e:
        logger.error(f"Failed to generate Model 1 SHAP importance plot: {e}")
        plt.figure(figsize=(9, 6))
        importances = pd.Series(model.feature_importances_, index=selected_features).sort_values()
        importances.plot(kind='barh', color='#3d85c6')
        plt.title("XGBoost Disease Risk Model 1 Gini Feature Importance", fontsize=12, fontweight='bold')
        plt.xlabel("Gini Importance Score")
        plt.tight_layout()
        shap_path = os.path.join(save_dir, "shap_importance_m1.png")
        plt.savefig(shap_path, dpi=150)
        plt.close()

def generate_model_2_plots(data_dir: str, save_dir: str):
    """
    Load Model 2 artifacts, compile record 106 test set, and plot confusion matrix, ROC curve, and SHAP.
    """
    logger.info("Generating Model 2 (Arrhythmia) evaluation plots...")
    from AI.preprocessing.load_mitdb import load_mit_record
    from AI.feature_extraction.mit_features import extract_beat_features
    
    # Load Model 2 artifacts
    model_path = os.path.join(save_dir, "arrhythmia_model.pkl")
    scaler_path = os.path.join(save_dir, "arrhythmia_scaler.pkl")
    features_path = os.path.join(save_dir, "arrhythmia_selected_features.json")
    
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    with open(features_path, 'r') as f:
        selected_features = json.load(f)
        
    # Load test record 106
    signal, r_peaks, symbols, fs = load_mit_record('106')
    lead_signal = signal[:, 0]
    df_feats, y_test = extract_beat_features(lead_signal, r_peaks, symbols, fs)
    
    X_test_scaled = scaler.transform(df_feats)
    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)
    
    # 1. Confusion Matrix
    cm = confusion_matrix(y_test, y_pred)
    classes_list = ['Normal Beat', 'Arrhythmia']
    
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    
    ax.set_xticks(np.arange(cm.shape[1]))
    ax.set_yticks(np.arange(cm.shape[0]))
    ax.set_xticklabels(classes_list)
    ax.set_yticklabels(classes_list)
    
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], 'd'),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black")
                    
    ax.set_title("XGBoost Arrhythmia (Model 2) Confusion Matrix", fontsize=12, fontweight='bold')
    ax.set_xlabel("Predicted Beat Label")
    ax.set_ylabel("True Beat Label")
    
    plt.tight_layout()
    cm_path = os.path.join(save_dir, "confusion_matrix_m2.png")
    plt.savefig(cm_path, dpi=150)
    plt.close()
    
    # 2. ROC Curve
    fpr, tpr, _ = roc_curve(y_test, y_prob[:, 1])
    roc_auc = auc(fpr, tpr)
    
    plt.figure(figsize=(9, 7))
    plt.plot(fpr, tpr, color='#e06666', lw=2, label=f"Arrhythmia class (AUC = {roc_auc:.4f})")
    plt.plot([0, 1], [0, 1], 'k--', lw=1.5)
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel("False Positive Rate (FPR)")
    plt.ylabel("True Positive Rate (TPR)")
    plt.title("XGBoost Arrhythmia ROC Curve (Unseen Record 106)", fontsize=12, fontweight='bold')
    plt.legend(loc="lower right")
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    roc_path = os.path.join(save_dir, "roc_curve_m2.png")
    plt.savefig(roc_path, dpi=150)
    plt.close()
    
    # 3. SHAP Feature Importance
    logger.info("Plotting Model 2 SHAP Feature Importance...")
    try:
        explainer_path = os.path.join(save_dir, "arrhythmia_shap_explainer.pkl")
        if os.path.exists(explainer_path):
            with open(explainer_path, 'rb') as f:
                explainer = pickle.load(f)
        else:
            explainer = shap.TreeExplainer(model)
            
        shap_vals = explainer.shap_values(X_test_scaled)
        
        plt.figure(figsize=(9, 6))
        shap_input = shap_vals[1] if isinstance(shap_vals, list) else shap_vals
        shap.summary_plot(shap_input, X_test_scaled, feature_names=selected_features, plot_type="bar", show=False)
        plt.title("Arrhythmia Model 2 SHAP Global Feature Importance", fontsize=12, fontweight='bold')
        plt.tight_layout()
        shap_path = os.path.join(save_dir, "shap_importance_m2.png")
        plt.savefig(shap_path, dpi=150)
        plt.close()
    except Exception as e:
        logger.error(f"Failed to generate Model 2 SHAP plot: {e}")
        plt.figure(figsize=(9, 6))
        importances = pd.Series(model.feature_importances_, index=selected_features).sort_values()
        importances.plot(kind='barh', color='#e06666')
        plt.title("XGBoost Arrhythmia Model 2 Gini Feature Importance", fontsize=12, fontweight='bold')
        plt.xlabel("Gini Importance Score")
        plt.tight_layout()
        shap_path = os.path.join(save_dir, "shap_importance_m2.png")
        plt.savefig(shap_path, dpi=150)
        plt.close()

if __name__ == "__main__":
    generate_ecg_waveform_plot(DATA_DIR, SAVED_MODELS_DIR)
    generate_model_1_plots(DATA_DIR, SAVED_MODELS_DIR)
    generate_model_2_plots(DATA_DIR, SAVED_MODELS_DIR)
