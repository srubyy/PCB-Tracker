import pool, { isFallback } from '../config/db.js';
import * as memoryDb from '../services/memoryDb.js';
import ExcelJS from 'exceljs';

const extractMfgYear = (serial) => {
  if (!serial) return null;
  const s = String(serial).trim();
  const len = s.length;
  if (s.startsWith('AT') && len <= 8) return null;
  const matches = s.match(/[a-zA-Z](\d{2})/g);
  if (matches) {
    for (const m of matches) {
      const yr = parseInt(m.substring(1), 10);
      if (yr >= 10 && yr <= 50) return 2000 + yr;
    }
  }
  if (len >= 4) {
    const yrPart = s.substring(2, 4);
    const yr = parseInt(yrPart, 10);
    if (!isNaN(yr) && yr >= 10 && yr <= 50) return 2000 + yr;
  }
  if (len === 16 || len === 17) {
    const yr = parseInt(s.substring(3, 5), 10);
    if (!isNaN(yr)) return yr + 2000;
  }
  if (s.startsWith('AGV')) {
    const cIndex = s.indexOf('C');
    if (cIndex !== -1 && s.length > cIndex + 2) {
      const yr = parseInt(s.substring(cIndex + 1, cIndex + 3), 10);
      if (!isNaN(yr)) return yr + 2000;
    }
  }
  return null;
};

