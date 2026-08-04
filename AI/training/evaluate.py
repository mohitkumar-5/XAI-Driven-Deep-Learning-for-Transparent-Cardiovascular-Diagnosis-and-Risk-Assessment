import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score
from typing import Dict, List, Any
from AI.utils.logger import get_logger

logger = get_logger("evaluate")

def evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray, classes: List[str]) -> Dict[str, Any]:
    """
    Evaluate the predicted labels and probabilities against ground truth.
    Supports multiclass classification using One-vs-Rest strategy for ROC-AUC.
    """
    logger.info("Evaluating predictions...")
    
    # 1. Accuracy
    acc = accuracy_score(y_true, y_pred)
    
    # 2. Precision, Recall, F1
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, average='macro', zero_division=0)
    
    # 3. ROC-AUC (One-vs-Rest)
    roc_auc = 0.0
    try:
        # Check if we have multiple classes represented in the batch
        unique_classes = np.unique(y_true)
        if len(unique_classes) > 1:
            if len(classes) == 2:
                # Binary classification
                # Use only positive class probabilities if y_prob is 2D
                prob_input = y_prob[:, 1] if (y_prob.ndim == 2 and y_prob.shape[1] == 2) else y_prob
                roc_auc = roc_auc_score(y_true, prob_input)
            else:
                # Multiclass
                roc_auc = roc_auc_score(y_true, y_prob, multi_class='ovr', average='macro')
        else:
            logger.warning("Only one class represented in evaluation batch. Setting ROC-AUC to 0.0.")
    except Exception as e:
        logger.error(f"Failed to calculate ROC-AUC: {e}")
        
    metrics = {
        'Accuracy': float(acc),
        'Precision': float(precision),
        'Recall': float(recall),
        'F1-score': float(f1),
        'ROC-AUC': float(roc_auc)
    }
    
    # Print metrics nicely
    logger.info("Evaluation metrics:")
    for metric_name, val in metrics.items():
        logger.info(f"  {metric_name}: {val:.4f}")
        
    return metrics
