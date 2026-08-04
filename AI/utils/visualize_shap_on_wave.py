import os
import sys
import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any

# Add workspace root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from AI.utils.config import SAVED_MODELS_DIR
from AI.utils.logger import get_logger
from AI.preprocessing.load_mitdb import load_mit_record
from AI.inference.predict_arrhythmia import ArrhythmiaInferencePipeline

logger = get_logger("visualize_shap_on_wave")

def generate_shap_on_wave_plot():
    logger.info("Initializing Arrhythmia Pipeline to get SHAP values for a real PVC beat...")
    pipeline = ArrhythmiaInferencePipeline()
    
    # Load MIT-BIH record 106 (contains many PVC beats)
    signal, r_peaks, symbols, fs = load_mit_record('106')
    lead_signal = signal[:, 0]
    
    # Find a Premature Ventricular Contraction (PVC, symbol 'V')
    pvc_idx = None
    win_left = int(0.25 * fs)
    win_right = int(0.25 * fs)
    
    for i in range(2, len(r_peaks) - 2):
        peak_idx = r_peaks[i]
        if peak_idx - win_left >= 0 and peak_idx + win_right < len(lead_signal):
            if symbols[i] == 'V':
                pvc_idx = i
                break
                
    if pvc_idx is None:
        logger.error("Could not find a PVC beat in record 106. Plot aborted.")
        return
        
    # Extract features and get prediction with SHAP values
    peak_idx = r_peaks[pvc_idx]
    pre_peak_idx = r_peaks[pvc_idx-1]
    post_peak_idx = r_peaks[pvc_idx+1]
    
    result = pipeline.predict_from_signal_window(
        signal_channel=lead_signal,
        peak_idx=peak_idx,
        pre_peak_idx=pre_peak_idx,
        post_peak_idx=post_peak_idx,
        fs=fs
    )
    
    # Extract signals for plotting
    # Plot from pre_peak_idx to post_peak_idx (shows the preceding and succeeding intervals)
    plot_start = pre_peak_idx
    plot_end = post_peak_idx
    crop_signal = lead_signal[plot_start:plot_end]
    t = (np.arange(plot_start, plot_end) - peak_idx) / fs # seconds relative to target R-peak
    
    # Locate valleys for QRS complex relative to target peak
    search_range = int(0.04 * fs) # ~14 samples
    q_valley = peak_idx - search_range + np.argmin(lead_signal[peak_idx - search_range : peak_idx])
    s_valley = peak_idx + np.argmin(lead_signal[peak_idx : peak_idx + search_range])
    
    q_t = (q_valley - peak_idx) / fs
    s_t = (s_valley - peak_idx) / fs
    
    # Draw plot
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(t, crop_signal, color='black', linewidth=2, label="ECG Lead II Waveform")
    
    # 1. Highlight Pre-RR Interval (Preceding beat interval)
    pre_rr_shap = result['shap_values']['Pre_RR']
    pre_rr_color = '#e06666' if pre_rr_shap > 0 else '#3d85c6'
    pre_rr_t_start = (pre_peak_idx - peak_idx) / fs
    pre_rr_t_end = q_t
    ax.axvspan(pre_rr_t_start, pre_rr_t_end, color=pre_rr_color, alpha=0.2, 
               label=f"Pre-RR Interval (SHAP: {pre_rr_shap:+.3f})")
               
    # 2. Highlight QRS Width (Ventricular contraction complex)
    qrs_shap = result['shap_values']['QRS_Width']
    qrs_color = '#e06666' if qrs_shap > 0 else '#3d85c6'
    ax.axvspan(q_t, s_t, color=qrs_color, alpha=0.5, 
               label=f"QRS Complex Width (SHAP: {qrs_shap:+.3f})")
               
    # 3. Highlight Peak Amplitude
    amp_shap = result['shap_values']['Peak_Amplitude']
    amp_color = 'red' if amp_shap > 0 else 'blue'
    target_t = 0.0 # R-peak is at 0.0
    ax.scatter([target_t], [lead_signal[peak_idx]], color=amp_color, marker='o', s=120, zorder=5,
               label=f"Peak R Amplitude (SHAP: {amp_shap:+.3f})")
    ax.annotate(f"R-peak\nSHAP: {amp_shap:+.3f}", xy=(target_t, lead_signal[peak_idx]), 
                xytext=(target_t + 0.05, lead_signal[peak_idx] + 0.1),
                arrowprops=dict(facecolor=amp_color, shrink=0.05, width=1.5, headwidth=6))

    # 4. Highlight Post-RR Interval (Succeeding beat interval)
    post_rr_shap = result['shap_values']['Post_RR']
    post_rr_color = '#e06666' if post_rr_shap > 0 else '#3d85c6'
    post_rr_t_start = s_t
    post_rr_t_end = (post_peak_idx - peak_idx) / fs
    ax.axvspan(post_rr_t_start, post_rr_t_end, color=post_rr_color, alpha=0.15,
               label=f"Post-RR Interval (SHAP: {post_rr_shap:+.3f})")

    # Add labels and style
    ax.set_title(f"Grad-CAM Equivalent: Tabulo-Spatial SHAP Mapping on PVC Beat (Record 106)\n"
                 f"Model Prediction: {result['prediction']} (Confidence: {result['confidence']:.2%})", 
                 fontsize=13, fontweight='bold')
    ax.set_xlabel("Time (seconds relative to target R-peak)")
    ax.set_ylabel("Signal Amplitude (mV)")
    ax.grid(True, linestyle='--', alpha=0.5)
    
    # Place Legend in a clean spot
    ax.legend(loc='lower left', framealpha=0.9)
    
    # Adjust axes limits to fit everything neatly
    ax.set_xlim([t[0] - 0.05, t[-1] + 0.05])
    
    plt.tight_layout()
    save_path = os.path.join(SAVED_MODELS_DIR, "arrhythmia_shap_on_wave.png")
    plt.savefig(save_path, dpi=150)
    plt.close()
    logger.info(f"Successfully generated and saved SHAP waveform overlay plot to {save_path}")

if __name__ == "__main__":
    generate_shap_on_wave_plot()
