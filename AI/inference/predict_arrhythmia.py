import os
import pickle
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List

from AI.utils.config import SAVED_MODELS_DIR, MIT_SAMPLING_RATE
from AI.utils.logger import get_logger
from AI.explainability.shap_explainer import load_or_create_explainer, get_prediction_explanation

logger = get_logger("predict_arrhythmia")

class ArrhythmiaInferencePipeline:
    def __init__(self, models_dir: str = SAVED_MODELS_DIR):
        """
        Load saved arrhythmia models, scaler, feature names list, and SHAP explainer.
        """
        self.models_dir = models_dir
        
        # Paths
        model_path = os.path.join(models_dir, "arrhythmia_model.pkl")
        scaler_path = os.path.join(models_dir, "arrhythmia_scaler.pkl")
        features_path = os.path.join(models_dir, "arrhythmia_selected_features.json")
        
        # Assert files exist
        for path in [model_path, scaler_path, features_path]:
            if not os.path.exists(path):
                raise FileNotFoundError(f"Required arrhythmia model artifact not found: {path}. Please train Model 2 first.")
                
        # Load artifacts
        with open(model_path, 'rb') as f:
            self.model = pickle.load(f)
            
        with open(scaler_path, 'rb') as f:
            self.scaler = pickle.load(f)
            
        with open(features_path, 'r') as f:
            self.selected_features = json.load(f)
            
        # Set up SHAP TreeExplainer
        self.explainer = load_or_create_explainer(self.model)
        
        logger.info("Arrhythmia Inference Pipeline successfully loaded.")
        
    def predict_beat(self, beat_features: Dict[str, float]) -> Dict[str, Any]:
        """
        Predict arrhythmia risk for a single heartbeat given its features.
        Must contain all features specified in arrhythmia_selected_features.json.
        """
        # Ensure all features are present
        missing_features = [f for f in self.selected_features if f not in beat_features]
        if missing_features:
            raise ValueError(f"Arrhythmia feature vector is missing fields: {missing_features}")
            
        # Construct feature DataFrame in the EXACT order of training
        feature_df = pd.DataFrame([[beat_features[feat] for feat in self.selected_features]], columns=self.selected_features)
        
        # Scale features
        scaled_vector = self.scaler.transform(feature_df)
        
        # Predict class probabilities
        probs = self.model.predict_proba(scaled_vector)[0]
        pred_idx = np.argmax(probs)
        
        classes = ['Normal Beat', 'Arrhythmia']
        pred_class = classes[pred_idx]
        confidence = float(probs[pred_idx])
        
        # Format probabilities dictionary
        probs_dict = {
            cls: float(prob) for cls, prob in zip(classes, probs)
        }
        
        # Clinical message disclaimer
        if pred_class == 'Normal Beat':
            message = "The heartbeat features indicate a normal cardiac beat. This is a risk estimation only and not a clinical diagnosis."
        else:
            message = "WARNING: The heartbeat features indicate an increased probability of Arrhythmia (such as PVC/PAC). Please consult a cardiologist immediately."
            
        # Get SHAP explanation
        explanation = get_prediction_explanation(
            explainer=self.explainer,
            model=self.model,
            scaled_feature_vector=scaled_vector,
            feature_names=self.selected_features,
            predicted_class_idx=pred_idx
        )
        
        # Format output
        output = {
            "prediction": pred_class,
            "probability": probs_dict,
            "confidence": confidence,
            "message": message,
            "top_features": explanation["top_features"],
            "shap_values": explanation["shap_values"]
        }
        
        return output

    def predict_from_signal_window(
        self, 
        signal_channel: np.ndarray, 
        peak_idx: int, 
        pre_peak_idx: int, 
        post_peak_idx: int, 
        fs: float = MIT_SAMPLING_RATE
    ) -> Dict[str, Any]:
        """
        Predict arrhythmia risk directly from raw signal and peak indices on the fly.
        """
        win_left = int(0.25 * fs)
        win_right = int(0.25 * fs)
        
        if peak_idx - win_left < 0 or peak_idx + win_right >= len(signal_channel):
            raise ValueError("Beat window exceeds signal bounds.")
            
        # Extract features on the fly
        window = signal_channel[peak_idx - win_left : peak_idx + win_right]
        window_detrend = window - np.mean(window)
        
        pre_rr = (peak_idx - pre_peak_idx) / fs
        post_rr = (post_peak_idx - peak_idx) / fs
        rr_ratio = pre_rr / (post_rr + 1e-8)
        
        peak_amp = float(signal_channel[peak_idx] - np.mean(window))
        rms_amp = float(np.sqrt(np.mean(window_detrend ** 2)))
        
        # QRS width
        search_range = int(0.04 * fs)
        try:
            q_valley = peak_idx - search_range + np.argmin(signal_channel[peak_idx - search_range : peak_idx])
            s_valley = peak_idx + np.argmin(signal_channel[peak_idx : peak_idx + search_range])
            qrs_width = float((s_valley - q_valley) / fs)
        except Exception:
            qrs_width = 0.08
            
        # Spectral
        fft_vals = np.abs(np.fft.rfft(window_detrend))
        freqs = np.fft.rfftfreq(len(window_detrend), d=1.0/fs)
        
        lf_mask = (freqs >= 2.0) & (freqs < 10.0)
        hf_mask = (freqs >= 10.0) & (freqs <= 40.0)
        
        lf_power = float(np.sum(fft_vals[lf_mask])) if np.any(lf_mask) else 0.0
        hf_power = float(np.sum(fft_vals[hf_mask])) if np.any(hf_mask) else 0.0
        
        beat_features = {
            'Pre_RR': pre_rr,
            'Post_RR': post_rr,
            'RR_Ratio': rr_ratio,
            'QRS_Width': qrs_width,
            'Peak_Amplitude': peak_amp,
            'RMS_Amplitude': rms_amp,
            'LF_Power': lf_power,
            'HF_Power': hf_power
        }
        
        return self.predict_beat(beat_features)

# Direct execution dry-run demo
if __name__ == "__main__":
    try:
        pipeline = ArrhythmiaInferencePipeline()
        mock_features = {feat: 0.1 for feat in pipeline.selected_features}
        result = pipeline.predict_beat(mock_features)
        print("Arrhythmia Pipeline Dry-Run Result:")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Cannot perform dry-run arrhythmia prediction: {e}")
