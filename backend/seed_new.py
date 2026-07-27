import os

# Dynamically resolve directory relative to this script file
script_dir = os.path.dirname(os.path.abspath(__file__))
seed_sql_path = os.path.join(script_dir, "seed_new.sql")

print("Generating seed_new.sql dynamically with normalized schema relationships...")

# Pre-computed bcrypt hash of "Electrolyte2026!" using salt rounds 10
BCRYPT_PASSWORD_HASH = "$2b$10$lMGisEmMq5w8.GUVjc.gzO.e1JbAG97vn8a/paPQYyMyaCi5ssHs2"

clients = [
    {"name": "Atomberg", "contact": "Jane Smith", "email": "info@atomberg.com"},
    {"name": "Bajaj", "contact": "Bajaj Spares Manager", "email": "spares@bajaj.com"}
]

users = [
    {"name": "Lead Admin", "role": "Team Lead", "attendance": 100.0, "email": "superadmin@electrolytesoln.com"},
    {"name": "Rahul Gupta", "role": "Team Lead", "attendance": 98.2, "email": "rahul.gupta@electrolytesoln.com"},
    {"name": "Mayuri S", "role": "Employee", "attendance": 96.5, "email": "mayuri.s@electrolytesoln.com"},
    {"name": "Akash P", "role": "Employee", "attendance": 94.0, "email": "akash.p@electrolytesoln.com"},
    {"name": "Nilam Dhanavde", "role": "Employee", "attendance": 97.1, "email": "nilam.dhanavde@electrolytesoln.com"},
    {"name": "Usha M", "role": "Employee", "attendance": 95.8, "email": "usha.m@electrolytesoln.com"},
    {"name": "Swarupa Vishwakarma", "role": "Employee", "attendance": 93.4, "email": "swarupa.vishwakarma@electrolytesoln.com"},
    {"name": "Poonam Lokhande", "role": "Employee", "attendance": 96.0, "email": "poonam.lokhande@electrolytesoln.com"},
    {"name": "Sukhdev S", "role": "Employee", "attendance": 92.5, "email": "sukhdev.s@electrolytesoln.com"},
    {"name": "Mannsi S", "role": "Employee", "attendance": 95.0, "email": "mannsi.s@electrolytesoln.com"},
    {"name": "Amit Ghabale", "role": "Employee", "attendance": 96.2, "email": "amit.ghabale@electrolytesoln.com"},
    {"name": "Sharmila N", "role": "Employee", "attendance": 97.5, "email": "sharmila.n@electrolytesoln.com"},
    {"name": "Vijay Kumar", "role": "Employee", "attendance": 94.8, "email": "vijay.kumar@electrolytesoln.com"},
]

lots = [
    {"lot_no": 17, "batch_no": "DX128", "pixel_pitch": "P5.9", "client_name": "Atomberg", "qty_sent": 260, "received_qty": 260, "status": "Complete", "remarks": "Successfully completed all refurbishment steps and dispatched."},
    {"lot_no": 18, "batch_no": "DX128", "pixel_pitch": "P5.9", "client_name": "Bajaj", "qty_sent": 200, "received_qty": 200, "status": "In Process", "remarks": "139 dispatched. 61 pending in various steps. 48 panels pending dispatch."},
    {"lot_no": 19, "batch_no": "DX128", "pixel_pitch": "P5.9", "client_name": "Atomberg", "qty_sent": 500, "received_qty": 500, "status": "In Process", "remarks": "Large batch, currently in early triage and panel assignment stages."},
    {"lot_no": 20, "batch_no": "DX109", "pixel_pitch": "P5.9", "client_name": "Bajaj", "qty_sent": 50, "received_qty": 50, "status": "In Process", "remarks": "Received recently, initial panel assign in progress."}
]

lot_18_panels = []
for sr in [100, 102, 103, 106, 109, 110, 116, 121, 124, 126, 130, 131, 132, 133, 138, 141, 142]:
    side = "Left" if sr % 2 == 0 else "Right"
    lot_18_panels.append({"sr_no": sr, "side": side, "step": 12, "status": "Repairable"})
for i in range(150, 181):
    side = "Left" if i % 3 == 0 else "Right"
    lot_18_panels.append({"sr_no": i, "side": side, "step": 12, "status": "Repairable"})
for i in range(1, 14):
    side = "Left" if i % 2 == 0 else "Right"
    lot_18_panels.append({"sr_no": i + 20, "side": side, "step": min(i, 12), "status": "Repairable"})

lot_19_panels = [
    {"sr_no": 382, "side": "Right", "step": 3, "status": "Repairable", "engineer": "Sharmila N"},
    {"sr_no": 384, "side": "Right", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 386, "side": "Right", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 388, "side": "Right", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 393, "side": "Left", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 394, "side": "Left", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 396, "side": "Left", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 398, "side": "Left", "step": 3, "status": "Repairable", "engineer": "Rahul Gupta"},
    {"sr_no": 400, "side": "Left", "step": 3, "status": "Repairable", "engineer": "Sharmila N"},
]
for i in range(1, 41):
    side = "Left" if i % 2 == 0 else "Right"
    lot_19_panels.append({"sr_no": i, "side": side, "step": 1, "status": "Repairable"})

