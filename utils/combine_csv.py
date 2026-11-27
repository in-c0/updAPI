import os
import pandas as pd

# Directory containing the CSV files
folder_path = r"C:\path\to\api-docs"  # Replace with your folder path

# List to store dataframes
dataframes = []

# Iterate through all CSV files in the folder
for file_name in os.listdir(folder_path):
    if file_name.endswith(".csv"):  # Ensure only CSV files are processed
        file_path = os.path.join(folder_path, file_name)
        # Read each CSV into a dataframe
        df = pd.read_csv(file_path)
        dataframes.append(df)

# Combine all dataframes
combined_df = pd.concat(dataframes, ignore_index=True)

# Remove duplicate rows based on 'API Name' column
deduplicated_df = combined_df.drop_duplicates(subset="API Name")

# Save the combined, deduplicated dataframe to a new CSV file
output_path = os.path.join(folder_path, "combined_deduplicated_apis.csv")
deduplicated_df.to_csv(output_path, index=False)

print(f"Combined and deduplicated CSV saved to: {output_path}")
