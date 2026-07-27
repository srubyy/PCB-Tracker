import fs from 'fs';
import path from 'path';

// Memory storage collections
export const tables = {
  clients: [],
  users: [],
  lots: [],
  repair_steps: [
    { id: 1, step_no: 1, name: 'Inward' },
    { id: 2, step_no: 2, name: 'Segregation' },
    { id: 3, step_no: 3, name: 'Programming' },
    { id: 4, step_no: 4, name: '1st Testing' },
    { id: 5, step_no: 5, name: 'Debug' },
    { id: 6, step_no: 6, name: 'Entry' },
    { id: 7, step_no: 7, name: 'Cleaning' },
    { id: 8, step_no: 8, name: 'QC After Cleaning' },
    { id: 9, step_no: 9, name: 'Marking & Coating' },
    { id: 10, step_no: 10, name: 'Final Testing' },
    { id: 11, step_no: 11, name: 'Final Entry' },
    { id: 12, step_no: 12, name: 'Packing' }
  ],
  panels: [],
  panel_logs: [],
  defect_codes: [],
  performance_scores: [],
  pending_logs: [],
  lot_transactions: [],
  production_logs: [],
  pending_production_logs: [],
  cell_edits: [],
  scan_logs: [],
  export_history: [],
  checkpoint_scans: [],
  checkpoint_results: [],
  missing_pcbs: [],
  checkpoint_acknowledgements: []
};

// --- Seed Parsing Helpers ---

