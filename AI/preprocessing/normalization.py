import numpy as np

def z_score_normalize(signal: np.ndarray) -> np.ndarray:
    """
    Perform Z-score normalization:
    y = (x - mean) / std
    """
    mean = np.mean(signal, axis=0)
    std = np.std(signal, axis=0)
    # Prevent division by zero
    std_safe = np.where(std == 0, 1e-8, std)
    return (signal - mean) / std_safe
