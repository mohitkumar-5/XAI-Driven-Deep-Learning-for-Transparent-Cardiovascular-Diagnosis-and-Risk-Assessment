import os
import numpy as np
import wfdb
from typing import Tuple, List
from AI.utils.config import MIT_DATA_DIR
from AI.utils.logger import get_logger

logger = get_logger("load_mitdb")

def load_mit_record(record_name: str) -> Tuple[np.ndarray, np.ndarray, List[str], float]:
    """
    Load an MIT-BIH record: signal and annotations.
    Returns:
        signal: NumPy array of shape (num_samples, 2)
        r_peaks: NumPy array containing sample indices of R-peaks
        symbols: List of annotation symbols corresponding to each R-peak
        fs: Sampling rate (should be 360 Hz)
    """
    record_path = os.path.join(MIT_DATA_DIR, record_name)
    
    if not os.path.exists(record_path + ".hea"):
        raise FileNotFoundError(f"MIT-BIH header file not found at {record_path}.hea")
        
    try:
        # Load signal
        record = wfdb.rdrecord(record_path)
        signal = record.p_signal
        fs = record.fs
        
        # Load annotations
        annotation = wfdb.rdann(record_path, 'atr')
        r_peaks = annotation.sample
        symbols = annotation.symbol
        
        return signal, r_peaks, symbols, fs
    except Exception as e:
        logger.error(f"Failed to load MIT-BIH record {record_name}: {e}")
        raise e
