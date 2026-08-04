import os

# Base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data', 'ptbxl')
SAVED_MODELS_DIR = os.path.join(BASE_DIR, 'saved_models')

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SAVED_MODELS_DIR, exist_ok=True)

# ECG settings
SAMPLING_RATE = 500  # Hz (records500)
ECG_LEAD = 'II'      # Use Lead II for feature extraction

# Preprocessing parameters
FILTER_BANDPASS_LOW = 0.5   # Hz
FILTER_BANDPASS_HIGH = 40.0 # Hz
FILTER_NOTCH = 50.0        # Hz

# Label processing
DIAGNOSTIC_SUPERCLASSES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']

# Sourcing limits for quick execution and testing
MAX_RECORDS = 1500  # Max records to load for training/testing (configured per user request)

# Feature names
INITIAL_FEATURES = [
    'HeartRate', 'MeanRR', 'RRStd', 'SDNN', 'RMSSD',
    'QRS', 'QT', 'Amplitude',
    'LF', 'HF', 'LFHF'
]

# Feature selection parameters
CORRELATION_THRESHOLD = 0.85
NUM_SELECTED_FEATURES = 10

# Training parameters
TEST_SIZE = 0.2
RANDOM_STATE = 42
CV_FOLDS = 5

# XGBoost Hyperparameter Search Grid
XGB_PARAM_GRID = {
    'max_depth': [3, 5, 6],
    'learning_rate': [0.05, 0.1, 0.2],
    'n_estimators': [100, 150, 200],
    'subsample': [0.8, 1.0],
    'colsample_bytree': [0.8, 1.0]
}

# MIT-BIH Arrhythmia Database Configurations
MIT_DATA_DIR = os.path.join(BASE_DIR, 'data', 'mitdb')
MIT_RECORDS = ['100', '101', '103', '105', '106']
MIT_SAMPLING_RATE = 360  # Hz (MIT-BIH sampling rate)
MIT_INITIAL_FEATURES = [
    'Pre_RR', 'Post_RR', 'RR_Ratio', 
    'QRS_Width', 'Peak_Amplitude', 
    'RMS_Amplitude', 'LF_Power', 'HF_Power'
]
