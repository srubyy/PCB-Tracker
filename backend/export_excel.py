import sys
import json
import re
import pandas as pd
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

def extract_mfg_year(barcode):
    if not barcode or barcode == '-' or len(barcode) < 10:
        return None
    s = str(barcode).strip()
    if s.startswith('AT') and len(s) <= 8:
        return None
    
    # Regex matching: any letter followed by exactly 2 digits (e.g. B22, E26, D21)
    matches = re.findall(r'[a-zA-Z](\d{2})', s)
    if matches:
        for m in matches:
            yr = int(m)
            if 10 <= yr <= 50:
                return 2000 + yr
                
    # Fallback: standard 3rd/4th character check
    if len(s) >= 4:
        yr_part = s[2:4]
        try:
            yr = int(yr_part)
            if 10 <= yr <= 50:
                return 2000 + yr
        except ValueError:
            pass
            
    # Legacy fallbacks
    if len(s) in [16, 17]:
        try:
            yr = int(s[3:5])
            return yr + 2000
        except ValueError:
            pass
    if s.startswith('AGV'):
        c_idx = s.find('C')
        if c_idx != -1 and c_idx + 2 < len(s):
            try:
                yr = int(s[c_idx+1 : c_idx+3])
                return yr + 2000
            except ValueError:
                pass
    if s.startswith('EA') and len(s) == 22:
        try:
            yr = int(s[15:17])
            return yr + 2000
        except ValueError:
            pass
    return None

def find_column_indices(rows):
    dummy_idx = -1
    barcode_idx = -1
    mfg_year_idx = -1
    
    if len(rows) > 0:
        header = [str(x).lower().strip() for x in rows[0]]
        for idx, col in enumerate(header):
            if any(term in col for term in ['pcb sr no', 'pcb serial', 'dummy', 'sr no', 'sr_no']):
                if dummy_idx == -1:
                    dummy_idx = idx
            if any(term in col for term in ['barcode', 'actual serial', 'real serial']):
                if barcode_idx == -1:
                    barcode_idx = idx
            if any(term in col for term in ['mfg year', 'year', 'manufacturing year']):
                if mfg_year_idx == -1:
                    mfg_year_idx = idx
    return dummy_idx, barcode_idx, mfg_year_idx