function splitSqlValues(valStr) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let parenDepth = 0;
  for (let i = 0; i < valStr.length; i++) {
    const char = valStr[i];
    if (char === "'" && (i === 0 || valStr[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
      current += char;
    } else if (!inQuotes && char === '(') {
      parenDepth++;
      current += char;
    } else if (!inQuotes && char === ')') {
      parenDepth--;
      current += char;
    } else if (char === ',' && !inQuotes && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseSqlValue(val) {
  val = val.trim();
  if (val.toLowerCase() === 'null') return null;
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;

  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/''/g, "'");
  }
  if (!isNaN(val)) {
    return Number(val);
  }
  if (val.startsWith('(') && val.endsWith(')')) {
    const subquery = val.slice(1, -1).trim();
    const selectMatch = subquery.match(/SELECT\s+(\w+)\s+FROM\s+(\w+)\s+WHERE\s+(.+)/i);
    if (selectMatch) {
      const [, colToSelect, tblName, whereClause] = selectMatch;
      const whereMatch = whereClause.match(/(\w+)\s*=\s*(.+)/);
      if (whereMatch) {
        const [, whereCol, whereValRaw] = whereMatch;
        const whereVal = parseSqlValue(whereValRaw);
        const row = (tables[tblName] || []).find(r => r[whereCol] === whereVal);
        if (row) {
          return row[colToSelect];
        }
      }
    }
  }
  return val;
}

function parseInsertLine(line) {
  const insertIndex = line.indexOf('INSERT INTO ');
  if (insertIndex === -1) return;

  const afterInsert = line.slice(insertIndex + 12);
  const openParen = afterInsert.indexOf('(');
  if (openParen === -1) return;
  const tblName = afterInsert.slice(0, openParen).trim().toLowerCase();

  if (!tables[tblName]) {
    tables[tblName] = [];
  }

  const closeParen = afterInsert.indexOf(')');
  if (closeParen === -1) return;
  const cols = afterInsert.slice(openParen + 1, closeParen).split(',').map(c => c.trim());

  const valuesKeyword = afterInsert.indexOf('VALUES', closeParen);
  if (valuesKeyword === -1) return;

  const valStartParen = afterInsert.indexOf('(', valuesKeyword);
  if (valStartParen === -1) return;

  let parenDepth = 1;
  let inQuotes = false;
  let valEndParen = valStartParen;
  for (let i = valStartParen + 1; i < afterInsert.length; i++) {
    const char = afterInsert[i];
    if (char === "'" && (i === 0 || afterInsert[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === '(') {
      parenDepth++;
    } else if (!inQuotes && char === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        valEndParen = i;
        break;
      }
    }
  }

  const valStr = afterInsert.slice(valStartParen + 1, valEndParen);
  const rawVals = splitSqlValues(valStr);
  const parsedVals = rawVals.map(v => parseSqlValue(v));

  const row = {};
  cols.forEach((col, idx) => {
    row[col] = parsedVals[idx];
  });

  if (!row.id) {
    const maxId = tables[tblName].reduce((max, r) => Math.max(max, r.id || 0), 0);
    row.id = maxId + 1;
  }

  // Handle constraints
  if (tblName === 'lots') {
    if (row.dispatched_qty === undefined) row.dispatched_qty = 0;
    if (row.return_qty === undefined) row.return_qty = 0;
    if (row.redispatch_qty === undefined) row.redispatch_qty = 0;
    const exists = tables.lots.some(r => r.lot_no === row.lot_no);
    if (exists) return;
  } else if (tblName === 'users') {
    const exists = tables.users.some(r => r.email === row.email || r.name === row.name);
    if (exists) return;
  } else if (tblName === 'clients') {
    const exists = tables.clients.some(r => r.name === row.name);
    if (exists) return;
  } else if (tblName === 'panels') {
    const exists = tables.panels.some(r => r.barcode === row.barcode);
    if (exists) return;
  }

  tables[tblName].push(row);
}

export function initializeMemoryDb() {
  console.log('----------------------------------------------------');
  console.log('📁 Pre-seeding memory database from seed_new.sql...');
  console.log('----------------------------------------------------');

  // Try multiple fallback paths for finding the seed_new.sql dynamically
  let seedPath = path.join(process.cwd(), 'backend', 'seed_new.sql');
  if (!fs.existsSync(seedPath)) {
    seedPath = path.join(process.cwd(), 'seed_new.sql');
  }
  if (!fs.existsSync(seedPath)) {
    const __dirname = path.dirname(path.dirname(import.meta.url).replace('file://', ''));
    seedPath = path.join(__dirname, 'seed_new.sql');
  }

  if (fs.existsSync(seedPath)) {
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    const lines = seedSql.split('\n');
    let insertCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      if (trimmed.startsWith('INSERT INTO ')) {
        try {
          parseInsertLine(trimmed);
          insertCount++;
        } catch (e) {
          // Silent catch
        }
      }
    }
    // Map status values for pre-seeded lots to match rules:
    tables.lots.forEach(lot => {
      if (lot.status === 'In Process') {
        lot.status = 'Active';
      } else if (lot.status === 'Complete') {
        lot.status = 'Closed';
      }
    });

    console.log(`✅ Loaded seed data successfully: parsed ${insertCount} INSERT statements.`);
    console.log(`📊 In-memory stats:`);
    console.log(`   - Clients: ${tables.clients.length}`);
    console.log(`   - Users: ${tables.users.length}`);
    console.log(`   - Lots: ${tables.lots.length}`);
    console.log(`   - Panels: ${tables.panels.length}`);
    console.log(`   - Panel Logs: ${tables.panel_logs.length}`);
    console.log(`   - Defect Codes: ${tables.defect_codes.length}`);
    console.log('----------------------------------------------------');
  } else {
    console.log('⚠️  seed_new.sql not found! Running with empty database.');
  }
}

// --- Data CRUD Operations (Exposed for Repository Models) ---

// 1. Users
export const findUserByEmail = (email) => {
  return tables.users.find(r => r.email.toLowerCase() === email.trim().toLowerCase() && r.is_active !== false) || null;
};

export const findUserByIdAndRefreshToken = (id, token) => {
  return tables.users.find(r => r.id === id && r.refresh_token === token && r.is_active !== false) || null;
};

export const updateUserRefreshToken = (id, token) => {
  const user = tables.users.find(r => r.id === id);
  if (user) {
    user.refresh_token = token;
    return true;
  }
  return false;
};

export const getEmployees = () => {
  return tables.users.filter(r => r.role === 'Employee');
};

export const getAllUsers = () => {
  return [...tables.users];
};

export const createUser = (user) => {
  const newUser = {
    id: tables.users.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    ...user,
    created_at: new Date().toISOString(),
    is_active: true
  };
  tables.users.push(newUser);
  return newUser;
};

export const toggleUserStatus = (id) => {
  const user = tables.users.find(r => r.id === id);
  if (user) {
    user.is_active = user.is_active === false ? true : false;
    return user;
  }
  return null;
};

// 2. Clients
export const getAllClients = () => {
  return [...tables.clients];
};

export const findClientById = (id) => {
  return tables.clients.find(r => r.id === id) || null;
};

export const findClientByName = (name) => {
  return tables.clients.find(r => r.name.toLowerCase() === name.toLowerCase()) || null;
};

export const createClient = (name, contact = '', email = '') => {
  const existing = findClientByName(name);
  if (existing) return existing;

  const newClient = {
    id: tables.clients.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    name,
    contact,
    email,
    created_at: new Date().toISOString()
  };
  tables.clients.push(newClient);
  return newClient;
};

export const getStepsForClient = (clientId) => {
  if (!clientId) {
    return tables.repair_steps.filter(s => !s.client_id).sort((a, b) => a.step_no - b.step_no);
  }
  const clientSteps = tables.repair_steps.filter(s => s.client_id === Number(clientId));
  if (clientSteps.length > 0) {
    return clientSteps.sort((a, b) => a.step_no - b.step_no);
  }
  return tables.repair_steps.filter(s => !s.client_id).sort((a, b) => a.step_no - b.step_no);
};

export const saveStepsForClient = (clientId, steps) => {
  if (!clientId) return false;
  tables.repair_steps = tables.repair_steps.filter(s => s.client_id !== Number(clientId));
  steps.forEach((s, idx) => {
    const nextId = tables.repair_steps.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
    tables.repair_steps.push({
      id: nextId,
      client_id: Number(clientId),
      step_no: s.step_no || (idx + 1),
      name: s.name
    });
  });
  return true;
};

// 3. Lots
export const findLotById = (id) => {
  return tables.lots.find(r => r.id === id) || null;
};

export const findLotByLotNo = (lotNo) => {
  return tables.lots.find(r => r.lot_no === lotNo) || null;
};

export const getAllLots = (filters = {}) => {
  let filtered = [...tables.lots];

  if (filters.client_id) {
    filtered = filtered.filter(r => r.client_id === Number(filters.client_id));
  }
  if (filters.status) {
    filtered = filtered.filter(r => r.status === filters.status);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.lot_no).includes(term) ||
      (r.batch_no && r.batch_no.toLowerCase().includes(term))
    );
  }
  if (filters.start_date) {
    filtered = filtered.filter(r => new Date(r.received_date) >= new Date(filters.start_date));
  }
  if (filters.end_date) {
    filtered = filtered.filter(r => new Date(r.received_date) <= new Date(filters.end_date));
  }

  return filtered;
};

