import os
import pickle
import numpy as np
import pandas as pd
import shap
from typing import Dict, Any, List
from AI.utils.logger import get_logger
from AI.utils.config import SAVED_MODELS_DIR

logger = get_logger("shap_explainer")

def load_or_create_explainer(model: Any) -> shap.TreeExplainer:
    """
    Load a pre-saved SHAP TreeExplainer or initialize a new one.
    """
    explainer_path = os.path.join(SAVED_MODELS_DIR, "shap_explainer.pkl")
    
    if os.path.exists(explainer_path):
        try:
            with open(explainer_path, 'rb') as f:
                explainer = pickle.load(f)
            logger.info("Successfully loaded pre-saved SHAP TreeExplainer.")
            return explainer
        except Exception as e:
            logger.warning(f"Failed to load SHAP explainer from pickle: {e}. Re-initializing...")
            
    # Fallback to initialize explainer on the fly
    logger.info("Initializing new SHAP TreeExplainer from XGBoost model...")
    return shap.TreeExplainer(model)

def get_prediction_explanation(
    explainer: shap.TreeExplainer,
    model: Any,
    scaled_feature_vector: np.ndarray,
    feature_names: List[str],
    predicted_class_idx: int
) -> Dict[str, Any]:
    """
    Explain a single prediction by calculating the SHAP values.
    Returns:
        shap_values: Array of SHAP values for the predicted class.
        top_features: List of feature names sorted by absolute contribution.
    """
    # Reshape if 1D to match (1, num_features)
    if scaled_feature_vector.ndim == 1:
        scaled_feature_vector = scaled_feature_vector.reshape(1, -1)
        
    # Calculate SHAP values
    # For TreeExplainer, shap_values shape can be:
    # (num_samples, num_features, num_classes) or list of length num_classes
    raw_shap = explainer(scaled_feature_vector)
    
    # Extract values for the predicted class
    # Recent SHAP versions return an Explanation object
    if hasattr(raw_shap, "values"):
        # shape is (samples, features, classes) or (samples, features)
        if len(raw_shap.shape) == 3:
            # Multiclass
            shap_for_class = raw_shap.values[0, :, predicted_class_idx]
        else:
            # Binary or flat
            shap_for_class = raw_shap.values[0, :]
    else:
        # Older SHAP version returns list of arrays (one per class)
        if isinstance(raw_shap, list):
            shap_for_class = raw_shap[predicted_class_idx][0]
        else:
            shap_for_class = raw_shap[0]
            
    # Combine feature names with SHAP values
    contributions = pd.Series(shap_for_class, index=feature_names)
    
    # Sort features by absolute contribution to find top features
    top_features = contributions.abs().sort_values(ascending=False).index.tolist()
    
    # Convert series to dict for output
    shap_dict = contributions.to_dict()
    
    return {
        "shap_values": shap_dict,
        "top_features": top_features[:3]  # Return top 3 contributing features
    }
