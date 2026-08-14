-- Normalized Seed file for Electrolyte Solutions PCB Refurbishment

-- Seed Clients
INSERT INTO clients (name, contact, email) VALUES ('Atomberg', 'Jane Smith', 'info@atomberg.com') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name, contact, email) VALUES ('Bajaj', 'Bajaj Spares Manager', 'spares@bajaj.com') ON CONFLICT (name) DO NOTHING;

-- Seed Users (with hashed passwords)
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Lead Admin', 'superadmin@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Team Lead', 100.0, 'https://api.dicebear.com/7.x/adventurer/svg?seed=LeadAdmin') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Rahul Gupta', 'rahul.gupta@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Team Lead', 98.2, 'https://api.dicebear.com/7.x/adventurer/svg?seed=RahulGupta') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Mayuri S', 'mayuri.s@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 96.5, 'https://api.dicebear.com/7.x/adventurer/svg?seed=MayuriS') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Akash P', 'akash.p@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 94.0, 'https://api.dicebear.com/7.x/adventurer/svg?seed=AkashP') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Nilam Dhanavde', 'nilam.dhanavde@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 97.1, 'https://api.dicebear.com/7.x/adventurer/svg?seed=NilamDhanavde') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Usha M', 'usha.m@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 95.8, 'https://api.dicebear.com/7.x/adventurer/svg?seed=UshaM') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Swarupa Vishwakarma', 'swarupa.vishwakarma@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 93.4, 'https://api.dicebear.com/7.x/adventurer/svg?seed=SwarupaVishwakarma') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Poonam Lokhande', 'poonam.lokhande@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 96.0, 'https://api.dicebear.com/7.x/adventurer/svg?seed=PoonamLokhande') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Sukhdev S', 'sukhdev.s@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 92.5, 'https://api.dicebear.com/7.x/adventurer/svg?seed=SukhdevS') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Mannsi S', 'mannsi.s@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 95.0, 'https://api.dicebear.com/7.x/adventurer/svg?seed=MannsiS') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Amit Ghabale', 'amit.ghabale@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 96.2, 'https://api.dicebear.com/7.x/adventurer/svg?seed=AmitGhabale') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Sharmila N', 'sharmila.n@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 97.5, 'https://api.dicebear.com/7.x/adventurer/svg?seed=SharmilaN') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('Vijay Kumar', 'vijay.kumar@electrolytesoln.com', '$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2', 'Employee', 94.8, 'https://api.dicebear.com/7.x/adventurer/svg?seed=VijayKumar') ON CONFLICT (name) DO NOTHING;

-- Seed Lots
INSERT INTO lots (lot_no, batch_no, pixel_pitch, client_id, qty_sent, received_qty, status, remarks, scrap_year_threshold, separate_year_threshold, checkbox_year_threshold) VALUES (17, 'DX128', 'P5.9', (SELECT id FROM clients WHERE name = 'Atomberg'), 260, 0, 'In Process', '', 2021, 2022, 2023) ON CONFLICT (lot_no) DO NOTHING;
INSERT INTO lots (lot_no, batch_no, pixel_pitch, client_id, qty_sent, received_qty, status, remarks, scrap_year_threshold, separate_year_threshold, checkbox_year_threshold) VALUES (18, 'DX128', 'P5.9', (SELECT id FROM clients WHERE name = 'Bajaj'), 200, 0, 'In Process', '', 2021, 2022, 2023) ON CONFLICT (lot_no) DO NOTHING;
INSERT INTO lots (lot_no, batch_no, pixel_pitch, client_id, qty_sent, received_qty, status, remarks, scrap_year_threshold, separate_year_threshold, checkbox_year_threshold) VALUES (19, 'DX128', 'P5.9', (SELECT id FROM clients WHERE name = 'Atomberg'), 500, 0, 'In Process', '', 2021, 2022, 2023) ON CONFLICT (lot_no) DO NOTHING;
INSERT INTO lots (lot_no, batch_no, pixel_pitch, client_id, qty_sent, received_qty, status, remarks, scrap_year_threshold, separate_year_threshold, checkbox_year_threshold) VALUES (20, 'DX109', 'P5.9', (SELECT id FROM clients WHERE name = 'Bajaj'), 50, 0, 'In Process', '', 2021, 2022, 2023) ON CONFLICT (lot_no) DO NOTHING;

-- Seed Defect Codes
INSERT INTO defect_codes (code, description, category) VALUES ('IC-FAIL', 'Failed driver IC test (needs replacement)', 'IC Defect') ON CONFLICT (code) DO NOTHING;
INSERT INTO defect_codes (code, description, category) VALUES ('SLD-BRG', 'Solder bridging detected on display pins', 'Solder Bridge') ON CONFLICT (code) DO NOTHING;
INSERT INTO defect_codes (code, description, category) VALUES ('SIL-DMG', 'Damaged silicon coating on PCB back', 'Silicon Damage') ON CONFLICT (code) DO NOTHING;
INSERT INTO defect_codes (code, description, category) VALUES ('PAD-DMG', 'Lifted or torn copper pad', 'Pad Damage') ON CONFLICT (code) DO NOTHING;
INSERT INTO defect_codes (code, description, category) VALUES ('CLK-ERR', 'Clock signal timing error', 'Signal Integrity') ON CONFLICT (code) DO NOTHING;
