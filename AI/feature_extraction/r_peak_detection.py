import numpy as np
import neurokit2 as nk
from AI.utils.logger import get_logger

logger = get_logger("r_peak_detection")

def detect_r_peaks(ecg_cleaned: np.ndarray, fs: float, method: str = 'neurokit') -> np.ndarray:
    """
    Detect R-peaks in a cleaned, single-channel ECG signal.
    Returns:
        Array of indices (integers) corresponding to R-peak locations.
    """
    try:
        # NeuroKit2 ecg_findpeaks expects a 1D array
        if ecg_cleaned.ndim > 1:
            ecg_cleaned = ecg_cleaned.squeeze()
            
        peaks_dict = nk.ecg_findpeaks(ecg_cleaned, sampling_rate=fs, method=method)
        r_peaks = peaks_dict.get("ECG_R_Peaks", np.array([]))
        
        if len(r_peaks) == 0:
            logger.warning("No R-peaks detected in the ECG signal.")
            
        return r_peaks
    except Exception as e:
        logger.error(f"Error during R-peak detection: {e}")
        return np.array([], dtype=int)
