import os
import sys
import json
import pandas as pd

# Add the workspace root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from AI.utils.config import DATA_DIR, SAMPLING_RATE
from AI.preprocessing.load_dataset import load_database_csv, load_ecg_signal
from AI.preprocessing.label_processing import process_labels
from AI.inference.predict import ECGInferencePipeline

def test_real_records():
    print("Loading inference pipeline...")
    pipeline = ECGInferencePipeline()
    
    print("Loading metadata...")
    df_ptbxl = load_database_csv(DATA_DIR)
    df_single_label = process_labels(df_ptbxl, DATA_DIR)
    
    # Scan for records present on disk
    print("Scanning for local records...")
    present_records = []
    for ecg_id, row in df_single_label.iterrows():
        rel_path = row['filename_hr']
        if pd.notna(rel_path):
            hea_path = os.path.join(DATA_DIR, f"{rel_path}.hea")
            dat_path = os.path.join(DATA_DIR, f"{rel_path}.dat")
            if os.path.exists(hea_path) and os.path.exists(dat_path):
                present_records.append((ecg_id, rel_path, row['superclass']))
                if len(present_records) >= 3:
                    break
                    
    if not present_records:
        print("No local records found on disk. Cannot run inference test.")
        return
        
    print(f"Found {len(present_records)} local records. Running inference...")
    
    for ecg_id, rel_path, true_label in present_records:
        print(f"\n=========================================")
        print(f"Record ECG ID: {ecg_id}")
        print(f"True Diagnostic Label: {true_label}")
        print(f"=========================================")
        
        # Load raw signal
        raw_signal, lead_names = load_ecg_signal(rel_path, DATA_DIR)
        
        # Run prediction
        result = pipeline.predict_raw_signal(raw_signal, SAMPLING_RATE, lead_names)
        
        # Display results nicely
        print("Model Outputs:")
        print(f"  Predicted Risk Class: {result['prediction']}")
        print(f"  Confidence Score:     {result['confidence']:.2%}")
        print(f"   probabilities:")
        for cls, prob in result['probability'].items():
            print(f"    - {cls}: {prob:.2%}")
            
        print("\nExplainability (SHAP Contribution Scores):")
        print("  Top contributing features:")
        for idx, feat in enumerate(result['top_features'], start=1):
            val = result['shap_values'][feat]
            direction = "INCREASES probability" if val > 0 else "DECREASES probability"
            print(f"    {idx}. {feat}: {val:+.4f} ({direction})")
            
        print("\nDisclaimer Message:")
        print(f"  \"{result['message']}\"")

if __name__ == "__main__":
    test_real_records()
    
    # ----------------------------------------------------
    # Model 2: Arrhythmia Inference Pipeline Verification
    # ----------------------------------------------------
    print("\n\n=========================================")
    print("Loading Arrhythmia Inference Pipeline...")
    print("=========================================")
    from AI.preprocessing.load_mitdb import load_mit_record
    from AI.inference.predict_arrhythmia import ArrhythmiaInferencePipeline
    
    pipeline = ArrhythmiaInferencePipeline()
    
    # Load first record (100)
    print("Loading MIT-BIH record 100...")
    signal, r_peaks, symbols, fs = load_mit_record('100')
    lead_signal = signal[:, 0]
    
    # Let's find one normal beat and one arrhythmia beat to test (avoiding boundaries)
    win_left = int(0.25 * fs)
    win_right = int(0.25 * fs)
    
    normal_idx = None
    arrhythmia_idx = None
    
    for i in range(1, len(r_peaks) - 1):
        peak_idx = r_peaks[i]
        if peak_idx - win_left < 0 or peak_idx + win_right >= len(lead_signal):
            continue
        sym = symbols[i]
        if sym == 'N' and normal_idx is None:
            normal_idx = i
        elif sym == 'V' and arrhythmia_idx is None:
            arrhythmia_idx = i
        if normal_idx is not None and arrhythmia_idx is not None:
            break
            
    # If PVC beat ('V') not found in 100, check record 106
    if arrhythmia_idx is None:
        print("Loading MIT-BIH record 106 to find PVC beat...")
        signal_106, r_peaks_106, symbols_106, fs_106 = load_mit_record('106')
        lead_signal_106 = signal_106[:, 0]
        win_left_106 = int(0.25 * fs_106)
        win_right_106 = int(0.25 * fs_106)
        for i in range(1, len(r_peaks_106) - 1):
            peak_idx = r_peaks_106[i]
            if peak_idx - win_left_106 < 0 or peak_idx + win_right_106 >= len(lead_signal_106):
                continue
            if symbols_106[i] == 'V':
                lead_signal = lead_signal_106
                r_peaks = r_peaks_106
                symbols = symbols_106
                fs = fs_106
                arrhythmia_idx = i
                break
                
    test_beats = []
    if normal_idx is not None:
        test_beats.append(("Normal Beat ('N')", normal_idx))
    if arrhythmia_idx is not None:
        test_beats.append(("Arrhythmia Beat ('V')", arrhythmia_idx))
        
    for name, beat_i in test_beats:
        print(f"\n-----------------------------------------")
        print(f"Testing Beat Type: {name} at index {beat_i}")
        print(f"-----------------------------------------")
        
        # Run prediction on the fly
        result = pipeline.predict_from_signal_window(
            signal_channel=lead_signal,
            peak_idx=r_peaks[beat_i],
            pre_peak_idx=r_peaks[beat_i-1],
            post_peak_idx=r_peaks[beat_i+1],
            fs=fs
        )
        
        print("Model Outputs:")
        print(f"  Predicted Class:  {result['prediction']}")
        print(f"  Confidence Score: {result['confidence']:.2%}")
        print(f"   probabilities:")
        for cls, prob in result['probability'].items():
            print(f"    - {cls}: {prob:.2%}")
            
        print("\nExplainability (SHAP Contribution Scores):")
        print("  Top contributing features:")
        for idx, feat in enumerate(result['top_features'], start=1):
            val = result['shap_values'][feat]
            direction = "INCREASES risk" if val > 0 else "DECREASES risk"
            print(f"    {idx}. {feat}: {val:+.4f} ({direction})")
            
        print("\nDisclaimer Message:")
        print(f"  \"{result['message']}\"")
