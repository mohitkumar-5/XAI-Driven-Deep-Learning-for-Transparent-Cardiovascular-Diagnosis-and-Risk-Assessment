# Model Evaluation & Signal Processing Plots

This directory contains evaluation metrics, ROC curves, confusion matrices, and Explainable AI (SHAP) visualization plots generated during model validation and signal filtering.

---

## 📈 Evaluation Visualizations

| Plot File | Category | Description |
| :--- | :--- | :--- |
| **`roc_curve.png`** | Model Performance | Receiver Operating Characteristic (ROC) curve showing True Positive Rate vs False Positive Rate across multi-class diagnostic categories. |
| **`confusion_matrix.png`** | Classification Accuracy | Multi-class confusion matrix displaying prediction accuracy for Normal, Arrhythmia, MI, STTC, CD, and HYP conditions. |
| **`shap_importance.png`** | Explainable AI (XAI) | SHAP (SHapley Additive exPlanations) summary plot ranking feature contributions (Heart Rate, SpO2, Temp, GSR). |
| **`sample_ecg_plot.png`** | Signal Preprocessing | Raw vs Bandpass-Filtered (0.5 - 40 Hz) ECG waveform comparison. |
| **`ptbxl_correlation_matrix.png`** | Exploratory Data Analysis | Comprehensive correlation heatmap combining extracted ECG signal features, HRV metrics, patient demographics, and target classes. |
| **`ptbxl_features_correlation.png`** | Feature Analysis | Dedicated correlation matrix heatmap for ECG physiological & Heart Rate Variability (HRV) features. |
