import numpy as np
import neurokit2 as nk
from typing import Dict
from scipy.signal import welch
from AI.utils.logger import get_logger

logger = get_logger("frequency_domain")

def extract_frequency_domain_features(r_peaks: np.ndarray, fs: float) -> Dict[str, float]:
    """
    Extract frequency-domain HRV features from R-peaks.
    Features: LF (Low Frequency power), HF (High Frequency power), LFHF (ratio)
    """
    defaults = {
        'LF': 100.0,
        'HF': 100.0,
        'LFHF': 1.0
    }
    
    if len(r_peaks) < 5:
        logger.warning("Insufficient R-peaks (< 5) for frequency-domain analysis. Returning defaults.")
        return defaults
        
    lf = 0.0
    hf = 0.0
    lf_hf = 1.0
    
    # Try NeuroKit2 first
    try:
        # Note: 10s recordings are technically short for frequency analysis,
        # but we use Lomb-Scargle FFT to estimate PSD
        freq_df = nk.hrv_frequency(r_peaks, sampling_rate=fs)
        
        # Check column names as they differ across versions
        if 'HRV_LF' in freq_df.columns:
            lf = float(freq_df['HRV_LF'].iloc[0])
        elif 'LF' in freq_df.columns:
            lf = float(freq_df['LF'].iloc[0])
            
        if 'HRV_HF' in freq_df.columns:
            hf = float(freq_df['HRV_HF'].iloc[0])
        elif 'HF' in freq_df.columns:
            hf = float(freq_df['HF'].iloc[0])
            
        if 'HRV_LFHF' in freq_df.columns:
            lf_hf = float(freq_df['HRV_LFHF'].iloc[0])
        elif 'LFHF' in freq_df.columns:
            lf_hf = float(freq_df['LFHF'].iloc[0])
        elif hf > 0:
            lf_hf = lf / hf
            
        # Clean up any NaN or Inf results from NeuroKit2 calculations
        if np.isnan(lf) or np.isinf(lf):
            lf = 100.0
        if np.isnan(hf) or np.isinf(hf):
            hf = 100.0
        if np.isnan(lf_hf) or np.isinf(lf_hf):
            lf_hf = lf / hf if hf > 0 else 1.0
            
        return {'LF': lf, 'HF': hf, 'LFHF': lf_hf}
    except Exception as e:
        logger.warning(f"NeuroKit2 hrv_frequency failed: {e}. Executing manual Welch PSD interpolation.")
        
    # Manual Welch PSD Fallback
    try:
        rr_intervals = np.diff(r_peaks) / fs
        rr_times = np.cumsum(rr_intervals)
        rr_times = rr_times - rr_times[0]
        
        if len(rr_times) >= 4:
            # Interpolate at 4Hz to get a regularly sampled time series
            fs_interp = 4.0
            t_interp = np.arange(0, rr_times[-1], 1.0 / fs_interp)
            rr_interp = np.interp(t_interp, rr_times, rr_intervals)
            
            # Detrend
            rr_interp = rr_interp - np.mean(rr_interp)
            
            # Calculate PSD
            nperseg = min(len(rr_interp), 256)
            f, psd = welch(rr_interp, fs=fs_interp, nperseg=nperseg)
            
            # Power in LF (0.04 - 0.15 Hz) and HF (0.15 - 0.40 Hz) bands
            lf_band = (f >= 0.04) & (f < 0.15)
            hf_band = (f >= 0.15) & (f <= 0.40)
            
            # Integrate using trapezoidal rule
            lf = float(np.trapz(psd[lf_band], f[lf_band])) if np.any(lf_band) else 100.0
            hf = float(np.trapz(psd[hf_band], f[hf_band])) if np.any(hf_band) else 100.0
            lf_hf = lf / hf if hf > 0 else 1.0
            
            return {'LF': lf, 'HF': hf, 'LFHF': lf_hf}
    except Exception as e:
        logger.error(f"Manual frequency extraction failed: {e}. Returning default values.")
        
    return defaults