export const createLot = (lot) => {
  const newLot = {
    id: tables.lots.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    dispatched_qty: 0,
    return_qty: 0,
    redispatch_qty: 0,
    received_date: new Date().toISOString().split('T')[0],
    status: 'Draft',
    scrap_year_threshold: null,
    separate_year_threshold: null,
    checkbox_year_threshold: null,
    created_by: null,
    ...lot
  };
  tables.lots.push(newLot);
  return newLot;
};

export const updateLotRules = (id, rules) => {
  const lot = tables.lots.find(r => r.id === id);
  if (lot) {
    lot.scrap_year_threshold = rules.scrap_year_threshold !== undefined ? rules.scrap_year_threshold : lot.scrap_year_threshold;
    lot.separate_year_threshold = rules.separate_year_threshold !== undefined ? rules.separate_year_threshold : lot.separate_year_threshold;
    lot.checkbox_year_threshold = rules.checkbox_year_threshold !== undefined ? rules.checkbox_year_threshold : lot.checkbox_year_threshold;
    return lot;
  }
  return null;
};

export const updateLotStatus = (id, status) => {
  const lot = tables.lots.find(r => r.id === id);
  if (lot) {
    lot.status = status;
    return lot;
  }
  return null;
};

export const incrementLotDispatchedQty = (id, qty) => {
  const lot = tables.lots.find(r => r.id === id);
  if (lot) {
    lot.dispatched_qty = (lot.dispatched_qty || 0) + qty;
    return lot;
  }
  return null;
};

export const incrementLotReturnQty = (id, qty) => {
  const lot = tables.lots.find(r => r.id === id);
  if (lot) {
    lot.return_qty = (lot.return_qty || 0) + qty;
    return lot;
  }
  return null;
};