export const buildExportWorkbook = async (
  lotId, rawSheets, lot, cellEdits, scanLogs, allMissing, mismatches6, mismatches10, allMismatches, exportHistory
) => {
  const workbook = new ExcelJS.Workbook();
  const scrapYear = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2021;
  const sepYear = lot && lot.separate_year_threshold !== null ? lot.separate_year_threshold : 2022;
  const chkYear = lot && lot.checkbox_year_threshold !== null ? lot.checkbox_year_threshold : 2023;

  // --- 1. Pivot Summary Sheet ---
  let panels = [];
  if (isFallback()) {
    panels = memoryDb.tables.panels.filter(p => p.lot_id === lotId);
  } else {
    const pRes = await pool.query('SELECT * FROM panels WHERE lot_id = $1', [lotId]);
    panels = pRes.rows;
  }

  const modelsSet = new Set();
  const partCodesSet = new Set();
  panels.forEach(p => {
    if (p.model) modelsSet.add(p.model.trim());
    if (p.part_code) partCodesSet.add(p.part_code.trim());
  });

  const models = Array.from(modelsSet).sort();
  const partCodes = Array.from(partCodesSet).sort();

  const summarySheet = workbook.addWorksheet("Pivot Summary");
  summarySheet.views = [{ showGridLines: true }];

  const headers = ["Part Code", ...models, "Grand Total", "Box Qty"];
  const headerRow = summarySheet.addRow(headers);
  headerRow.height = 25;

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const borderStyle = {
    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
  };

  headers.forEach((h, idx) => {
    const cell = summarySheet.getCell(1, idx + 1);
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderStyle;
  });

  const rowCounts = {};
  const colCounts = {};
  models.forEach(m => { colCounts[m] = 0; });
  let grandTotalSum = 0;
  let boxQtySum = 0;

  partCodes.forEach(pc => {
    rowCounts[pc] = {};
    models.forEach(m => {
      rowCounts[pc][m] = 0;
    });
  });

  panels.forEach(p => {
    const pc = p.part_code ? p.part_code.trim() : '';
    const m = p.model ? p.model.trim() : '';
    if (pc && m && rowCounts[pc] && rowCounts[pc][m] !== undefined) {
      rowCounts[pc][m]++;
    }
  });

  partCodes.forEach(pc => {
    let rowSum = 0;
    const rowVals = [pc];
    models.forEach(m => {
      const cnt = rowCounts[pc][m];
      rowVals.push(cnt);
      rowSum += cnt;
      colCounts[m] += cnt;
    });
    const pcPanels = panels.filter(p => (p.part_code || '').trim() === pc);
    const boxQty = pcPanels.length;

    rowVals.push(rowSum);
    rowVals.push(boxQty);

    grandTotalSum += rowSum;
    boxQtySum += boxQty;

    const dataRow = summarySheet.addRow(rowVals);
    dataRow.height = 20;

    for (let c = 1; c <= headers.length; c++) {
      const cell = summarySheet.getCell(dataRow.number, c);
      cell.font = { name: 'Arial', size: 10 };
      cell.border = borderStyle;
      if (c === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.value = Number(cell.value);
      }
    }
  });

  // Grand Total Row
  const gtRowVals = ["Grand Total"];
  models.forEach(m => {
    gtRowVals.push(colCounts[m]);
  });
  gtRowVals.push(grandTotalSum);
  gtRowVals.push(boxQtySum);

  const gtRow = summarySheet.addRow(gtRowVals);
  gtRow.height = 22;

  const numModels = models.length;
  summarySheet.mergeCells(gtRow.number, 1, gtRow.number, numModels + 1);

  const gtCell = summarySheet.getCell(gtRow.number, 1);
  gtCell.value = "Grand Total";
  gtCell.alignment = { horizontal: 'center', vertical: 'middle' };
  gtCell.font = { name: 'Arial', size: 10, bold: true };
  gtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  gtCell.border = borderStyle;

  for (let c = 2; c <= headers.length; c++) {
    const cell = summarySheet.getCell(gtRow.number, c);
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.border = borderStyle;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    if (c > numModels + 1) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.value = Number(cell.value);
    }
  }

  summarySheet.columns.forEach(column => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const val = String(cell.value || '');
      if (val) maxLen = Math.max(maxLen, val.length);
    });
    column.width = Math.max(maxLen + 4, 12);
  });

  // --- Helper Functions ---
  const formatLocalTime = (dateInput) => {
    if (!dateInput) return '';
    const dObj = new Date(dateInput);
    if (isNaN(dObj.getTime())) return String(dateInput);
    const pad = (num) => String(num).padStart(2, '0');
    return `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}:${pad(dObj.getSeconds())}`;
  };

  const findColumnIndices = (sheetRows) => {
    let dummyColIdx = -1;
    let barcodeColIdx = -1;
    let mfgYearColIdx = -1;
    let partCodeColIdx = -1;
    let modelColIdx = -1;
    let boxColIdx = -1;

    const limitRows = Math.min(sheetRows.length, 20);
    for (let r = 0; r < limitRows; r++) {
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
        if (partCodeColIdx === -1 && (val === 'part code' || val === 'part_code' || val === 'partcode')) {
          partCodeColIdx = c;
        }
        if (modelColIdx === -1 && (val === 'model' || val === 'model name' || val === 'product model')) {
          modelColIdx = c;
        }
        if (boxColIdx === -1 && (val === 'box' || val === 'box no' || val === 'box_no' || val === 'box number')) {
          boxColIdx = c;
        }
      }
    }
    return { dummyColIdx, barcodeColIdx, mfgYearColIdx, partCodeColIdx, modelColIdx, boxColIdx };
  };

  const processSheets = (sheetsObj, logsList) => {
    if (!sheetsObj) return {};
    const processed = {};
    Object.keys(sheetsObj).forEach(sheetName => {
      const rows = sheetsObj[sheetName] || [];
      if (rows.length === 0) {
        processed[sheetName] = rows;
        return;
      }

      const header = rows[0] || [];
      let dateColIdx = -1;
      let monthColIdx = -1;
      for (let c = 0; c < header.length; c++) {
        const val = String(header[c] || '').trim().toLowerCase();
        if (val === 'date') dateColIdx = c;
        if (val === 'month') monthColIdx = c;
      }

      const appendTime = (monthColIdx === -1);
      const appendDate = (dateColIdx === -1);

      const newRows = [];
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = [...rows[rIdx]];
        if (rIdx === 0) {
          if (monthColIdx !== -1) {
            row[monthColIdx] = 'Time';
          } else {
            row.push('Time');
          }
          if (dateColIdx !== -1) {
            row[dateColIdx] = 'Date';
          } else {
            row.push('Date');
          }
        } else {
          const log = logsList.find(l => l.sheet_name === sheetName && Number(l.row_idx) === rIdx);
          let scanDateStr = '';
          let scanTimeStr = '';
          if (log && log.timestamp) {
            const parts = String(log.timestamp).split(' ');
            if (parts.length === 2) {
              scanDateStr = parts[0];
              scanTimeStr = parts[1];
            } else {
              const dObj = new Date(log.timestamp);
              if (!isNaN(dObj.getTime())) {
                const pad = (num) => String(num).padStart(2, '0');
                scanDateStr = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
                scanTimeStr = `${pad(dObj.getHours())}:${pad(dObj.getMinutes())}:${pad(dObj.getSeconds())}`;
              }
            }
          }

          if (monthColIdx !== -1) {
            row[monthColIdx] = scanTimeStr || '-';
          }
          if (dateColIdx !== -1) {
            if (scanDateStr) {
              row[dateColIdx] = scanDateStr;
            }
          }

          if (appendTime) {
            row.push(scanTimeStr || '-');
          }
          if (appendDate) {
            row.push(scanDateStr || '');
          }
        }
        newRows.push(row);
      }
      processed[sheetName] = newRows;
    });
    return processed;
  };

  // --- 2. Raw Spreadsheet Sheets ---
  const processedSheets = processSheets(rawSheets, scanLogs);

  for (const sheetName of Object.keys(processedSheets)) {
    const rows = processedSheets[sheetName] || [];
    if (rows.length === 0) continue;

    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.views = [{ showGridLines: true }];

    const header = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
    let dummyColIdx = -1;
    let barcodeColIdx = -1;
    for (let i = 0; i < header.length; i++) {
      const val = header[i];
      if (val.includes('pcb sr no') || val.includes('pcb serial') || val.includes('dummy') || val.includes('sr no') || val.includes('sr_no')) {
        if (dummyColIdx === -1) dummyColIdx = i;
      }
      if (val.includes('barcode') || val.includes('actual serial') || val.includes('real serial')) {
        if (barcodeColIdx === -1) barcodeColIdx = i;
      }
    }

    const insertPos = dummyColIdx !== -1 ? dummyColIdx + 1 : 1;
    const sheetEdits = cellEdits.filter(e => e.sheet_name === sheetName);

    const originalHeader = [...rows[0]];
    sheetEdits.forEach(edit => {
      if (Number(edit.row_idx) === 0) {
        const cIdx = Number(edit.col_idx);
        if (!isNaN(cIdx) && cIdx >= 0 && cIdx < originalHeader.length) {
          originalHeader[cIdx] = edit.value;
        }
      }
    });

    const virtualHeaders = ["Actual Serial No", "Length of Actual Serial No", "Mfg Year", "Action"];
    const finalHeader = [...originalHeader];
    virtualHeaders.forEach((vH, index) => {
      finalHeader.splice(insertPos + index, 0, vH);
    });

    const headerRowObj = worksheet.addRow(finalHeader);
    headerRowObj.height = 25;

    const virtualFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    const virtualFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
    const normalFont = { name: 'Arial', size: 10 };

    for (let colIdx = 1; colIdx <= finalHeader.length; colIdx++) {
      const cell = worksheet.getCell(1, colIdx);
      const cellVal = String(cell.value || '');
      if (virtualHeaders.includes(cellVal)) {
        cell.fill = virtualFill;
        cell.font = virtualFont;
      } else {
        cell.fill = headerFill;
        cell.font = headerFont;
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    }

    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const originalRow = [...rows[rIdx]];

      sheetEdits.forEach(edit => {
        if (Number(edit.row_idx) === rIdx) {
          const cIdx = Number(edit.col_idx);
          if (!isNaN(cIdx) && cIdx >= 0 && cIdx < originalRow.length) {
            originalRow[cIdx] = edit.value;
          }
        }
      });

      let actualBarcode = '';
      const barcodeEdit = sheetEdits.find(e => Number(e.row_idx) === rIdx && String(e.col_idx) === 'actual_serial_no');
      if (barcodeEdit) {
        actualBarcode = barcodeEdit.value;
      } else if (barcodeColIdx !== -1 && barcodeColIdx < originalRow.length) {
        actualBarcode = originalRow[barcodeColIdx];
      }

      actualBarcode = String(actualBarcode || '').trim();
      if (actualBarcode === '-') actualBarcode = '';

      const barcodeLength = actualBarcode ? actualBarcode.length : 0;
      const calculatedYear = extractMfgYear(actualBarcode);

      let repairableVal = 'No';
      const repairableEdit = sheetEdits.find(e => Number(e.row_idx) === rIdx && String(e.col_idx) === 'repairable');
      if (repairableEdit) {
        repairableVal = repairableEdit.value === 'true' ? 'Yes' : 'No';
      }

      let actionVal = !actualBarcode ? 'Pending' : '-';
      if (calculatedYear) {
        if (calculatedYear <= scrapYear) {
          actionVal = 'Scrap';
        } else if (lot && lot.separate_year_threshold !== null && calculatedYear === sepYear) {
          actionVal = 'Separate';
        } else if (calculatedYear >= chkYear) {
          actionVal = (repairableVal === 'Yes') ? 'Repairable' : 'Non-Repairable';
        }
      }

      const yearDisplay = calculatedYear ? String(calculatedYear) : '';

      const finalRowData = [...originalRow];
      const virtualValues = [actualBarcode, barcodeLength, yearDisplay, actionVal];
      virtualValues.forEach((val, index) => {
        finalRowData.splice(insertPos + index, 0, val);
      });

      const dataRow = worksheet.addRow(finalRowData);
      dataRow.height = 20;

      const hasScanLog = scanLogs.some(l => l.sheet_name === sheetName && Number(l.row_idx) === rIdx);
      let rowBgColor = null;
      let rowFontColor = 'FF000000';

      if (actionVal === 'Scrap') {
        rowBgColor = 'FFFFC7CE';
        rowFontColor = 'FF9C0006';
      } else if (actionVal === 'Separate') {
        rowBgColor = 'FFFFEB9C';
        rowFontColor = 'FF9C6500';
      } else if (hasScanLog) {
        rowBgColor = 'FFC6EFCE';
        rowFontColor = 'FF006100';
      }

      for (let colIdx = 1; colIdx <= finalHeader.length; colIdx++) {
        const cell = worksheet.getCell(dataRow.number, colIdx);
        cell.font = normalFont;
        cell.border = borderStyle;

        if (rowBgColor) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
          cell.font = { name: 'Arial', size: 10, color: { argb: rowFontColor } };
        }

        const cellVal = String(cell.value || '');
        if (/^\d+$/.test(cellVal)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.value = Number(cellVal);
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    }

    worksheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const val = String(cell.value || '');
        if (val) maxLen = Math.max(maxLen, val.length);
      });
      column.width = Math.max(maxLen + 4, 12);
    });
  }

  // --- 3. Export History Sheet ---
  if (exportHistory && exportHistory.length > 0) {
    const historySheet = workbook.addWorksheet("Export History");
    historySheet.views = [{ showGridLines: true }];

    const historyHeaders = ["Export Number", "Timestamp", "PCBs Scanned", "Who Exported"];
    const historyHeaderRow = historySheet.addRow(historyHeaders);
    historyHeaderRow.height = 25;

    for (let colIdx = 1; colIdx <= historyHeaders.length; colIdx++) {
      const cell = historySheet.getCell(1, colIdx);
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    }

    exportHistory.forEach(hist => {
      const rowData = [
        hist.export_number,
        hist.timestamp,
        hist.scanned_count,
        hist.exported_by || 'Unknown'
      ];
      const dataRow = historySheet.addRow(rowData);
      dataRow.height = 20;

      for (let colIdx = 1; colIdx <= historyHeaders.length; colIdx++) {
        const cell = historySheet.getCell(dataRow.number, colIdx);
        cell.font = normalFont;
        cell.border = borderStyle;
        const cellVal = String(cell.value || '');
        if (/^\d+$/.test(cellVal)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.value = Number(cellVal);
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    });

    historySheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const val = String(cell.value || '');
        if (val) maxLen = Math.max(maxLen, val.length);
      });
      column.width = Math.max(maxLen + 4, 12);
    });
  }

  // --- 4. Missing PCBs ---
  if (allMissing && allMissing.length > 0) {
    const missingSheet = workbook.addWorksheet("🔴 Missing PCBs");
    missingSheet.views = [{ showGridLines: true }];

    const missingHeaders = [
      "PCB Sr No", "Actual Serial No", "Part Code", "Model", "Mfg Year", 
      "Action", "Last Step Logged", "Logged By", "Last Logged At", 
      "Checkpoint Where Missing", "Missing Type", "Delta Context",
      "Resolution Action", "Resolution Note", "Resolved By", "Resolved At"
    ];
    const missingHeaderRow = missingSheet.addRow(missingHeaders);
    missingHeaderRow.height = 25;

    const redHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    const whiteHeaderFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

    for (let colIdx = 1; colIdx <= missingHeaders.length; colIdx++) {
      const cell = missingSheet.getCell(1, colIdx);
      cell.fill = redHeaderFill;
      cell.font = whiteHeaderFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    }

    allMissing.forEach(m => {
      const stepMismatches = m.checkpoint_step === 6 ? mismatches6 : mismatches10;
      const mismatch = stepMismatches.find(mis => mis.part_code === m.part_code);
      let deltaContext = '';
      if (mismatch) {
        deltaContext = `Part code ${m.part_code}: ${mismatch.expected} expected at Step ${m.checkpoint_step}, only ${mismatch.scanned} scanned — ${mismatch.delta} missing`;
      }

      const rowData = [
        m.pcb_sr_no || '-',
        m.barcode || '-',
        m.part_code || '-',
        m.model || '-',
        m.mfg_year || '-',
        m.action || '-',
        m.last_step_name || 'N/A',
        m.last_logged_by_name || 'N/A',
        m.last_logged_at ? formatLocalTime(m.last_logged_at) : 'N/A',
        `Step ${m.checkpoint_step}`,
        m.missing_type,
        deltaContext,
        m.resolution_action || 'Unresolved',
        m.resolution_note || '-',
        m.resolved_by_name || '-',
        m.resolved_at ? formatLocalTime(m.resolved_at) : '-'
      ];

      const dataRow = missingSheet.addRow(rowData);
      dataRow.height = 22;

      const isNeverTouched = m.missing_type === 'Never touched';
      const isResolved = !!m.resolution_action;

      const rowBgColor = isResolved ? 'FFC6EFCE' : (isNeverTouched ? 'FFFFC7CE' : 'FFFFEB9C');
      const rowFontColor = isResolved ? 'FF006100' : (isNeverTouched ? 'FF9C0006' : 'FF9C6500');

      for (let colIdx = 1; colIdx <= missingHeaders.length; colIdx++) {
        const cell = missingSheet.getCell(dataRow.number, colIdx);
        cell.font = { name: 'Arial', size: 10, color: { argb: rowFontColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
        cell.border = borderStyle;
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    missingSheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const val = String(cell.value || '');
        if (val) maxLen = Math.max(maxLen, val.length);
      });
      column.width = Math.max(maxLen + 4, 12);
    });
  }

  // --- 5. Count Mismatch ---
  if (allMismatches && allMismatches.length > 0) {
    const mismatchSheet = workbook.addWorksheet("⚠️ Count Mismatch");
    mismatchSheet.views = [{ showGridLines: true }];

    const mismatchHeaders = [
      "Checkpoint", "Part Code", "Step-by-step breakdown", 
      "Total expected at checkpoint", "Total scanned at checkpoint", "Delta", 
      "First step where count dropped"
    ];
    const misHeaderRow = mismatchSheet.addRow(mismatchHeaders);
    misHeaderRow.height = 25;

    const orangeHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE26B0A' } };
    const whiteHeaderFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

    for (let colIdx = 1; colIdx <= mismatchHeaders.length; colIdx++) {
      const cell = mismatchSheet.getCell(1, colIdx);
      cell.fill = orangeHeaderFill;
      cell.font = whiteHeaderFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    }

    allMismatches.forEach(m => {
      const rowData = [
        `Step ${m.step}`,
        m.part_code,
        m.steps_breakdown,
        m.expected,
        m.scanned,
        m.delta,
        m.first_step_dropped
      ];

      const dataRow = mismatchSheet.addRow(rowData);
      dataRow.height = 20;

      for (let colIdx = 1; colIdx <= mismatchHeaders.length; colIdx++) {
        const cell = mismatchSheet.getCell(dataRow.number, colIdx);
        cell.font = normalFont;
        cell.border = borderStyle;
        const cellVal = String(cell.value || '');
        if (/^-?\d+$/.test(cellVal)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.value = Number(cellVal);
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    });

    mismatchSheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const val = String(cell.value || '');
        if (val) maxLen = Math.max(maxLen, val.length);
      });
      column.width = Math.max(maxLen + 4, 12);
    });
  }

  return workbook;
};
