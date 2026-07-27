-- Migration 020: Checkpoint Resolutions and Acknowledgements
ALTER TABLE missing_pcbs
ADD COLUMN IF NOT EXISTS resolution_action VARCHAR(50) CHECK (resolution_action IN ('Found', 'Lost', 'Reassigned')) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS resolution_note TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP DEFAULT NULL;

CREATE TABLE IF NOT EXISTS checkpoint_acknowledgements (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
    checkpoint_step INTEGER CHECK (checkpoint_step IN (6, 10)),
    acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lot_id, checkpoint_step)
);