export const incrementLotRedispatchQty = (id, qty) => {
  const lot = tables.lots.find(r => r.id === id);
  if (lot) {
    lot.redispatch_qty = (lot.redispatch_qty || 0) + qty;
    return lot;
  }
  return null;
};

// 4. Lot Transactions
export const createTransaction = (tx) => {
  const newTx = {
    id: tables.lot_transactions.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    created_at: new Date().toISOString(),
    ...tx
  };
  tables.lot_transactions.push(newTx);
  return newTx;
};

export const getTransactionsByLotId = (lotId) => {
  return tables.lot_transactions
    .filter(r => r.lot_id === lotId)
    .map(tx => {
      const user = tables.users.find(u => u.id === tx.actor_id);
      return {
        ...tx,
        actor_name: user ? user.name : 'System'
      };
    })
    .sort((a, b) => b.id - a.id);
};

// 5. Panels & Logs
export const countPanelsForLot = (lotId, criteria = {}) => {
  let list = tables.panels.filter(p => p.lot_id === lotId);
  if (criteria.current_step !== undefined) {
    list = list.filter(p => p.current_step === criteria.current_step);
  }
  if (criteria.status !== undefined) {
    list = list.filter(p => p.status === criteria.status);
  }
  if (criteria.notStatus !== undefined) {
    list = list.filter(p => p.status !== criteria.notStatus);
  }
  return list.length;
};

export const countPanelsAtStep = (stepNo, lotNo = null) => {
  let list = tables.panels.filter(p => p.current_step === stepNo && p.status !== 'Scrap');
  if (lotNo) {
    const lot = tables.lots.find(l => l.lot_no === Number(lotNo));
    if (lot) {
      list = list.filter(p => p.lot_id === lot.id);
    } else {
      return 0;
    }
  }
  return list.length;
};

export const getAllPanels = (filters = {}) => {
  let list = tables.panels.map(p => {
    const lot = tables.lots.find(l => l.id === p.lot_id);
    const engineer = tables.users.find(u => u.id === p.assigned_engineer_id);
    return {
      ...p,
      lot_no: lot ? lot.lot_no : null,
      batch_no: lot ? lot.batch_no : null,
      pixel_pitch: lot ? lot.pixel_pitch : null,
      engineer_name: engineer ? engineer.name : 'Unassigned'
    };
  });

  if (filters.step_no !== undefined) {
    list = list.filter(p => p.current_step === filters.step_no);
  }
  if (filters.lot_id !== undefined) {
    list = list.filter(p => p.lot_id === Number(filters.lot_id));
  }
  if (filters.notStatus !== undefined) {
    list = list.filter(p => p.status !== filters.notStatus);
  }

  return list.sort((a, b) => (a.lot_no || 0) - (b.lot_no || 0) || a.sr_no - b.sr_no);
};

export const getPanelLogs = (panelId) => {
  return tables.panel_logs
    .filter(r => r.panel_id === panelId)
    .map(l => {
      const step = tables.repair_steps.find(s => s.id === l.step_id);
      const engineer = tables.users.find(u => u.id === l.engineer_id);
      return {
        ...l,
        step_name: step ? step.name : 'Unknown',
        engineer_name: engineer ? engineer.name : 'Unknown'
      };
    })
    .sort((a, b) => b.id - a.id);
};

export const getAllPanelLogs = () => {
  return tables.panel_logs.map(pl => {
    const engineer = tables.users.find(u => u.id === pl.engineer_id);
    return {
      ...pl,
      engineer_name: engineer ? engineer.name : 'Unknown'
    };
  });
};

export const findPanelByBarcode = (barcode) => {
  return tables.panels.find(r => r.barcode.toLowerCase() === barcode.trim().toLowerCase()) || null;
};

export const findPanelByLotAndSrNo = (lotId, srNo) => {
  return tables.panels.find(r => r.lot_id === lotId && r.sr_no === srNo) || null;
};

export const createPanel = (panel) => {
  const newPanel = {
    id: tables.panels.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    status: 'Repairable',
    current_step: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...panel
  };
  tables.panels.push(newPanel);
  return newPanel;
};

