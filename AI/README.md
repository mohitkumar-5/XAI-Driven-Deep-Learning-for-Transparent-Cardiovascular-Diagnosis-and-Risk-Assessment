# DeepCardio-XAI: AI Pipeline & Architecture

This directory houses the complete Machine Learning (ML), Deep Learning (DL), and Explainable AI (XAI) pipeline for cardiovascular arrhythmia detection and risk assessment.

---

## 🏗️ Pipeline Directory Structure

```
AI/
├── preprocessing/          # Signal filtering (Bandpass, Notch), Denoising & Normalization
│   ├── signal_filtering.py # 0.5-40Hz Bandpass & 50Hz Notch filter
│   ├── normalization.py    # Z-score & MinMax signal scaling
│   ├── label_processing.py # Multi-label diagnostic classification (NORM, MI, STTC, CD, HYP)
│   └── load_dataset.py     # PTB-XL & MIT-BIH dataset loader
│
├── feature_extraction/     # Time-Domain, Frequency-Domain (HRV), & ECG Wave Morphologies
│   ├── time_domain.py      # MeanRR, SDNN, RMSSD calculation
│   ├── frequency_domain.py # LF, HF, LF/HF ratio spectral analysis
│   ├── morphology.py       # QRS duration, ST-segment elevation, PR interval
│   ├── r_peak_detection.py # Pan-Tompkins & Hamilton R-peak detectors
│   └── build_features.py   # Full feature matrix builder
│
├── training/               # Neural Network Architecture & Model Training
│   ├── train_deep.py       # 1D-CNN + BiLSTM Deep Learning Model
│   ├── evaluate.py         # ROC-AUC, Precision, Recall & F1-Score evaluation
│   └── cross_validation.py # Stratified K-Fold CV pipeline
│
├── explainability/         # Explainable AI (XAI) Attribution Modules
│   └── shap_explainer.py   # SHAP (SHapley Additive exPlanations) Kernel & Tree Explainer
│
├── inference/              # Production ONNX Real-Time Inference
│   └── predict.py          # Real-time ECG signal classification pipeline
│
├── saved_models/           # Pre-trained ONNX Model Artifacts
│   ├── deep_ecg.onnx       # Optimized 1D-CNN + BiLSTM ONNX model
│   ├── label_encoder.pkl   # Diagnostic class mapping
│   └── selected_features.json # Calibrated feature weights
│
└── utils/                  # Configuration & Logging Utilities
    ├── config.py           # Hyperparameters & sampling rate configurations
    └── logger.py           # Pipeline logger
```

---

## 📊 1. Data Preprocessing & Signal Filtering
Raw ECG signals (500 Hz / 360 Hz) undergo multi-stage filtering:
- **Bandpass Filter:** `0.5 Hz - 40.0 Hz` (Butterworth 4th order) to eliminate baseline wander and high-frequency muscle noise.
- **Notch Filter:** `50.0 Hz` / `60.0 Hz` to remove powerline interference.
- **Z-Score Normalization:** Standardizes amplitude variations across different patient recordings.

## 🔬 2. Feature Extraction & Morphological Analysis
- **Heart Rate Variability (HRV):** SDNN, RMSSD, pNN50.
- **Spectral Power:** Low Frequency (LF: 0.04–0.15 Hz), High Frequency (HF: 0.15–0.40 Hz), LF/HF Ratio.
- **Waveform Morphology:** QRS Complex width, ST-elevation/depression, QT interval.

## 🧠 3. Deep Learning Architecture (1D-CNN + BiLSTM)
Combines spatial feature extraction from **1D Convolutional layers** with temporal rhythm tracking from **Bidirectional LSTM (BiLSTM)** networks.

## 🔍 4. Explainable AI (SHAP & Grad-CAM)
- **SHAP (SHapley Additive exPlanations):** Quantifies feature contribution values for each vital metric (Heart Rate, SpO2, Temp, GSR).
- **Grad-CAM (Gradient-Weighted Class Activation Mapping):** Highlights exact sub-second regions in the ECG waveform that contributed to the model's prediction.
