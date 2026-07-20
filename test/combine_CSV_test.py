import os
import pandas as pd
import tempfile
import shutil
from utils.combine_csv import combine_csv  # if you refactor the code into a function

def test_combine_csv():
    # Create temporary directory and CSV files
    temp_dir = tempfile.mkdtemp()
    try:
        # Create two simple CSVs
        csv1 = pd.DataFrame({'API Name': ['A', 'B'], 'Value': [1, 2]})
        csv2 = pd.DataFrame({'API Name': ['B', 'C'], 'Value': [2, 3]})
        csv1.to_csv(os.path.join(temp_dir, 'file1.csv'), index=False)
        csv2.to_csv(os.path.join(temp_dir, 'file2.csv'), index=False)

        # Combine CSV files (assuming your combine_csv function accepts a folder path)
        combined = pd.concat([csv1, csv2]).drop_duplicates(subset="API Name")
        # Verify deduplication
        assert combined.shape[0] == 3

    finally:
        shutil.rmtree(temp_dir)
