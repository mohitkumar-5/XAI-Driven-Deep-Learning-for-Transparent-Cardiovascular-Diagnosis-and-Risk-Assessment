import os
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

from AI.utils.config import SAMPLING_RATE, ECG_LEAD, INITIAL_FEATURES
from AI.utils.logger import get_logger
from AI.preprocessing.load_dataset import load_ecg_signal
from AI.preprocessing.signal_filtering import filter_ecg
from AI.preprocessing.normalization import z_score_normalize
from AI.feature_extraction.r_peak_detection import detect_r_peaks
from AI.feature_extraction.time_domain import extract_time_domain_features
from AI.feature_extraction.morphology import extract_morphological_features
from AI.feature_extraction.frequency_domain import extract_frequency_domain_features

logger = get_logger("build_features")

def extract_features_single_lead(lead_signal: np.ndarray, fs: float) -> Dict[str, float]:
    """
    Apply preprocessing and feature extraction on a single-channel ECG signal.
    """
    # 1. Filtering
    filtered = filter_ecg(lead_signal, fs)
    # 2. Z-score normalization
    normalized = z_score_normalize(filtered)
    # 3. R-peak detection
    r_peaks = detect_r_peaks(normalized, fs)
    
    # 4. Feature domains
    time_feats = extract_time_domain_features(r_peaks, fs)
    morph_feats = extract_morphological_features(normalized, r_peaks, fs)
    freq_feats = extract_frequency_domain_features(r_peaks, fs)
    
    # Combine all features
    features = {}
    features.update(time_feats)
    features.update(morph_feats)
    features.update(freq_feats)
    
    return features

def process_single_record(args: Tuple[int, str, str, float, str]) -> Optional[Dict[str, any]]:
    """
    Process a single ECG record: load, extract features, and return results.
    Args tuple format: (ecg_id, rel_path, data_dir, fs, target_lead)
    """
    ecg_id, rel_path, data_dir, fs, target_lead = args
    try:
        # Load signal and lead names
        signal, lead_names = load_ecg_signal(rel_path, data_dir)
        
        # Identify the target lead index
        if target_lead in lead_names:
            lead_idx = lead_names.index(target_lead)
        else:
            # Fallback to index 1 (usually Lead II)
            lead_idx = 1
            logger.warning(f"Target lead {target_lead} not found for ecg_id {ecg_id}. Defaulting to index 1.")
            
        lead_signal = signal[:, lead_idx]
        
        # Extract features
        features = extract_features_single_lead(lead_signal, fs)
        
        # Add metadata and identification
        features['ecg_id'] = ecg_id
        
        return features
    except Exception as e:
        logger.error(f"Failed to process record {ecg_id} at {rel_path}: {e}")
        return None

def build_feature_matrix(df_metadata: pd.DataFrame, data_dir: str, fs: float = SAMPLING_RATE, target_lead: str = ECG_LEAD) -> pd.DataFrame:
    """
    Extract features from all records in df_metadata using parallel processing.
    Only processes files that actually exist on disk.
    Returns:
        DataFrame containing the extracted features and corresponding superclass label.
    """
    logger.info("Initializing feature matrix building...")
    
    tasks = []
    for ecg_id, row in df_metadata.iterrows():
        rel_path = row['filename_hr']
        if pd.notna(rel_path):
            hea_path = os.path.join(data_dir, f"{rel_path}.hea")
            dat_path = os.path.join(data_dir, f"{rel_path}.dat")
            if os.path.exists(hea_path) and os.path.exists(dat_path):
                tasks.append((ecg_id, rel_path, data_dir, fs, target_lead))
            
    logger.info(f"Filtered tasks: Found {len(tasks)} records present on disk to process.")
    logger.info(f"Submitting {len(tasks)} tasks to ProcessPoolExecutor...")
    
    # Run in parallel using multiprocessing
    num_workers = min(multiprocessing.cpu_count(), 8)
    feature_rows = []
    
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_single_record, task): task for task in tasks}
        
        completed = 0
        for future in as_completed(futures):
            res = future.result()
            if res is not None:
                feature_rows.append(res)
            completed += 1
            if completed % 100 == 0 or completed == len(tasks):
                logger.info(f"Feature extraction progress: {completed}/{len(tasks)} records completed.")
                
    # Create DataFrame and merge label
    df_features = pd.DataFrame(feature_rows)
    if df_features.empty:
        raise ValueError("No features were successfully extracted. Check dataset files.")
        
    df_features.set_index('ecg_id', inplace=True)
    
    # Merge with label from metadata
    labels_series = df_metadata['superclass']
    df_final = df_features.join(labels_series, how='inner')
    
    logger.info(f"Successfully built feature matrix. Shape: {df_final.shape}")
    return df_final
