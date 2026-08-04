import os
import pandas as pd
import numpy as np
import wfdb
from typing import Tuple, List
from AI.utils.logger import get_logger

logger = get_logger("load_dataset")

def load_database_csv(data_dir: str) -> pd.DataFrame:
    """
    Load the ptbxl_database.csv from the specified directory.
    """
    csv_path = os.path.join(data_dir, "ptbxl_database.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Database metadata not found at {csv_path}. Please run download_dataset.py first.")
    
    logger.info(f"Loading database metadata from {csv_path}...")
    return pd.read_csv(csv_path, index_col='ecg_id')

def load_ecg_signal(rel_path: str, data_dir: str) -> Tuple[np.ndarray, List[str]]:
    """
    Load a raw 12-lead ECG signal using wfdb.
    Returns:
        signal: NumPy array of shape (num_samples, 12)
        lead_names: List of lead names matching the columns of the signal
    """
    abs_path = os.path.join(data_dir, rel_path)
    if not os.path.exists(abs_path + ".hea"):
        raise FileNotFoundError(f"WFDB header file not found at {abs_path}.hea")
    
    try:
        record = wfdb.rdrecord(abs_path)
        return record.p_signal, record.sig_name
    except Exception as e:
        logger.error(f"Failed to load ECG signal at {abs_path}: {e}")
        raise e
