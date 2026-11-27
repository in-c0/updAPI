import csv
import os

import requests

# Column layout of api-docs-urls.csv. A row must always be written with this many
# fields: the position of a value is what says which kind of resource it is.
EXPECTED_FIELDS = 8


## Function to check if a URL is broken
## Returns True only when the server actually says the page is gone.
##
## Anything else — a timeout, a TLS error, a 403 from a bot-detecting CDN — means
## we failed to reach the page, which is not evidence that it does not exist.
## Treating those as broken would delete good URLs on a slow network.
def is_broken_url(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(url, timeout=15, allow_redirects=True, headers=headers)
        return response.status_code in (404, 410)
    except requests.exceptions.RequestException:
        return False


def verify_csv(file_path):
    cleaned_rows = []
    invalid_urls = 0
    with open(file_path, mode='r', encoding='utf-8-sig') as file:
        csv_reader = csv.reader(file)
        header = next(csv_reader)
        cleaned_rows.append(header)
        for row in csv_reader:
            if not row:
                continue
            api_name = row[0]
            urls = row[1:]
            cleaned_row = [api_name]
            for url in urls:
                if url and is_broken_url(url):
                    print(f"URL for {api_name} is invalid: {url}")
                    invalid_urls += 1
                    # Blank the cell, never drop it. Dropping shortens the row,
                    # which shifts every later value one column to the left — so a
                    # privacy policy ends up filed as the documentation URL. That
                    # is how 191 rows in this dataset came to be mislabelled.
                    cleaned_row.append('')
                else:
                    cleaned_row.append(url)

            # Pad rather than truncate: a short row read back in would be
            # misinterpreted the same way.
            while len(cleaned_row) < EXPECTED_FIELDS:
                cleaned_row.append('')
            cleaned_rows.append(cleaned_row)
    return cleaned_rows, invalid_urls


def clean_csv(file_path, cleaned_rows):
    with open(file_path, mode='w', newline='', encoding='utf-8') as file:
        csv_writer = csv.writer(file)
        for row in cleaned_rows:
            csv_writer.writerow(row)
    print(f"Cleaned CSV saved to: {file_path}")


if __name__ == "__main__":
    # Get the directory of the current script
    script_dir = os.path.dirname(__file__)

    # Construct the path to the file in the parent directory
    parent_dir = os.path.abspath(os.path.join(script_dir, '..'))
    csv_file_path = os.path.join(parent_dir, 'api-docs-urls.csv')
    print(f"Beginning verification of the CSV file: {csv_file_path}")
    cleaned_rows, invalid_urls = verify_csv(csv_file_path)
    print(f"Verification complete.")
    print(f"Beginning cleaning of the CSV file: {csv_file_path}")
    clean_csv(csv_file_path, cleaned_rows)
    print(f"Blanked {invalid_urls} invalid URLs in the CSV file.")
