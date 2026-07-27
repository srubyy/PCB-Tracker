import pool from '../backend/src/config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extractMfgYear = (serial) => {
  if (!serial) return null;
  const s = String(serial).trim();
  const len = s.length;

  if (s.startsWith('AT') && len <= 8) {
    return null;
  }

  const matches = s.match(/[a-zA-Z](\d{2})/g);
  if (matches) {
    for (const m of matches) {
      const yr = parseInt(m.substring(1), 10);
      if (yr >= 10 && yr <= 50) {
        return 2000 + yr;
      }
    }
  }

  if (len >= 4) {
    const yrPart = s.substring(2, 4);
    const yr = parseInt(yrPart, 10);
    if (!isNaN(yr) && yr >= 10 && yr <= 50) {
      return 2000 + yr;
    }
  }

  if (len === 16 || len === 17) {
    const yr = parseInt(s.substring(3, 5), 10);
    if (!isNaN(yr)) return yr + 2000;
  }
  return null;
};

const findColumnIndices = (sheetRows) => {
  let dummyColIdx = -1;
  let barcodeColIdx = -1;
  let mfgYearColIdx = -1;
  let partCodeColIdx = -1;
  let modelColIdx = -1;

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
      if (partCodeColIdx === -1 && (val === 'part code' || val === 'part_code' || val === 'partcode')) {
        partCodeColIdx = c;
      }
      if (modelColIdx === -1 && (val === 'model' || val === 'model name' || val === 'product model')) {
        modelColIdx = c;
      }
    }
  }
  return { dummyColIdx, barcodeColIdx, mfgYearColIdx, partCodeColIdx, modelColIdx };
};

const run = async () => {
  try {
    const client = await pool.connect();
    
    // Get all lots
    const lotsRes = await client.query('SELECT id, lot_no FROM lots');
    console.log(`Found ${lotsRes.rows.length} lots in database.`);

    const workspaceRoot = '/Users/srutibaliga/Documents/Projects/Electrolyte';

    for (const lot of lotsRes.rows) {
      const lotId = lot.id;
      const rawJsonPath = path.join(workspaceRoot, 'uploads', `lot_${lotId}_raw.json`);
      if (!fs.existsSync(rawJsonPath)) {
        console.log(`No raw JSON found for lot ${lot.lot_no} at ${rawJsonPath}`);
        continue;
      }

      console.log(`Syncing lot ${lot.lot_no} (ID: ${lotId}) from ${rawJsonPath}...`);
      const sheets = JSON.parse(fs.readFileSync(rawJsonPath, 'utf8'));
      
      let targetSheetName = null;
      let maxMatchingRows = 0;
      for (const [sheetName, rows] of Object.entries(sheets)) {
        const { dummyColIdx, barcodeColIdx } = findColumnIndices(rows);
        if (dummyColIdx !== -1 || barcodeColIdx !== -1) {
          if (rows.length > maxMatchingRows) {
            maxMatchingRows = rows.length;
            targetSheetName = sheetName;
          }
        }
      }
      if (!targetSheetName) {
        let maxRows = 0;
        for (const [sheetName, rows] of Object.entries(sheets)) {
          if (rows.length > maxRows) {
            maxRows = rows.length;
            targetSheetName = sheetName;
          }
        }
      }
      if (!targetSheetName) continue;

      console.log(`Selected sheet: "${targetSheetName}" for lot ${lot.lot_no}`);

      const rows = sheets[targetSheetName];
      const { dummyColIdx, barcodeColIdx, partCodeColIdx, modelColIdx } = findColumnIndices(rows);
      console.log(`Indices - dummy: ${dummyColIdx}, barcode: ${barcodeColIdx}, partCode: ${partCodeColIdx}, model: ${modelColIdx}`);

      // Delete existing panels of this lot so we can cleanly recreate them with all fields populated!
      console.log(`Clearing and recreating panels for lot ${lotId} to ensure complete sync...`);
      await client.query('DELETE FROM panels WHERE lot_id = $1', [lotId]);

      let panelsCreated = 0;
      let skippedCount = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const dummy = dummyColIdx !== -1 ? String(row[dummyColIdx] || '').trim() : '';
        const rawBarcode = barcodeColIdx !== -1 ? String(row[barcodeColIdx] || '').trim() : '';
        const partCode = partCodeColIdx !== -1 ? String(row[partCodeColIdx] || '').trim() : '';
        const model = modelColIdx !== -1 ? String(row[modelColIdx] || '').trim() : '';

        if (r < 5) {
          const isHeader = [dummy, rawBarcode].some(val => {
            const l = val.toLowerCase();
            return l.includes('pcb sr') || l.includes('barcode') || l.includes('serial') || l.includes('sr no');
          });
          if (isHeader) continue;
        }

        if (!dummy && !rawBarcode) continue;

        const hasRealBarcode = rawBarcode && rawBarcode !== '-';
        const barcode = hasRealBarcode ? rawBarcode : (dummy || `DUMMY-${lotId}-${r + 1}-${Date.now()}`);
        const mfgYear = hasRealBarcode ? extractMfgYear(rawBarcode) : null;
        let status = 'Repairable';
        let scrapReason = null;
        if (mfgYear && mfgYear <= 2022) {
          status = 'Scrap';
          scrapReason = `Manufacturing Year (${mfgYear}) <= 2022`;
        }

        const excelData = {};
        row.forEach((cell, cIdx) => {
          excelData[`Col_${cIdx}`] = cell;
        });

        try {
          await client.query(`
            INSERT INTO panels (lot_id, sr_no, dummy_sr_no, real_sr_no, barcode, box_no, mfg_year, part_code, model, status, scrap_reason, excel_data, current_step)
            VALUES ($1, $2, $3, $4, $5, 'Box 1', $6, $7, $8, $9, $10, $11, 1)
          `, [lotId, r + 1, dummy, hasRealBarcode ? rawBarcode : '', barcode, mfgYear, partCode, model, status, scrapReason, JSON.stringify(excelData)]);
          panelsCreated++;
        } catch (dbErr) {
          if (dbErr.code === '23505') {
            skippedCount++;
          } else {
            throw dbErr;
          }
        }
      }
      console.log(`Recreated ${panelsCreated} panels for lot ${lot.lot_no}. (Skipped ${skippedCount} duplicate barcodes)`);
    }

    client.release();
    console.log("Re-sync complete!");
  } catch (err) {
    console.error("Failed to re-sync panels:", err);
  } finally {
    pool.end();
  }
};

run();
