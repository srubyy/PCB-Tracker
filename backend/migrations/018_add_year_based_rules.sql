-- Migration: Add scrap_year_threshold, separate_year_threshold, checkbox_year_threshold, and created_by to lots
-- Update status values from 'In Process' / 'Complete' to 'Active' / 'Closed'

ALTER TABLE lots ADD COLUMN IF NOT EXISTS scrap_year_threshold INTEGER;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS separate_year_threshold INTEGER;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS checkbox_year_threshold INTEGER;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);

-- Update existing statuses
UPDATE lots SET status = 'Active' WHERE status = 'In Process';
UPDATE lots SET status = 'Closed' WHERE status = 'Complete';