def make_barcode(lot_no, pitch, batch, side, sr):
    pitch_str = pitch.replace(".", "")
    side_char = side[0]
    sr_str = f"{sr:04d}"
    return f"ESRP2{pitch_str}{lot_no}E26{batch}{side_char}{sr_str}"

defect_codes = [
    {"code": "IC-FAIL", "desc": "Failed driver IC test (needs replacement)", "cat": "IC Defect"},
    {"code": "SLD-BRG", "desc": "Solder bridging detected on display pins", "cat": "Solder Bridge"},
    {"code": "SIL-DMG", "desc": "Damaged silicon coating on PCB back", "cat": "Silicon Damage"},
    {"code": "PAD-DMG", "desc": "Lifted or torn copper pad", "cat": "Pad Damage"},
    {"code": "CLK-ERR", "desc": "Clock signal timing error", "cat": "Signal Integrity"},
]

with open(seed_sql_path, "w", encoding="utf-8") as f:
    f.write("-- Normalized Seed file for Electrolyte Solutions PCB Refurbishment\n\n")
    
    # 1. Seed Clients
    f.write("-- Seed Clients\n")
    for client in clients:
        f.write(f"INSERT INTO clients (name, contact, email) VALUES ('{client['name']}', '{client['contact']}', '{client['email']}') ON CONFLICT (name) DO NOTHING;\n")
    f.write("\n")
    
    # 2. Seed Users
    f.write("-- Seed Users (with hashed passwords)\n")
    for user in users:
        avatar = f"https://api.dicebear.com/7.x/adventurer/svg?seed={user['name'].replace(' ', '')}"
        f.write(f"INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) VALUES ('{user['name']}', '{user['email']}', '{BCRYPT_PASSWORD_HASH}', '{user['role']}', {user['attendance']}, '{avatar}') ON CONFLICT (name) DO NOTHING;\n")
    f.write("\n")
    
    # 3. Seed Lots
    f.write("-- Seed Lots\n")
    for lot in lots:
        f.write(f"INSERT INTO lots (lot_no, batch_no, pixel_pitch, client_id, qty_sent, received_qty, status, remarks) VALUES ({lot['lot_no']}, '{lot['batch_no']}', '{lot['pixel_pitch']}', (SELECT id FROM clients WHERE name = '{lot['client_name']}'), {lot['qty_sent']}, {lot['received_qty']}, '{lot['status']}', '{lot['remarks']}') ON CONFLICT (lot_no) DO NOTHING;\n")
    f.write("\n")
    
    # Helpers for subqueries
    def lot_sub(lot_no):
        return f"(SELECT id FROM lots WHERE lot_no = {lot_no})"
        
    def user_sub(name):
        return f"(SELECT id FROM users WHERE name = '{name}')"
        
    def step_sub(step_no):
        return f"(SELECT id FROM repair_steps WHERE step_no = {step_no})"

    # 4. Seed Defect Codes
    f.write("-- Seed Defect Codes\n")
    for df in defect_codes:
        f.write(f"INSERT INTO defect_codes (code, description, category) VALUES ('{df['code']}', '{df['desc']}', '{df['cat']}') ON CONFLICT (code) DO NOTHING;\n")
    f.write("\n")

    # 5. Seed Panels & Activity logs for Lot 18
    f.write("-- Seed Panels and Activity Logs for Lot 18\n")
    for panel in lot_18_panels:
        barcode = make_barcode(18, "P5.9", "128", panel["side"], panel["sr_no"])
        eng_name = "Mayuri S" if panel["sr_no"] % 2 == 0 else "Akash P"
        f.write(f"INSERT INTO panels (lot_id, sr_no, side, barcode, status, current_step, assigned_engineer_id) VALUES ({lot_sub(18)}, {panel['sr_no']}, '{panel['side']}', '{barcode}', '{panel['status']}', {panel['step']}, {user_sub(eng_name)}) ON CONFLICT (barcode) DO NOTHING;\n")
        
        # Log active history for these steps
        for step in range(1, panel["step"] + 1):
            f.write(f"INSERT INTO panel_logs (panel_id, step_id, engineer_id, status, remark) VALUES ((SELECT id FROM panels WHERE barcode = '{barcode}'), {step_sub(step)}, {user_sub(eng_name)}, 'OK', 'Completed step successfully') ON CONFLICT DO NOTHING;\n")

    # 6. Seed Panels & Activity logs for Lot 19
    f.write("\n-- Seed Panels and Activity Logs for Lot 19\n")
    for panel in lot_19_panels:
        barcode = make_barcode(19, "P5.9", "128", panel["side"], panel["sr_no"])
        eng_name = panel.get("engineer", "Sharmila N")
        f.write(f"INSERT INTO panels (lot_id, sr_no, side, barcode, status, current_step, assigned_engineer_id) VALUES ({lot_sub(19)}, {panel['sr_no']}, '{panel['side']}', '{barcode}', '{panel['status']}', {panel['step']}, {user_sub(eng_name)}) ON CONFLICT (barcode) DO NOTHING;\n")
        
        for step in range(1, panel["step"] + 1):
            f.write(f"INSERT INTO panel_logs (panel_id, step_id, engineer_id, status, remark) VALUES ((SELECT id FROM panels WHERE barcode = '{barcode}'), {step_sub(step)}, {user_sub(eng_name)}, 'OK', 'Completed step successfully') ON CONFLICT DO NOTHING;\n")

print(f"seed_new.sql generated successfully at {seed_sql_path}!")
