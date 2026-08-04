import os
import ast
import pandas as pd
from typing import Dict, Optional, List
from AI.utils.logger import get_logger
from AI.utils.config import DIAGNOSTIC_SUPERCLASSES

logger = get_logger("label_processing")

def load_statements_mapping(data_dir: str) -> Dict[str, str]:
    """
    Load statements from scp_statements.csv and return mapping dictionary.
    Only maps diagnostic statements (diagnostic == 1) to their superclass.
    """
    statements_path = os.path.join(data_dir, "scp_statements.csv")
    if not os.path.exists(statements_path):
        raise FileNotFoundError(f"scp_statements.csv not found at {statements_path}. Please run download_dataset.py first.")
        
    df_scp = pd.read_csv(statements_path, index_col=0)
    # Filter for diagnostic codes and map subclass to superclass
    diag_df = df_scp[df_scp.diagnostic == 1]
    mapping = diag_df['diagnostic_class'].to_dict()
    
    # Clean up NaN mappings or mappings not in target superclasses
    cleaned_mapping = {}
    for subclass, superclass in mapping.items():
        if pd.notna(superclass) and superclass in DIAGNOSTIC_SUPERCLASSES:
            cleaned_mapping[subclass] = superclass
            
    logger.info(f"Loaded {len(cleaned_mapping)} diagnostic subclass-to-superclass mappings.")
    return cleaned_mapping

def get_record_superclass(scp_codes_dict: dict, subclass_to_superclass: Dict[str, str]) -> Optional[str]:
    """
    Map dictionary of scp_codes of a single record to a single superclass.
    Returns the superclass name if there is exactly one unique diagnostic superclass.
    Returns None otherwise (e.g. multi-class, or no diagnostic superclass).
    """
    superclasses = set()
    for code in scp_codes_dict.keys():
        if code in subclass_to_superclass:
            superclass = subclass_to_superclass[code]
            superclasses.add(superclass)
            
    if len(superclasses) == 1:
        return list(superclasses)[0]
    return None

def process_labels(df_ptbxl: pd.DataFrame, data_dir: str) -> pd.DataFrame:
    """
    Parse the scp_codes column, map subclasses to superclasses,
    and filter out records that don't have exactly one diagnostic superclass.
    Returns a dataframe containing only the single-label records.
    """
    subclass_to_superclass = load_statements_mapping(data_dir)
    
    # Ensure scp_codes are dicts (in case they are read as strings)
    df_processed = df_ptbxl.copy()
    if df_processed['scp_codes'].dtype == object and isinstance(df_processed['scp_codes'].iloc[0], str):
        df_processed['scp_codes'] = df_processed['scp_codes'].apply(ast.literal_eval)
        
    # Map each record to a single superclass
    df_processed['superclass'] = df_processed['scp_codes'].apply(
        lambda x: get_record_superclass(x, subclass_to_superclass)
    )
    
    # Drop rows without a single clear diagnostic superclass
    df_filtered = df_processed.dropna(subset=['superclass'])
    
    logger.info(f"Filtered dataset from {len(df_ptbxl)} down to {len(df_filtered)} single-superclass records.")
    return df_filtered
