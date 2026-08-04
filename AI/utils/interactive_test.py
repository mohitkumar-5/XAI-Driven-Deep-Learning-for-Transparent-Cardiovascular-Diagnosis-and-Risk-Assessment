import os
import sys
import json
import pandas as pd
import numpy as np

# Add workspace root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from AI.utils.config import DATA_DIR, SAMPLING_RATE
from AI.preprocessing.load_dataset import load_database_csv, load_ecg_signal
from AI.preprocessing.label_processing import process_labels
from AI.inference.predict import ECGInferencePipeline
from AI.preprocessing.load_mitdb import load_mit_record
from AI.inference.predict_arrhythmia import ArrhythmiaInferencePipeline

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def get_float_input(prompt: str, default: float) -> float:
    while True:
        val = input(f"{prompt} [default={default}]: ").strip()
        if not val:
            return default
        try:
            return float(val)
        except ValueError:
            print("Invalid input. Please enter a valid decimal number.")

def run_model_1_interactive(pipeline: ECGInferencePipeline):
    print("\n--- MODEL 1: CARDIAC DISEASE RISK (PTB-XL) ---")
    print("How would you like to provide input?")
    print("1) Select a real patient record from PTB-XL database")
    print("2) Manually enter physiological features (HR, Amplitude, QT, QRS)")
    choice = input("Choice (1 or 2): ").strip()
    
    if choice == '1':
        print("\nScanning for local PTB-XL records on disk...")
        df_ptbxl = load_database_csv(DATA_DIR)
        df_single_label = process_labels(df_ptbxl, DATA_DIR)
        
        present_records = []
        for ecg_id, row in df_single_label.iterrows():
            rel_path = row['filename_hr']
            if pd.notna(rel_path):
                hea_path = os.path.join(DATA_DIR, f"{rel_path}.hea")
                dat_path = os.path.join(DATA_DIR, f"{rel_path}.dat")
                if os.path.exists(hea_path) and os.path.exists(dat_path):
                    present_records.append((ecg_id, rel_path, row['superclass']))
                    if len(present_records) >= 5:
                        break
                        
        if not present_records:
            print("No local PTB-XL records found. Fallback to manual entry.")
            choice = '2'
        else:
            print("\nSelect a patient record to load:")
            for idx, (ecg_id, _, true_label) in enumerate(present_records, 1):
                print(f"{idx}) Patient ECG ID: {ecg_id} (True Diagnosis: {true_label})")
                
            while True:
                sel = input(f"Enter choice (1-{len(present_records)}): ").strip()
                try:
                    sel_idx = int(sel) - 1
                    if 0 <= sel_idx < len(present_records):
                        break
                except ValueError:
                    pass
                print("Invalid choice.")
                
            ecg_id, rel_path, true_label = present_records[sel_idx]
            print(f"\nLoading raw ECG signal for Patient {ecg_id}...")
            raw_signal, lead_names = load_ecg_signal(rel_path, DATA_DIR)
            
            # Predict
            result = pipeline.predict_raw_signal(raw_signal, SAMPLING_RATE, lead_names)
            
            print(f"\nGround Truth Label: {true_label}")
            print("Prediction Results (JSON):")
            print(json.dumps(result, indent=2))
            return
            
    if choice == '2':
        print("\nEnter physiological features manually:")
        amplitude = get_float_input("R-Peak Amplitude (mV)", default=1.2)
        heart_rate = get_float_input("Heart Rate (BPM)", default=75.0)
        rr_std = get_float_input("RR Interval Std Dev (seconds)", default=0.06)
        qt = get_float_input("QT Interval Duration (seconds)", default=0.40)
        qrs = get_float_input("QRS Complex Duration (seconds)", default=0.09)
        lf = get_float_input("Low-Frequency FFT Power", default=100.0)
        hf = get_float_input("High-Frequency FFT Power", default=80.0)
        lf_hf = lf / (hf + 1e-8)
        
        feature_dict = {
            'Amplitude': amplitude,
            'HeartRate': heart_rate,
            'RRStd': rr_std,
            'QT': qt,
            'QRS': qrs,
            'LF': lf,
            'HF': hf,
            'LFHF': lf_hf
        }
        
        print("\nRunning inference...")
        result = pipeline.predict_from_features(feature_dict)
        print("\nPrediction Results (JSON):")
        print(json.dumps(result, indent=2))

