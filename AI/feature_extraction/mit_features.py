import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from AI.utils.logger import get_logger

logger = get_logger("mit_features")

# Mapping of MIT-BIH symbols to binary labels
# 0: Normal / conduction-normal beats
# 1: Arrhythmic premature beats (PVC, PAC, etc.)
LABEL_MAP = {
    'N': 0, 'L': 0, 'R': 0, 'e': 0, 'j': 0,  # Normal, bundle branch blocks, escape beats
    'V': 1, 'A': 1, 'a': 1, 'J': 1, 'S': 1, 'F': 1, 'E': 1, '/': 1, 'f': 1  # PVCs, PACs, escape/junctional/fusion arrhythmic beats
}

def extract_beat_features(signal_channel: np.ndarray, r_peaks: np.ndarray, symbols: List[str], fs: float) -> Tuple[pd.DataFrame, np.ndarray]:
    """
    Extract beat-level temporal, morphological, and spectral features.
    """
    logger.info("Extracting beat-level features from MIT-BIH record...")
    
    features_list = []
    labels = []
    
    # Define window size around R-peak: 250ms before and 250ms after
    # At 360 Hz, 250ms = 90 samples
    win_left = int(0.25 * fs)
    win_right = int(0.25 * fs)
    
    # Loop over beats (excluding first and last to handle pre/post-RR)
    for i in range(1, len(r_peaks) - 1):
        symbol = symbols[i]
        
        # Check if the symbol is in our mapping
        if symbol not in LABEL_MAP:
            continue
            
        peak_idx = r_peaks[i]
        
        # Boundary check for beat window extraction
        if peak_idx - win_left < 0 or peak_idx + win_right >= len(signal_channel):
            continue
            
        # Extract beat window
        window = signal_channel[peak_idx - win_left : peak_idx + win_right]
        # Remove baseline drift by detrending (subtracting mean)
        window_detrend = window - np.mean(window)
        
        # 1. Temporal Features
        pre_rr = (r_peaks[i] - r_peaks[i-1]) / fs
        post_rr = (r_peaks[i+1] - r_peaks[i]) / fs
        rr_ratio = pre_rr / (post_rr + 1e-8)
        
        # 2. Morphological Features
        peak_amp = float(signal_channel[peak_idx] - np.mean(window))
        rms_amp = float(np.sqrt(np.mean(window_detrend ** 2)))
        
        # Estimate QRS width: find local minima (valleys) around peak
        # Q valley: look in the 40ms before the peak
        # S valley: look in the 40ms after the peak
        search_range = int(0.04 * fs) # ~14 samples
        
        try:
            q_valley = peak_idx - search_range + np.argmin(signal_channel[peak_idx - search_range : peak_idx])
            s_valley = peak_idx + np.argmin(signal_channel[peak_idx : peak_idx + search_range])
            qrs_width = float((s_valley - q_valley) / fs)
        except Exception:
            qrs_width = 0.08  # clinical default
            
        # 3. Spectral Features (FFT power bands)
        fft_vals = np.abs(np.fft.rfft(window_detrend))
        freqs = np.fft.rfftfreq(len(window_detrend), d=1.0/fs)
        
        lf_mask = (freqs >= 2.0) & (freqs < 10.0)
        hf_mask = (freqs >= 10.0) & (freqs <= 40.0)
        
        lf_power = float(np.sum(fft_vals[lf_mask])) if np.any(lf_mask) else 0.0
        hf_power = float(np.sum(fft_vals[hf_mask])) if np.any(hf_mask) else 0.0
        
        # Assemble feature dict
        feat_dict = {
            'Pre_RR': pre_rr,
            'Post_RR': post_rr,
            'RR_Ratio': rr_ratio,
            'QRS_Width': qrs_width,
            'Peak_Amplitude': peak_amp,
            'RMS_Amplitude': rms_amp,
            'LF_Power': lf_power,
            'HF_Power': hf_power
        }
        
        features_list.append(feat_dict)
        labels.append(LABEL_MAP[symbol])
        
    df_feats = pd.DataFrame(features_list)
    y = np.array(labels)
    
    logger.info(f"Extracted {len(df_feats)} beats. Arrhythmia class distribution: {np.bincount(y)}")
    return df_feats, y
