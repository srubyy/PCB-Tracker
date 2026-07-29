CREATE TABLE IF NOT EXISTS client_part_codes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  part_code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  UNIQUE(client_id, part_code)
);

CREATE TABLE IF NOT EXISTS lot_part_code_baselines (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
  part_code VARCHAR(100) NOT NULL,
  verified_qty INTEGER NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(lot_id, part_code)
);

-- Seed Atomberg part codes presets by matching name
INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0019', 'PCB GV2_CFEfficio' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0021', 'GV2 Main PCB 1200mm Reg_28W' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0022', 'GV2 Main PCB 1400mm Reg 35W' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0011', 'PCB GV3 Digital Renesat' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0010', 'GV3 Smart Digital 1200mm' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0061', 'GV3 Power PCB White' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0060', 'GV3 Power PCB Black' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0039', 'GV4 Studio+ Remote 1200mm' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0038', 'GV4 Alpha PCB_Regulator_1200mm' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;

INSERT INTO client_part_codes (client_id, part_code, name)
SELECT id, 'SA0087', 'GV4 Ozeo PCB_Main_1200mm' FROM clients WHERE name ILIKE '%Atomberg%'
ON CONFLICT (client_id, part_code) DO NOTHING;
