-- Add last_checkpoint_seen field to panels table
ALTER TABLE panels ADD COLUMN IF NOT EXISTS last_checkpoint_seen INTEGER CHECK (last_checkpoint_seen IN (6, 10)) DEFAULT NULL;

-- Create checkpoint_scans table
CREATE TABLE IF NOT EXISTS checkpoint_scans (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
    panel_id INTEGER REFERENCES panels(id) ON DELETE SET NULL,
    checkpoint_step INTEGER CHECK (checkpoint_step IN (6, 10)),
    scanned_value VARCHAR(100) NOT NULL,
    matched_by VARCHAR(50), -- 'barcode', 'pcb_sr_no', or 'none'
    scanner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_unknown BOOLEAN DEFAULT FALSE
);

-- Create checkpoint_results table
CREATE TABLE IF NOT EXISTS checkpoint_results (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
    checkpoint_step INTEGER CHECK (checkpoint_step IN (6, 10)),
    total_in_scope INTEGER DEFAULT 0,
    total_scanned INTEGER DEFAULT 0,
    total_missing INTEGER DEFAULT 0,
    total_never_touched INTEGER DEFAULT 0,
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lot_id, checkpoint_step)
);

-- Create missing_pcbs table
CREATE TABLE IF NOT EXISTS missing_pcbs (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
    checkpoint_step INTEGER CHECK (checkpoint_step IN (6, 10)),
    panel_id INTEGER REFERENCES panels(id) ON DELETE CASCADE,
    last_step_id INTEGER,
    last_logged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_logged_at TIMESTAMP,
    missing_type VARCHAR(50), -- 'Not scanned at checkpoint' or 'Never touched'
    UNIQUE(lot_id, checkpoint_step, panel_id)
);
