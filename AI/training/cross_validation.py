from sklearn.model_selection import StratifiedKFold
from AI.utils.config import CV_FOLDS, RANDOM_STATE

def get_stratified_folds(n_splits: int = CV_FOLDS, shuffle: bool = True, random_state: int = RANDOM_STATE) -> StratifiedKFold:
    """
    Get a StratifiedKFold cross-validation splitter configured with parameters.
    """
    return StratifiedKFold(n_splits=n_splits, shuffle=shuffle, random_state=random_state)
