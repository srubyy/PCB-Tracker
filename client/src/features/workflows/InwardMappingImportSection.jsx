import React, { useState, useEffect, useRef } from 'react';
import { FileSpreadsheet, Trash2, Plus, X, ArrowDown, Download } from 'lucide-react';

const InwardMappingImportSection = ({ lotId, apiFetch, showToast, onSuccess }) => {
  // Spreadsheet States
  const [excelSheets, setExcelSheets] = useState({}); // { sheetName: [[cell, cell, ...], ...] }
  const [cellEdits, setCellEdits] = useState([]); // Array of edits: { sheet_name, row_idx, col_idx, value }
  const [activeSheetName, setActiveSheetName] = useState('');
  const [visibleRowsCount, setVisibleRowsCount] = useState(500);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Row inline validation error states (rowIdx -> error string)
  const [rowErrors, setRowErrors] = useState({});

  // Keyboard scan state & active highlighted row index
  const [activeRowIdx, setActiveRowIdx] = useState(null);

  // Cell editing state
  const [editingCell, setEditingCell] = useState(null); // { rowIdx, colIdx }

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Helper to convert column index to Excel column letter (A, B, C... Z, AA, AB...)
  const getColumnLetter = (colIdx) => {
    let temp = colIdx;
    let letter = '';
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Helper to extract manufacturing year based on Actual Serial
  const getMfgYear = (serial) => {
    if (!serial) return null;
    const s = String(serial).trim();
    const len = s.length;

    // Guard: starts with 'AT' and length <= 8 is dummy
    if (s.startsWith('AT') && len <= 8) {
      return null;
    }

    // Try regex matching: any letter followed by exactly 2 digits (e.g. B22, E26, D21)
    const matches = s.match(/[a-zA-Z](\d{2})/g);
    if (matches) {
      for (const m of matches) {
        const yr = parseInt(m.substring(1), 10);
        if (yr >= 10 && yr <= 50) {
          return 2000 + yr;
        }
      }
    }

    // Fallback: standard 3rd/4th character check
    if (len >= 4) {
      const yrPart = s.substring(2, 4);
      const yr = parseInt(yrPart, 10);
      if (!isNaN(yr) && yr >= 10 && yr <= 50) {
        return 2000 + yr;
      }
    }

    // 2. Legacy fallbacks
    if (len === 16 || len === 17) {
      const yr = parseInt(s.substring(3, 5), 10);
      if (!isNaN(yr)) return yr + 2000;
    }
    if (s.startsWith('AGV')) {
      const cIndex = s.indexOf('C');
      if (cIndex !== -1 && cIndex + 2 < len) {
        const yr = parseInt(s.substring(cIndex + 1, cIndex + 3), 10);
        if (!isNaN(yr)) return yr + 2000;
      }
    }
    if (s.startsWith('EA') && len === 22) {
      const yr = parseInt(s.substring(15, 17), 10);
      if (!isNaN(yr)) return yr + 2000;
    }
    return null;
  };

  // Helper to get row validation status info
  const getValidationInfo = (realSerial) => {
    if (!realSerial || realSerial === '-') {
      return {
        status: 'pending',
        color: '#ffc107',
        bg: 'rgba(255, 193, 7, 0.1)',
        border: 'rgba(255, 193, 7, 0.25)',
        text: '⚠️ Pending'
      };
    }
    const year = getMfgYear(realSerial);
    if (!year) {
      return {
        status: 'valid',
        color: '#28a745',
        bg: 'rgba(40, 167, 69, 0.1)',
        border: 'rgba(40, 167, 69, 0.25)',
        text: '✅ Valid'
      };
    }
    if (year <= 2022) {
      return {
        status: 'scrap',
        color: '#dc3545',
        bg: 'rgba(220, 53, 69, 0.1)',
        border: 'rgba(220, 53, 69, 0.3)',
        text: `🔴 SCRAP (Mfg ${year})`
      };
    }
    return {
      status: 'valid',
      color: '#28a745',
      bg: 'rgba(40, 167, 69, 0.1)',
      border: 'rgba(40, 167, 69, 0.25)',
      text: `✅ Valid (Mfg ${year})`
    };
  };

  // Helper to find column indices for serial number fields
  const findColumnIndices = (sheetRows) => {
    let dummyColIdx = -1;
    let barcodeColIdx = -1;
    let mfgYearColIdx = -1;

    for (let r = 0; r < Math.min(sheetRows.length, 20); r++) {
      const row = sheetRows[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toLowerCase();
        if (dummyColIdx === -1 && (val === 'pcb sr no' || val === 'dummy sr no' || val.includes('pcb sr') || val === 'sr no')) {
          dummyColIdx = c;
        }
        if (barcodeColIdx === -1 && (val === 'barcode' || val === 'actual barcode' || val === 'real serial')) {
          barcodeColIdx = c;
        }
        if (mfgYearColIdx === -1 && (val === 'mfg year' || val === 'mfg_year' || val === 'year')) {
          mfgYearColIdx = c;
        }
      }
    }
    return { dummyColIdx, barcodeColIdx, mfgYearColIdx };
  };

  // Load raw sheet data and database overlays
  const loadExcelData = async () => {
    if (!lotId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/lots/${lotId}/excel-data`);
      if (res.ok) {
        const data = await res.json();
        setExcelSheets(data.sheets || {});
        setCellEdits(data.edits || []);
        
        // Auto-select first sheet as active tab
        const sheetNames = Object.keys(data.sheets || {});
        if (sheetNames.length > 0 && !activeSheetName) {
          setActiveSheetName(sheetNames[0]);
        }
      } else {
        showToast('Failed to load lot spreadsheet data.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading excel data.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExcelData();
  }, [lotId]);

  // Global keydown listener for barcode scanning HID mode
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();
    let preScanValue = '';
    let preScanInputId = null;

    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 50) {
        scanBuffer = '';
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
          preScanValue = document.activeElement.value;
          preScanInputId = document.activeElement.id;
        } else {
          preScanValue = '';
          preScanInputId = null;
        }
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (scanBuffer.trim().length > 0) {
          const scannedVal = scanBuffer.trim();
          scanBuffer = '';
          
          const isDummy = scannedVal.length < 12;
          if (isDummy) {
            // Clear the polluted state for this row in cellEdits directly
            if (preScanInputId) {
              const parts = preScanInputId.split('-');
              const rIdx = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(rIdx)) {
                setCellEdits(prev => prev.filter(item => 
                  !(item.sheet_name === activeSheetName && item.row_idx === rIdx && String(item.col_idx) === 'actual_serial_no')
                ));
              }
            }
            handleGlobalScan(scannedVal);
            e.preventDefault();
          } else {
            // It's an actual serial barcode! Auto-fill if not focused on any input
            if (!preScanInputId && activeRowIdx !== null) {
              const inputEl = document.getElementById(`actual-serial-input-${activeRowIdx}`);
              if (inputEl) {
                inputEl.focus();
                handleActualSerialChange(activeSheetName, activeRowIdx, scannedVal);
              }
            }
          }
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [excelSheets, activeSheetName, cellEdits, activeRowIdx]);

  // Locate, highlight and focus row matching scanned dummy barcode
  const handleGlobalScan = (scannedVal) => {
    const isDummy = scannedVal.length < 12;
    
    if (isDummy) {
      const rows = excelSheets[activeSheetName] || [];
      const { dummyColIdx } = findColumnIndices(rows);
      if (dummyColIdx === -1) return;

      const matchedIdx = rows.findIndex((row, rIdx) => {
        const rawDummy = row[dummyColIdx];
        const dummyVal = String(getCellValue(activeSheetName, rIdx, dummyColIdx, rawDummy) || '').toLowerCase().trim();
        const target = scannedVal.toLowerCase().trim();
        return dummyVal === target || 
               (dummyVal.replace(/\D/g, '') === target.replace(/\D/g, '') && dummyVal.replace(/\D/g, '').length > 0);
      });

      if (matchedIdx !== -1) {
        setActiveRowIdx(matchedIdx);
        showToast(`Located PCB Sr No: ${scannedVal}. Focus shifted to Actual Serial No.`, 'success');
        
        const rowEl = document.getElementById(`excel-row-${matchedIdx}`);
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        setTimeout(() => {
          const inputEl = document.getElementById(`actual-serial-input-${matchedIdx}`);
          if (inputEl) {
            inputEl.focus();
            inputEl.select();
          }
        }, 150);
      } else {
        showToast(`Dummy serial ${scannedVal} not found in sheet.`, 'warning');
      }
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleExcelFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleExcelFile(e.target.files[0]);
    }
  };

  // Binary stream upload to backend
  const handleExcelFile = async (file) => {
    if (!lotId) {
      showToast('Please select a lot first.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('es_access_token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/lots/${lotId}/upload-excel`, {
        method: 'POST',
        headers,
        body: file
      });
      
      const data = await res.json();
      if (res.ok) {
        showToast('Successfully imported Excel sheet!');
        loadExcelData();
        if (onSuccess) onSuccess();
      } else {
        showToast(data.error || 'Failed to import Excel.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error uploading Excel file.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  // Resolve cell value by overlaying edits on raw sheet data
  const getCellValue = (sheetName, rowIdx, colIdx, rawVal) => {
    const edit = cellEdits.find(e => 
      e.sheet_name === sheetName && 
      e.row_idx === rowIdx && 
      String(e.col_idx) === String(colIdx)
    );
    return edit ? edit.value : (rawVal !== undefined ? String(rawVal) : '');
  };

  // Write single cell edit directly to database
  const handleCellEdit = async (sheetName, rowIdx, colIdx, val) => {
    const value = String(val).trim();
    
    // Optimistic Update
    setCellEdits(prev => {
      const filtered = prev.filter(e => 
        !(e.sheet_name === sheetName && e.row_idx === rowIdx && String(e.col_idx) === String(colIdx))
      );
      return [...filtered, { sheet_name: sheetName, row_idx: rowIdx, col_idx: String(colIdx), value }];
    });

    try {
      const res = await apiFetch(`/api/lots/${lotId}/cell-edit`, {
        method: 'POST',
        body: JSON.stringify({ sheet_name: sheetName, row_idx: rowIdx, col_idx: colIdx, value })
      });
      if (!res.ok) {
        showToast('Failed to save cell edit.', 'danger');
        loadExcelData();
      } else {
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      console.error(err);
      showToast('Error saving cell edit.', 'danger');
      loadExcelData();
    }
  };

  // Save Actual Serial No with database barcode validation
  const handleActualSerialChange = async (sheetName, rowIdx, val) => {
    const cleanVal = String(val).trim();
    setRowErrors(prev => ({ ...prev, [rowIdx]: null }));

    // Optimistic Update
    setCellEdits(prev => {
      const filtered = prev.filter(e => 
        !(e.sheet_name === sheetName && e.row_idx === rowIdx && String(e.col_idx) === 'actual_serial_no')
      );
      return [...filtered, { sheet_name: sheetName, row_idx: rowIdx, col_idx: 'actual_serial_no', value: cleanVal }];
    });

    if (!cleanVal || cleanVal === '-') {
      try {
        await apiFetch(`/api/lots/${lotId}/cell-edit`, {
          method: 'POST',
          body: JSON.stringify({ sheet_name: sheetName, row_idx: rowIdx, col_idx: 'actual_serial_no', value: '' })
        });
        if (onSuccess) onSuccess();
      } catch (err) {
        console.error(err);
      }
      return;
    }

    try {
      // Validate barcode length (at least 12 characters)
      if (cleanVal.length < 12) {
        return;
      }

      const res = await apiFetch(`/api/lots/${lotId}/cell-edit`, {
        method: 'POST',
        body: JSON.stringify({ sheet_name: sheetName, row_idx: rowIdx, col_idx: 'actual_serial_no', value: cleanVal })
      });

      if (res.ok) {
        if (onSuccess) onSuccess();
      } else {
        setRowErrors(prev => ({ ...prev, [rowIdx]: 'Error saving barcode' }));
      }
    } catch (err) {
      console.error(err);
      setRowErrors(prev => ({ ...prev, [rowIdx]: 'Network error validating barcode' }));
    }
  };

  // Clear lot panels
  const handleClearLot = async () => {
    if (!window.confirm("Are you sure you want to clear all imported panels for this lot? This cannot be undone.")) return;
    try {
      const res = await apiFetch(`/api/panels/clear?lot_id=${lotId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setExcelSheets({});
        setCellEdits([]);
        setActiveSheetName('');
        if (onSuccess) onSuccess();
        showToast('Cleared lot panels.', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to clear panels.', 'danger');
    }
  };

  // Trigger Dynamic Excel Export download
  const handleExportSpreadsheet = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/lots/${lotId}/export-excel`);
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to export spreadsheet.');
      }

      // Read Content-Disposition header to get filename
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `LotNo${lotId}_Export.xlsx`;
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename="?([^"]+)"?/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      // Convert response stream to blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast(`Spreadsheet exported successfully as ${filename}!`, 'success');
      
      // Reload excel data to fetch updated export history overlays
      loadExcelData();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error exporting spreadsheet.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const sheetNames = Object.keys(excelSheets);
  const activeSheetRows = excelSheets[activeSheetName] || [];

  // Determine number of columns and index matching dummy, barcode, year
  const numColumns = activeSheetRows.length > 0 ? activeSheetRows[0].length : 0;
  const { dummyColIdx, barcodeColIdx, mfgYearColIdx } = findColumnIndices(activeSheetRows);

  const columns = [];
  for (let c = 0; c < numColumns; c++) {
    const letter = getColumnLetter(c);
    columns.push({ index: c, type: 'excel', label: letter });
    if (c === dummyColIdx) {
      columns.push({ index: 'actual_serial_no', type: 'actual_serial_no', label: 'Actual Serial No' });
      columns.push({ index: 'barcode_length', type: 'barcode_length', label: 'Length of Actual Serial No' });
      columns.push({ index: 'calculated_mfg_year', type: 'calculated_mfg_year', label: 'Mfg Year' });
      columns.push({ index: 'scrap', type: 'scrap', label: 'Scrap' });
      columns.push({ index: 'repairable', type: 'repairable', label: 'Repairable' });
    }
  }

  // Fallbacks if dummyColIdx was not detected in Excel sheet
  if (dummyColIdx === -1 && numColumns > 0) {
    columns.push({ index: 'actual_serial_no', type: 'actual_serial_no', label: 'Actual Serial No' });
    columns.push({ index: 'barcode_length', type: 'barcode_length', label: 'Length of Actual Serial No' });
    columns.push({ index: 'calculated_mfg_year', type: 'calculated_mfg_year', label: 'Mfg Year' });
    columns.push({ index: 'scrap', type: 'scrap', label: 'Scrap' });
    columns.push({ index: 'repairable', type: 'repairable', label: 'Repairable' });
  }

  // Render spreadsheet view when sheets exist
  if (sheetNames.length > 0) {
    const renderedRows = activeSheetRows.slice(0, visibleRowsCount);
    
    return (
      <div className="glass-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        <style>{`
          .excel-table td.editable-cell {
            position: relative;
            transition: all 0.15s ease-on;
          }
          .excel-table td.editable-cell:hover {
            background: rgba(var(--color-primary-rgb), 0.1) !important;
            outline: 1px dashed var(--color-primary) !important;
          }
          .excel-table tr.highlighted-row td {
            border-top: 2px solid #ffc107 !important;
            border-bottom: 2px solid #ffc107 !important;
            background: rgba(255, 193, 7, 0.12) !important;
          }
          .excel-table tr.highlighted-row td:first-child {
            border-left: 2px solid #ffc107 !important;
            border-top-left-radius: 4px;
            border-bottom-left-radius: 4px;
          }
          .excel-table tr.highlighted-row td:last-child {
            border-right: 2px solid #ffc107 !important;
            border-top-right-radius: 4px;
            border-bottom-right-radius: 4px;
          }
        `}</style>
        
        {/* Header toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)' }}>Raw Spreadsheet Viewer</h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Rendered exactly as-is. Click any cell to edit inline. Edits save dynamically.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportSpreadsheet}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: '0.72rem', background: 'var(--color-primary)', color: '#000', border: 'none', fontWeight: 'bold' }}
            >
              <Download size={14} /> Export Spreadsheet
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClearLot}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: '0.72rem', background: '#dc3545', color: '#fff', border: 'none' }}
            >
              <X size={14} /> Clear Spreadsheet
            </button>
          </div>
        </div>

        {/* Sheet Tabs */}
        {sheetNames.length > 1 && (
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--card-border)', pb: 8 }}>
            {sheetNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setActiveSheetName(name);
                  setVisibleRowsCount(500);
                  setActiveRowIdx(null);
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px 6px 0 0',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: '1px solid var(--card-border)',
                  borderBottom: activeSheetName === name ? '2px solid var(--color-primary)' : '1px solid var(--card-border)',
                  background: activeSheetName === name ? 'rgba(var(--color-primary-rgb), 0.05)' : 'transparent',
                  color: activeSheetName === name ? 'var(--color-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable table grid */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--card-border)', borderRadius: 8, maxHeight: 500, overflowY: 'auto' }}>
          <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--card-border)' }}>
                <th style={{ padding: '8px 12px', width: 50, position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 10 }}>#</th>
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      minWidth: col.type === 'actual_serial_no' ? 190 : col.type === 'barcode_length' ? 160 : col.type === 'calculated_mfg_year' ? 95 : col.type === 'scrap' ? 95 : col.type === 'repairable' ? 100 : 110,
                      background: ['actual_serial_no', 'barcode_length', 'calculated_mfg_year', 'scrap', 'repairable'].includes(col.type) ? 'rgba(var(--color-primary-rgb), 0.05)' : 'transparent',
                      color: ['actual_serial_no', 'barcode_length', 'calculated_mfg_year', 'scrap', 'repairable'].includes(col.type) ? 'var(--color-primary)' : 'var(--text-main)',
                      fontWeight: 800,
                      textAlign: 'center'
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderedRows.map((row, rIdx) => {
                // Determine barcode value for scrap check and year extraction
                const rawBarcode = barcodeColIdx !== -1 ? row[barcodeColIdx] : '';
                const baseBarcode = getCellValue(activeSheetName, rIdx, barcodeColIdx, rawBarcode);
                const actualBarcode = getCellValue(activeSheetName, rIdx, 'actual_serial_no', baseBarcode);
                
                const valInfo = getValidationInfo(actualBarcode);
                const calculatedYear = getMfgYear(actualBarcode);
                const isHighlighted = activeRowIdx === rIdx;

                return (
                  <tr
                    key={rIdx}
                    id={`excel-row-${rIdx}`}
                    className={isHighlighted ? 'highlighted-row' : ''}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      background: isHighlighted 
                        ? 'rgba(var(--color-primary-rgb), 0.15)' 
                        : (valInfo.status === 'scrap' ? 'rgba(220, 53, 69, 0.05)' : 'transparent'),
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Index */}
                    <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 5 }}>
                      {rIdx + 1}
                    </td>

                    {/* Matrix Columns */}
                    {columns.map((col, cIdx) => {
                      if (col.type === 'actual_serial_no') {
                        return (
                          <td key={cIdx} style={{ padding: '4px 6px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <input
                                id={`actual-serial-input-${rIdx}`}
                                type="text"
                                value={actualBarcode || ''}
                                placeholder="Scan actual barcode"
                                onChange={e => handleActualSerialChange(activeSheetName, rIdx, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.target.blur();
                                  }
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  if (val.length > 0 && val.length < 12) {
                                    // Discard invalid value silently
                                    setCellEdits(prev => prev.filter(item => 
                                      !(item.sheet_name === activeSheetName && item.row_idx === rIdx && String(item.col_idx) === 'actual_serial_no')
                                    ));
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  background: 'var(--input-bg)',
                                  border: rowErrors[rIdx] ? '1px solid #dc3545' : '1px solid var(--color-primary)',
                                  color: 'var(--text-main)',
                                  borderRadius: 4,
                                  width: '100%',
                                  fontSize: '0.72rem'
                                }}
                              />
                              {rowErrors[rIdx] && (
                                <span style={{ color: '#dc3545', fontSize: '0.62rem', marginTop: 2 }}>
                                  {rowErrors[rIdx]}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      }

                      if (col.type === 'barcode_length') {
                        return (
                          <td key={cIdx} style={{ padding: '6px 12px', fontWeight: 700, textAlign: 'center', minWidth: 160 }}>
                            {actualBarcode ? actualBarcode.length : 0}
                          </td>
                        );
                      }

                      if (col.type === 'calculated_mfg_year') {
                        return (
                          <td key={cIdx} style={{ padding: '6px 12px', fontWeight: 700, textAlign: 'center', minWidth: 95 }}>
                            {calculatedYear || ''}
                          </td>
                        );
                      }

                      if (col.type === 'scrap') {
                        const isScrap = calculatedYear && calculatedYear <= 2022;
                        return (
                          <td
                            key={cIdx}
                            style={{
                              padding: '6px 12px',
                              fontWeight: 800,
                              textAlign: 'center',
                              minWidth: 95,
                              color: isScrap ? '#dc3545' : 'var(--color-primary)'
                            }}
                          >
                            {isScrap ? 'SCRAP' : '-'}
                          </td>
                        );
                      }

                      if (col.type === 'repairable') {
                        const isRepairable = getCellValue(activeSheetName, rIdx, 'repairable', '') === 'true';
                        return (
                          <td key={cIdx} style={{ padding: '6px 12px', textAlign: 'center', minWidth: 100 }}>
                            <input
                              type="checkbox"
                              checked={isRepairable}
                              onChange={(e) => {
                                handleCellEdit(activeSheetName, rIdx, 'repairable', e.target.checked ? 'true' : 'false');
                              }}
                              style={{
                                cursor: 'pointer',
                                transform: 'scale(1.25)',
                                accentColor: 'var(--color-primary)'
                              }}
                            />
                          </td>
                        );
                      }

                      // Normal Excel cell: Editable on click
                      const cellVal = getCellValue(activeSheetName, rIdx, col.index, row[col.index]);
                      const isEditing = editingCell && editingCell.rowIdx === rIdx && editingCell.colIdx === col.index;

                      return (
                        <td
                          key={cIdx}
                          className="editable-cell"
                          style={{
                            padding: '4px 6px',
                            cursor: 'pointer',
                            minWidth: 100,
                            textAlign: 'center',
                            border: isEditing ? '1px solid var(--color-primary)' : 'none'
                          }}
                          onClick={() => {
                            if (!isEditing) setEditingCell({ rowIdx: rIdx, colIdx: col.index });
                          }}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              defaultValue={cellVal}
                              autoFocus
                              onBlur={(e) => {
                                handleCellEdit(activeSheetName, rIdx, col.index, e.target.value);
                                setEditingCell(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCellEdit(activeSheetName, rIdx, col.index, e.target.value);
                                  setEditingCell(null);
                                }
                              }}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--color-primary)',
                                color: 'var(--text-main)',
                                borderRadius: 4,
                                width: '100%',
                                fontSize: '0.72rem'
                              }}
                            />
                          ) : (
                            <span style={{ display: 'inline-block', width: '100%', minHeight: '1.2rem' }}>
                              {cellVal}
                            </span>
                          )}
                        </td>
                      );
                    })}

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Load More Button */}
        {activeSheetRows.length > visibleRowsCount && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setVisibleRowsCount(prev => prev + 500)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '8px auto 0 auto', padding: '8px 24px', fontSize: '0.75rem' }}
          >
            <ArrowDown size={14} /> Load More Rows ({activeSheetRows.length - visibleRowsCount} remaining)
          </button>
        )}
      </div>
    );
  }

  // File Upload Default view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 12 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', padding: 24, borderRadius: 12, border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12 }}>Excel File Import</h3>
        
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            width: '100%',
            maxWidth: 500,
            border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed var(--card-border)',
            background: isDragging ? 'rgba(var(--color-primary-rgb), 0.05)' : 'rgba(255,255,255,0.01)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
            cursor: 'pointer',
            minHeight: 180,
            transition: 'all 0.2s ease',
            marginBottom: 12
          }}
          onClick={() => document.getElementById('excelFileInput').click()}
        >
          <FileSpreadsheet size={40} color={isDragging ? 'var(--color-primary)' : 'var(--text-muted)'} style={{ marginBottom: 12 }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>Drag and drop Electrolyte Excel here</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>or click to browse (.xlsx, .xls)</span>
          <input
            type="file"
            id="excelFileInput"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
};

export default InwardMappingImportSection;