def generate_excel(json_data):
    dest_path = json_data['dest_file_path']
    raw_sheets = json_data['raw_sheets']
    cell_edits = json_data['cell_edits']
    scan_logs = json_data.get('scan_logs', [])
    export_history = json_data.get('export_history', [])
    
    # Initialize ExcelWriter
    with pd.ExcelWriter(dest_path, engine='openpyxl') as writer:
        # Rule 1: Preserve all original sheets exactly, with edits overlaid
        for sheet_name, rows in raw_sheets.items():
            if not rows:
                continue
                
            # Filter edits for this sheet
            sheet_edits = [e for e in cell_edits if e['sheet_name'] == sheet_name]
            
            # Find column indices
            dummy_col_idx, barcode_col_idx, mfg_year_col_idx = find_column_indices(rows)
            
            # Apply edits where col_idx is numeric index
            for r_idx in range(len(rows)):
                for edit in sheet_edits:
                    if int(edit['row_idx']) == r_idx:
                        try:
                            c_idx = int(edit['col_idx'])
                            if 0 <= c_idx < len(rows[r_idx]):
                                rows[r_idx][c_idx] = edit['value']
                        except ValueError:
                            pass # Virtual edits handled separately below
            
            # Process rows to insert virtual columns to the immediate right of dummyColIdx
            new_rows = []
            
            # Header row modification
            header_row = list(rows[0])
            insert_pos = dummy_col_idx + 1 if dummy_col_idx != -1 else 1
            
            virtual_headers = [
                "Actual Serial No",
                "Length of Actual Serial No",
                "Mfg Year",
                "Scrap",
                "Repairable"
            ]
            
            for i, v_h in enumerate(virtual_headers):
                header_row.insert(insert_pos + i, v_h)
            new_rows.append(header_row)
            
            # Data rows modification
            for r_idx in range(1, len(rows)):
                row = list(rows[r_idx])
                
                # Fetch actual serial barcode
                actual_barcode = ''
                # Check for virtual edit first
                for edit in sheet_edits:
                    if int(edit['row_idx']) == r_idx and String_Match(edit['col_idx'], 'actual_serial_no'):
                        actual_barcode = edit['value']
                # Fallback to barcode column if no edit
                if not actual_barcode and barcode_col_idx != -1 and barcode_col_idx < len(row):
                    actual_barcode = row[barcode_col_idx]
                
                actual_barcode = str(actual_barcode).strip()
                if actual_barcode == '-':
                    actual_barcode = ''
                    
                # Compute virtual column values
                barcode_length = len(actual_barcode) if actual_barcode else 0
                calculated_year = extract_mfg_year(actual_barcode)
                
                scrap_status = '-'
                if calculated_year:
                    scrap_status = 'SCRAP' if calculated_year <= 2022 else '-'
                    
                repairable_val = 'No'
                for edit in sheet_edits:
                    if int(edit['row_idx']) == r_idx and String_Match(edit['col_idx'], 'repairable'):
                        repairable_val = 'Yes' if edit['value'] == 'true' else 'No'
                
                # Format calculated year
                year_display = str(calculated_year) if calculated_year else ''
                
                # Insert virtual values next to dummy serial
                virtual_values = [
                    actual_barcode,
                    barcode_length,
                    year_display,
                    scrap_status,
                    repairable_val
                ]
                
                for i, val in enumerate(virtual_values):
                    row.insert(insert_pos + i, val)
                new_rows.append(row)
                
            # Create DataFrame and write to sheet
            df = pd.DataFrame(new_rows[1:], columns=new_rows[0])
            df.to_excel(writer, sheet_name=sheet_name, index=False)
            
        # Rule 2: Append app-generated sheets after the original sheets
        # 1. Scan Log
        if scan_logs:
            scan_log_cols = [
                "Timestamp", 
                "PCB Sr No", 
                "Actual Serial No", 
                "Mfg Year", 
                "Scrap (Yes/No)", 
                "Scanned By", 
                "Session/Export Batch number"
            ]
            scan_log_rows = []
            for log in scan_logs:
                scan_log_rows.append([
                    log.get('timestamp', ''),
                    log.get('dummy_sr_no', ''),
                    log.get('actual_serial_no', ''),
                    log.get('mfg_year', '') or '',
                    log.get('scrap', 'No'),
                    log.get('scanned_by', 'Unknown'),
                    log.get('session_export_batch', 1)
                ])
            df_scan = pd.DataFrame(scan_log_rows, columns=scan_log_cols)
            df_scan.to_excel(writer, sheet_name="Scan Log", index=False)
            
        # 2. Discrepancy Report
        has_discrepancies = False
        table_a_rows = [] # Not yet scanned
        table_b_rows = [] # Scanned and matched
        table_c_rows = [] # Scrap list
        
        for sheet_name, rows in raw_sheets.items():
            if not rows:
                continue
            dummy_col_idx, barcode_col_idx, _ = find_column_indices(rows)
            sheet_edits = [e for e in cell_edits if e['sheet_name'] == sheet_name]
            
            for r_idx in range(1, len(rows)):
                row = rows[r_idx]
                
                # Fetch actual serial barcode
                actual_barcode = ''
                for edit in sheet_edits:
                    if int(edit['row_idx']) == r_idx and String_Match(edit['col_idx'], 'actual_serial_no'):
                        actual_barcode = edit['value']
                if not actual_barcode and barcode_col_idx != -1 and barcode_col_idx < len(row):
                    actual_barcode = row[barcode_col_idx]
                actual_barcode = str(actual_barcode).strip()
                if actual_barcode == '-':
                    actual_barcode = ''
                    
                dummy_sr_no = row[dummy_col_idx] if dummy_col_idx != -1 and dummy_col_idx < len(row) else ''
                calculated_year = extract_mfg_year(actual_barcode)
                scrap_status = 'Yes' if (calculated_year and calculated_year <= 2022) else 'No'
                
                repairable_val = 'No'
                for edit in sheet_edits:
                    if int(edit['row_idx']) == r_idx and String_Match(edit['col_idx'], 'repairable'):
                        repairable_val = 'Yes' if edit['value'] == 'true' else 'No'
                
                if not actual_barcode:
                    table_a_rows.append([sheet_name, r_idx + 1, dummy_sr_no])
                else:
                    table_b_rows.append([
                        sheet_name, 
                        r_idx + 1, 
                        dummy_sr_no, 
                        actual_barcode, 
                        str(calculated_year) if calculated_year else '', 
                        scrap_status, 
                        repairable_val
                    ])
                    if scrap_status == 'Yes':
                        table_c_rows.append([
                            sheet_name, 
                            r_idx + 1, 
                            dummy_sr_no, 
                            actual_barcode, 
                            str(calculated_year) if calculated_year else '', 
                            repairable_val
                        ])
                        
        if table_a_rows or table_b_rows or table_c_rows:
            has_discrepancies = True
            
        if has_discrepancies:
            discrepancy_data = []
            
            # Table A: Not Yet Scanned
            discrepancy_data.append(["Table A: Not Yet Scanned (Pending Inward)"])
            discrepancy_data.append(["Sheet Name", "Row #", "PCB Sr No"])
            for r in table_a_rows:
                discrepancy_data.append(r)
            discrepancy_data.append([]) # blank
            discrepancy_data.append([]) # blank
            
            # Table B: Scanned and Matched
            discrepancy_data.append(["Table B: Scanned and Matched (Inward Completed)"])
            discrepancy_data.append(["Sheet Name", "Row #", "PCB Sr No", "Actual Serial No", "Mfg Year", "Scrap (Yes/No)", "Repairable (Yes/No)"])
            for r in table_b_rows:
                discrepancy_data.append(r)
            discrepancy_data.append([]) # blank
            discrepancy_data.append([]) # blank
            
            # Table C: Scrap List
            discrepancy_data.append(["Table C: Scrap List (Mfg Year <= 2022)"])
            discrepancy_data.append(["Sheet Name", "Row #", "PCB Sr No", "Actual Serial No", "Mfg Year", "Repairable (Yes/No)"])
            for r in table_c_rows:
                discrepancy_data.append(r)
                
            df_disc = pd.DataFrame(discrepancy_data)
            df_disc.to_excel(writer, sheet_name="Discrepancy Report", header=False, index=False)
            
        # 3. Export History
        if export_history:
            export_hist_cols = [
                "Export Number", 
                "Timestamp", 
                "Who Exported", 
                "Total Rows in Lot", 
                "Scanned at that Moment", 
                "Unscanned", 
                "Scrapped", 
                "File Name Generated"
            ]
            export_hist_rows = []
            for hist in export_history:
                export_hist_rows.append([
                    hist.get('export_number', 1),
                    hist.get('timestamp', ''),
                    hist.get('exported_by', ''),
                    hist.get('total_rows', 0),
                    hist.get('scanned_count', 0),
                    hist.get('unscanned_count', 0),
                    hist.get('scrap_count', 0),
                    hist.get('file_name', '')
                ])
            df_hist = pd.DataFrame(export_hist_rows, columns=export_hist_cols)
            df_hist.to_excel(writer, sheet_name="Export History", index=False)

    # Style sheet look using openpyxl
    wb = openpyxl.load_workbook(dest_path)
    header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    virtual_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    virtual_font = Font(name="Arial", size=10, bold=True, color="1F4E78")
    normal_font = Font(name="Arial", size=10)
    
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        
        # Enable grid lines explicitly
        ws.views.sheetView[0].showGridLines = True
        
        if sheet_name == "Discrepancy Report":
            # Apply custom styles for discrepancy tables
            for row in ws.iter_rows(values_only=False):
                for cell in row:
                    val = str(cell.value or '')
                    if val.startswith("Table A:") or val.startswith("Table B:") or val.startswith("Table C:"):
                        cell.font = Font(name="Arial", size=11, bold=True, color="1F4E78")
                        cell.alignment = Alignment(horizontal="left", vertical="center")
                    elif val in ["Sheet Name", "Row #", "PCB Sr No", "Actual Serial No", "Mfg Year", "Scrap (Yes/No)", "Repairable (Yes/No)"]:
                        cell.fill = PatternFill(start_color="2F5597", end_color="2F5597", fill_type="solid")
                        cell.font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
                        cell.alignment = Alignment(horizontal="center", vertical="center")
                    else:
                        cell.font = normal_font
            continue
            
        # Standard sheet headers formatting
        is_orig_sheet = (sheet_name not in ["Scan Log", "Discrepancy Report", "Export History"])
        
        # Format Headers
        for col_idx in range(1, ws.max_column + 1):
            cell = ws.cell(row=1, column=col_idx)
            val = str(cell.value or '')
            
            # Format virtual headers differently
            if is_orig_sheet and val in ["Actual Serial No", "Length of Actual Serial No", "Mfg Year", "Scrap", "Repairable"]:
                cell.fill = virtual_fill
                cell.font = virtual_font
            else:
                cell.fill = header_fill
                cell.font = header_font
                
            cell.alignment = Alignment(horizontal="center", vertical="center")
            
        # Format Data cells
        for row_idx in range(2, ws.max_row + 1):
            for col_idx in range(1, ws.max_column + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = normal_font
                
                # Check alignment
                val_str = str(cell.value or '')
                if val_str.isdigit():
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")

        # Auto-adjust columns width
        for col in ws.columns:
            max_len = 0
            for cell in col:
                val = str(cell.value or '')
                if val:
                    max_len = max(max_len, len(val))
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    wb.save(dest_path)

def String_Match(val1, val2):
    return str(val1).lower().strip() == str(val2).lower().strip()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python export_excel.py <path_to_json_input>")
        sys.exit(1)
        
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    generate_excel(data)
    print("SUCCESS")
