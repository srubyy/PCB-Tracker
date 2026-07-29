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

-- Seed Atomberg (client_id = 2) part codes presets
INSERT INTO client_part_codes (client_id, part_code, name) VALUES
(2, 'SA0019', 'PCB GV2_CFEfficio'),
(2, 'SA0021', 'GV2 Main PCB 1200mm Reg_28W'),
(2, 'SA0022', 'GV2 Main PCB 1400mm Reg 35W'),
(2, 'SA0011', 'PCB GV3 Digital Renesat'),
(2, 'SA0010', 'GV3 Smart Digital 1200mm'),
(2, 'SA0061', 'GV3 Power PCB White'),
(2, 'SA0060', 'GV3 Power PCB Black'),
(2, 'SA0039', 'GV4 Studio+ Remote 1200mm'),
(2, 'SA0038', 'GV4 Alpha PCB_Regulator_1200mm'),
(2, 'SA0087', 'GV4 Ozeo PCB_Main_1200mm')
ON CONFLICT (client_id, part_code) DO NOTHING;
