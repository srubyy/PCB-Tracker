CREATE TABLE IF NOT EXISTS scan_logs (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL,
  sheet_name VARCHAR(100) NOT NULL,
  row_idx INTEGER NOT NULL,
  dummy_sr_no VARCHAR(100),
  actual_serial_no VARCHAR(100),
  mfg_year INTEGER,
  scrap VARCHAR(10) DEFAULT 'No',
  scanned_by VARCHAR(100),
  session_export_batch INTEGER DEFAULT 1,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS export_history (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL,
  export_number INTEGER NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  exported_by VARCHAR(100),
  total_rows INTEGER,
  scanned_count INTEGER,
  unscanned_count INTEGER,
  scrap_count INTEGER,
  file_name VARCHAR(255)
);
