import sys
import json
import warnings
warnings.filterwarnings("ignore")
import pandas as pd
import numpy as np

def parse_excel(file_path):
    try:
        xl = pd.ExcelFile(file_path)
        sheets = {}
        for sheet_name in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
            
            # Replace NaNs/NaTs with empty strings
            df = df.replace({np.nan: '', None: ''})
            
            # Ensure everything is a string
            df_str = df.astype(str)
            
            # Strip whitespace but retain original content exactly as-is
            rows = df_str.values.tolist()
            
            sheets[sheet_name] = rows
            
        return {"success": True, "sheets": sheets}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided."}))
        sys.exit(1)
        
    file_path = sys.argv[1]
    result = parse_excel(file_path)
    print(json.dumps(result))
