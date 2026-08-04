import scipy.signal
import numpy as np
from AI.utils.logger import get_logger

logger = get_logger("signal_filtering")

def remove_baseline_wander(signal: np.ndarray, fs: float) -> np.ndarray:
    """
    Remove baseline wander using a high-pass Butterworth filter.
    A cutoff of 0.5 Hz is standard to remove breathing/motion artifacts.
    """
    nyq = 0.5 * fs
    low = 0.5 / nyq
    b, a = scipy.signal.butter(N=3, Wn=low, btype='highpass')
    # Filter along the first axis (samples)
    return scipy.signal.filtfilt(b, a, signal, axis=0)

def bandpass_filter(signal: np.ndarray, fs: float, lowcut: float = 0.5, highcut: float = 40.0) -> np.ndarray:
    """
    Apply a Butterworth bandpass filter.
    Standard ECG clinical band: 0.5 Hz to 40 Hz.
    """
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = scipy.signal.butter(N=4, Wn=[low, high], btype='bandpass')
    return scipy.signal.filtfilt(b, a, signal, axis=0)

def notch_filter(signal: np.ndarray, fs: float, notch_freq: float = 50.0, Q: float = 30.0) -> np.ndarray:
    """
    Apply an IIR notch filter to remove powerline noise (50 Hz).
    """
    nyq = 0.5 * fs
    w0 = notch_freq / nyq
    b, a = scipy.signal.iirnotch(w0, Q)
    return scipy.signal.filtfilt(b, a, signal, axis=0)

def filter_ecg(signal: np.ndarray, fs: float, lowcut: float = 0.5, highcut: float = 40.0, notch_freq: float = 50.0) -> np.ndarray:
    """
    Complete filtering pipeline:
    Raw ECG -> Baseline Wander Removal -> Band-pass Filter -> Notch Filter.
    """
    # 1. Baseline wander removal
    signal_no_bw = remove_baseline_wander(signal, fs)
    # 2. Band-pass filtering
    signal_bp = bandpass_filter(signal_no_bw, fs, lowcut, highcut)
    # 3. Notch filtering
    signal_clean = notch_filter(signal_bp, fs, notch_freq)
    return signal_clean
