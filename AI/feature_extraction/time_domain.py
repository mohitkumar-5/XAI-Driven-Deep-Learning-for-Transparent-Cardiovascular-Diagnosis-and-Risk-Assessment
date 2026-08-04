import numpy as np
import neurokit2 as nk
from typing import Dict
from AI.utils.logger import get_logger

logger = get_logger("time_domain")

def extract_time_domain_features(r_peaks: np.ndarray, fs: float) -> Dict[str, float]:
    """
    Extract time-domain HRV and heart rate features from R-peak locations.
    Features: HeartRate, MeanRR, RRStd, SDNN, RMSSD
    """
    defaults = {
        'HeartRate': 70.0,
        'MeanRR': 0.85,
        'RRStd': 0.05,
        'SDNN': 50.0,
        'RMSSD': 30.0
    }
    
    if len(r_peaks) < 2:
        logger.warning("Insufficient R-peaks (< 2) for time-domain feature extraction. Returning defaults.")
        return defaults

    # Calculate RR intervals in seconds
    rr_intervals = np.diff(r_peaks) / fs
    
    mean_rr = np.mean(rr_intervals)
    std_rr = np.std(rr_intervals)
    heart_rate = 60.0 / mean_rr if mean_rr > 0 else 70.0
    
    # Try using NeuroKit2 for clinical SDNN and RMSSD
    try:
        hrv_df = nk.hrv_time(r_peaks, sampling_rate=fs)
        # NeuroKit2 returns SDNN and RMSSD in milliseconds
        sdnn = hrv_df['HRV_SDNN'].iloc[0]
        rmssd = hrv_df['HRV_RMSSD'].iloc[0]
    except Exception as e:
        logger.warning(f"NeuroKit2 hrv_time failed: {e}. Calculating manually.")
        sdnn = std_rr * 1000.0  # convert to ms
        rmssd = np.sqrt(np.mean(np.diff(rr_intervals * 1000.0) ** 2))
        
    # Standardize output types to float
    return {
        'HeartRate': float(heart_rate),
        'MeanRR': float(mean_rr),
        'RRStd': float(std_rr),
        'SDNN': float(sdnn),
        'RMSSD': float(rmssd)
    }