def run_model_2_interactive(pipeline: ArrhythmiaInferencePipeline):
    print("\n--- MODEL 2: ARRHYTHMIA RISK (MIT-BIH) ---")
    print("How would you like to provide input?")
    print("1) Select a real heartbeat beat from MIT-BIH database")
    print("2) Manually enter beat-level interval/width features")
    choice = input("Choice (1 or 2): ").strip()
    
    if choice == '1':
        print("\nLoading MIT-BIH record 106...")
        signal, r_peaks, symbols, fs = load_mit_record('106')
        lead_signal = signal[:, 0]
        
        # Find some beats
        normal_beats = []
        pvc_beats = []
        win_left = int(0.25 * fs)
        win_right = int(0.25 * fs)
        
        for i in range(2, len(r_peaks) - 2):
            peak_idx = r_peaks[i]
            if peak_idx - win_left >= 0 and peak_idx + win_right < len(lead_signal):
                sym = symbols[i]
                if sym == 'N' and len(normal_beats) < 3:
                    normal_beats.append(i)
                elif sym == 'V' and len(pvc_beats) < 3:
                    pvc_beats.append(i)
                if len(normal_beats) >= 2 and len(pvc_beats) >= 2:
                    break
                    
        choices = []
        for b_idx in normal_beats:
            choices.append((b_idx, "Normal Beat ('N')"))
        for b_idx in pvc_beats:
            choices.append((b_idx, "Arrhythmic Beat / PVC ('V')"))
            
        print("\nSelect a heartbeat type to load:")
        for idx, (b_idx, name) in enumerate(choices, 1):
            print(f"{idx}) Beat index {b_idx} in record 106: {name}")
            
        while True:
            sel = input(f"Enter choice (1-{len(choices)}): ").strip()
            try:
                sel_idx = int(sel) - 1
                if 0 <= sel_idx < len(choices):
                    break
            except ValueError:
                pass
            print("Invalid choice.")
            
        beat_i, name = choices[sel_idx]
        print(f"\nProcessing beat {beat_i}...")
        result = pipeline.predict_from_signal_window(
            signal_channel=lead_signal,
            peak_idx=r_peaks[beat_i],
            pre_peak_idx=r_peaks[beat_i-1],
            post_peak_idx=r_peaks[beat_i+1],
            fs=fs
        )
        print("\nPrediction Results (JSON):")
        print(json.dumps(result, indent=2))
        return
        
    if choice == '2':
        print("\nEnter beat features manually:")
        pre_rr = get_float_input("Pre-RR Interval (seconds)", default=0.8)
        post_rr = get_float_input("Post-RR Interval (seconds)", default=0.8)
        rr_ratio = pre_rr / (post_rr + 1e-8)
        qrs_width = get_float_input("QRS Complex Width (seconds)", default=0.08)
        peak_amp = get_float_input("Peak R-wave Amplitude (mV)", default=1.5)
        rms_amp = get_float_input("RMS Beat Amplitude", default=0.3)
        lf_power = get_float_input("Low-Frequency FFT Power", default=50.0)
        hf_power = get_float_input("High-Frequency FFT Power", default=40.0)
        
        feature_dict = {
            'Pre_RR': pre_rr,
            'Post_RR': post_rr,
            'RR_Ratio': rr_ratio,
            'QRS_Width': qrs_width,
            'Peak_Amplitude': peak_amp,
            'RMS_Amplitude': rms_amp,
            'LF_Power': lf_power,
            'HF_Power': hf_power
        }
        
        print("\nRunning inference...")
        result = pipeline.predict_beat(feature_dict)
        print("\nPrediction Results (JSON):")
        print(json.dumps(result, indent=2))

def main():
    print("Loading models...")
    pipeline_m1 = ECGInferencePipeline()
    pipeline_m2 = ArrhythmiaInferencePipeline()
    
    while True:
        clear_screen()
        print("==================================================")
        print("DeepCardio-XAI Interactive Pipeline Testing Console")
        print("==================================================")
        print("1) Test Model 1 (Cardiac Disease Risk superclass - PTB-XL)")
        print("2) Test Model 2 (Arrhythmia Beat Classification - MIT-BIH)")
        print("3) Exit")
        choice = input("Select an option (1-3): ").strip()
        
        if choice == '1':
            run_model_1_interactive(pipeline_m1)
            input("\nPress Enter to return to main menu...")
        elif choice == '2':
            run_model_2_interactive(pipeline_m2)
            input("\nPress Enter to return to main menu...")
        elif choice == '3':
            print("Exiting console. Goodbye!")
            break

if __name__ == "__main__":
    main()
