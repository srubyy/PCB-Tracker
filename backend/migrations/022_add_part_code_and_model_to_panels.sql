-- Migration 022: Add part_code and model columns to panels table
ALTER TABLE panels ADD COLUMN IF NOT EXISTS part_code VARCHAR(100);
ALTER TABLE panels ADD COLUMN IF NOT EXISTS model VARCHAR(100);

-- Extract and populate existing panels' part_code and model from excel_data
UPDATE panels 
SET 
  part_code = COALESCE(excel_data->>'Col_3', excel_data->>'Part Code', ''),
  model = COALESCE(excel_data->>'Col_5', excel_data->>'Model', '')
WHERE excel_data IS NOT NULL;
