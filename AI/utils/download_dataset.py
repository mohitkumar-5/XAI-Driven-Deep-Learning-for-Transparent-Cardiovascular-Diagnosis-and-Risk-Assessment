import os
import shutil
import ast
import zipfile
import pandas as pd
import requests
from AI.utils.config import DATA_DIR, MAX_RECORDS, DIAGNOSTIC_SUPERCLASSES
from AI.utils.logger import get_logger

logger = get_logger("download_dataset")

ZIP_URL = "https://physionet.org/static/published-projects/ptb-xl/ptb-xl-a-large-publicly-available-electrocardiography-dataset-1.0.3.zip"
HEADERS = {"User-Agent": "DeepCardio-XAI research downloader"}

def setup_dataset():
    """Download the PTB-XL zip, extract metadata and 1500 target records, and clean up."""
    os.makedirs(DATA_DIR, exist_ok=True)
    
    db_csv_path = os.path.join(DATA_DIR, "ptbxl_database.csv")
    statements_csv_path = os.path.join(DATA_DIR, "scp_statements.csv")
    
    # Check if we already have the target records extracted
    # If database files exist, let's verify if we need to download
    if os.path.exists(db_csv_path) and os.path.exists(statements_csv_path):
        logger.info("Metadata files already exist. Checking records count...")
        # Check how many records files we already have
        existing_hea = 0
        for root, dirs, files in os.walk(DATA_DIR):
            for file in files:
                if file.endswith('.hea') and 'records500' in root:
                    existing_hea += 1
        logger.info(f"Found {existing_hea} existing high-res record header files.")
        if existing_hea >= MAX_RECORDS:
            logger.info("Target dataset subset is already downloaded and extracted.")
            return

    zip_path = os.path.join(os.path.dirname(DATA_DIR), "ptbxl.zip")
    
    # 1. Download ZIP file if it doesn't exist
    if not os.path.exists(zip_path):
        logger.info(f"Downloading PTB-XL dataset ZIP from {ZIP_URL}...")
        logger.info("This is a 1.7 GB download. A single stream download is used to avoid server rate-limiting.")
        try:
            with requests.get(ZIP_URL, headers=HEADERS, stream=True, timeout=60) as r:
                r.raise_for_status()
                total_size = int(r.headers.get('content-length', 0))
                downloaded = 0
                with open(zip_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0 and downloaded % (102 * 1024 * 1024) == 0:
                                percent = (downloaded / total_size) * 100
                                logger.info(f"Download progress: {percent:.1f}% ({downloaded // (1024*1024)} MB / {total_size // (1024*1024)} MB)")
            logger.info("ZIP download completed successfully.")
        except Exception as e:
            logger.warning(f"Failed to download ZIP: {e}")
            if os.path.exists(zip_path):
                try:
                    os.remove(zip_path)
                except OSError:
                    pass
            
            # Check if we already have sufficient local records to proceed with
            existing_hea = []
            for root, dirs, files in os.walk(DATA_DIR):
                for file in files:
                    if file.endswith('.hea') and 'records500' in root:
                        existing_hea.append(file)
            if len(existing_hea) >= 10:
                logger.warning(f"PhysioNet connection failed. Found {len(existing_hea)} local records on disk. Proceeding with existing local subset...")
                return
            else:
                logger.error("No local records found and download failed. Cannot proceed.")
                raise e
    else:
        logger.info("Dataset ZIP file already exists locally.")

    # 2. Extract Metadata and identify target records
    logger.info("Extracting metadata files from ZIP...")
    zip_root_name = "ptb-xl-a-large-publicly-available-electrocardiography-dataset-1.0.3"
    
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        # Extract metadata files first
        for file_info in zip_ref.infolist():
            filename = file_info.filename
            if filename.endswith("ptbxl_database.csv") or filename.endswith("scp_statements.csv"):
                # Extract and move to DATA_DIR
                base_name = os.path.basename(filename)
                dest = os.path.join(DATA_DIR, base_name)
                logger.info(f"Extracting {base_name}...")
                with zip_ref.open(file_info) as source, open(dest, "wb") as target:
                    shutil.copyfileobj(source, target)
                    
        # 3. Read metadata to find target subset of 1500 single-label records
        logger.info("Parsing metadata to identify target single-label records...")
        df_ptbxl = pd.read_csv(db_csv_path)
        df_scp = pd.read_csv(statements_csv_path, index_col=0)
        
        df_ptbxl['scp_codes'] = df_ptbxl['scp_codes'].apply(ast.literal_eval)
        subclass_to_superclass = df_scp[df_scp.diagnostic == 1]['diagnostic_class'].to_dict()
        
        def get_single_superclass(scp_dict):
            superclasses = set()
            for code in scp_dict:
                if code in subclass_to_superclass:
                    s_class = subclass_to_superclass[code]
                    if pd.notna(s_class) and s_class in DIAGNOSTIC_SUPERCLASSES:
                        superclasses.add(s_class)
            if len(superclasses) == 1:
                return list(superclasses)[0]
            return None
            
        df_ptbxl['superclass'] = df_ptbxl['scp_codes'].apply(get_single_superclass)
        df_single_label = df_ptbxl.dropna(subset=['superclass'])
        subset_records = df_single_label.head(MAX_RECORDS)
        
        # Create set of target record paths in zip (using relative paths)
        # Note: In ZIP, paths are like: ptb-xl-a-large-publicly-available-electrocardiography-dataset-1.0.3/records500/00000/00001_hr.hea
        target_files = set()
        for idx, row in subset_records.iterrows():
            rel_path = row['filename_hr']
            if pd.notna(rel_path):
                target_files.add(f"{zip_root_name}/{rel_path}.hea")
                target_files.add(f"{zip_root_name}/{rel_path}.dat")
                
        # 4. Extract only the target high-res records
        logger.info(f"Extracting {len(target_files)} high-resolution signal files for the subset...")
        extracted_count = 0
        
        for file_info in zip_ref.infolist():
            filename = file_info.filename
            if filename in target_files:
                # Determine destination path
                # e.g., filename: ptb-xl.../records500/00000/00001_hr.hea
                # should go to: DATA_DIR/records500/00000/00001_hr.hea
                rel_extracted = filename.replace(f"{zip_root_name}/", "")
                dest = os.path.join(DATA_DIR, rel_extracted)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                
                with zip_ref.open(file_info) as source, open(dest, "wb") as target:
                    shutil.copyfileobj(source, target)
                    
                extracted_count += 1
                if extracted_count % 200 == 0:
                    logger.info(f"Extracted {extracted_count}/{len(target_files)} files...")
                    
        logger.info(f"Successfully extracted {extracted_count} record files.")

    # 5. Clean up the large ZIP file
    logger.info("Cleaning up the dataset ZIP file to free disk space...")
    try:
        os.remove(zip_path)
        logger.info("ZIP file deleted successfully.")
    except Exception as e:
        logger.warning(f"Failed to delete local ZIP file: {e}")
        
    logger.info("Dataset subset setup completed successfully!")

if __name__ == "__main__":
    setup_dataset()
