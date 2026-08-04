import numpy as np
import neurokit2 as nk
from typing import Dict
from AI.utils.logger import get_logger

logger = get_logger("morphology")

def extract_morphological_features(ecg_cleaned: np.ndarray, r_peaks: np.ndarray, fs: float) -> Dict[str, float]:
    """
    Extract morphological features: QRS Duration, QT Interval, and R Peak Amplitude.
    """
    # 1. R-Peak Amplitude (normalized signal)
    if len(r_peaks) > 0:
        r_amplitudes = ecg_cleaned[r_peaks]
        mean_r_amp = float(np.mean(r_amplitudes))
    else:
        mean_r_amp = 0.0

    # Default morphological values (seconds)
    qrs_duration = 0.09
    qt_interval = 0.40

    if len(r_peaks) >= 3:
        try:
            # Squeeze signal to 1D
            sig_1d = ecg_cleaned.squeeze() if ecg_cleaned.ndim > 1 else ecg_cleaned
            
            # Delineate waves using Discrete Wavelet Transform ('dwt') for precise onset/offset
            _, waves = nk.ecg_delineate(sig_1d, r_peaks, sampling_rate=fs, method='dwt')
            
            # Extract wave bounds (indices of events)
            r_onsets = waves.get('ECG_R_Onsets', [])
            r_offsets = waves.get('ECG_R_Offsets', [])
            t_offsets = waves.get('ECG_T_Offsets', [])
            
            # Convert to float arrays to support NaN checking
            r_onsets = np.array(r_onsets, dtype=float)
            r_offsets = np.array(r_offsets, dtype=float)
            t_offsets = np.array(t_offsets, dtype=float)
            
            # Calculate QRS durations
            valid_qrs = []
            for ons, offs in zip(r_onsets, r_offsets):
                if np.isnan(ons) or np.isnan(offs):
                    continue
                dur = (offs - ons) / fs
                # Basic physiological check (30ms to 300ms)
                if 0.03 <= dur <= 0.30:
                    valid_qrs.append(dur)
            
            if len(valid_qrs) > 0:
                qrs_duration = float(np.mean(valid_qrs))
                
            # Calculate QT intervals
            valid_qt = []
            for ons, t_off in zip(r_onsets, t_offsets):
                if np.isnan(ons) or np.isnan(t_off):
                    continue
                qt = (t_off - ons) / fs
                # Basic physiological check (200ms to 700ms)
                if 0.20 <= qt <= 0.70:
                    valid_qt.append(qt)
            
            if len(valid_qt) > 0:
                qt_interval = float(np.mean(valid_qt))
                
        except Exception as e:
            logger.warning(f"Wave delineation failed: {e}. Using physiological default fallbacks.")
            
    return {
        'QRS': qrs_duration,
        'QT': qt_interval,
        'Amplitude': mean_r_amp
    }