export const createPanelLog = (log) => {
  let stepId = 1;
  if (log.step_no) {
    const step = tables.repair_steps.find(s => s.step_no === log.step_no);
    if (step) stepId = step.id;
  } else if (log.step_id) {
    stepId = log.step_id;
  }

  const newLog = {
    id: tables.panel_logs.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    step_id: stepId,
    timestamp: new Date().toISOString(),
    ...log
  };
  tables.panel_logs.push(newLog);
  return newLog;
};

export const findPanelById = (id) => {
  return tables.panels.find(r => r.id === id) || null;
};

export const updatePanel = (id, status, currentStep, assignedEngineerId) => {
  const panel = tables.panels.find(r => r.id === id);
  if (panel) {
    panel.status = status;
    panel.current_step = currentStep;
    panel.assigned_engineer_id = assignedEngineerId;
    panel.updated_at = new Date().toISOString();
    return panel;
  }
  return null;
};

export const updatePanelFields = (id, fields) => {
  const panel = tables.panels.find(r => r.id === id);
  if (panel) {
    Object.assign(panel, fields);
    panel.updated_at = new Date().toISOString();
    return panel;
  }
  return null;
};

export const deletePanel = (id) => {
  const idx = tables.panels.findIndex(r => r.id === id);
  if (idx !== -1) {
    const deleted = tables.panels[idx];
    tables.panels.splice(idx, 1);
    return deleted;
  }
  return null;
};

// 6. Pending Logs (Production/Repair Approvals)
export const findPendingLogByPanelAndStatus = (panelId, status = 'Pending Team Lead') => {
  return tables.pending_logs.find(r => r.panel_id === panelId && r.approval_status === status) || null;
};

export const findPendingLogByPanelAndStep = (panelId, stepNo) => {
  return tables.pending_logs.find(r => r.panel_id === panelId && r.step_no === stepNo) || null;
};

export const createPendingLog = (log) => {
  const newLog = {
    id: tables.pending_logs.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
    approval_status: 'Pending Team Lead',
    created_at: new Date().toISOString(),
    ...log
  };
  tables.pending_logs.push(newLog);
  return newLog;
};

export const getAllPendingLogs = () => {
  return tables.pending_logs.map(pl => {
    const panel = tables.panels.find(p => p.id === pl.panel_id);
    const lot = panel ? tables.lots.find(l => l.id === panel.lot_id) : null;
    const engineer = tables.users.find(u => u.id === pl.engineer_id);
    const teamLead = pl.team_lead_id ? tables.users.find(u => u.id === pl.team_lead_id) : null;
    return {
      ...pl,
      barcode: panel ? panel.barcode : null,
      sr_no: panel ? panel.sr_no : null,
      side: panel ? panel.side : null,
      lot_no: lot ? lot.lot_no : null,
      engineer_name: engineer ? engineer.name : 'Unknown',
      team_lead_name: teamLead ? teamLead.name : null
    };
  });
};

export const updatePendingLogStatus = (id, status, approverId, approverType, rejectionReason) => {
  const log = tables.pending_logs.find(r => r.id === id);
  if (log) {
    log.approval_status = status;
    if (status === 'Approved' && approverType === 'teamlead') {
      log.team_lead_id = approverId;
      log.team_lead_approved_at = new Date().toISOString();
    } else if (status === 'Rejected') {
      log.rejection_reason = rejectionReason;
    }
    return log;
  }
  return null;
};

export const findPendingLogById = (id) => {
  return tables.pending_logs.find(r => r.id === id) || null;
};

// 7. Defect Codes
export const getAllDefectCodes = () => {
  return [...tables.defect_codes];
};

// 8. Analytics & Trends
export const getDailyActivityTrend = () => {
  const trendMap = {};
  for (const log of tables.panel_logs) {
    const step = tables.repair_steps.find(s => s.id === log.step_id);
    const stepName = step ? step.name : 'Unknown';
    let dateStr = new Date().toISOString().split('T')[0];
    if (log.timestamp) {
      dateStr = String(log.timestamp).split('T')[0].split(' ')[0];
    }
    const key = `${dateStr}_${stepName}`;
    if (!trendMap[key]) {
      trendMap[key] = { date: dateStr, step_name: stepName, count: 0 };
    }
    trendMap[key].count++;
  }
  const trendList = Object.values(trendMap);
  return trendList
    .sort((a, b) => b.date.localeCompare(a.date) || b.count - a.count)
    .slice(0, 30);
};
