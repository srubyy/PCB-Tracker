import pool, { isFallback } from '../config/db.js';
import { Lot } from '../models/Lot.js';
import { Client } from '../models/Client.js';
import { Transaction } from '../models/Transaction.js';
import { Panel } from '../models/Panel.js';
import { RepairStep } from '../models/RepairStep.js';

// Helper function to check Complete state lock
const checkCompleteLock = async (lotId, userRole, clientTransaction = null) => {
  const lot = await Lot.findById(lotId, clientTransaction);
  if (!lot) return false;
  if (lot.status === 'Complete' && userRole === 'Employee') {
    return true; // Locked for Employees
  }
  return false;
};

// Helper function to handle status updates when Available reaches 0
const checkAndAutoSetComplete = async (lotId, actorId, clientTransaction = null) => {
  const lot = await Lot.findById(lotId, clientTransaction);
  if (!lot) return 'Complete';
  
  const available = (lot.received_qty || 0) - (lot.dispatched_qty || 0) + (lot.return_qty || 0) - (lot.redispatch_qty || 0);

  if (available === 0 && lot.status !== 'Complete') {
    await Lot.updateStatus(lotId, 'Complete', clientTransaction);
    await Transaction.create({
      lot_id: lotId,
      transaction_type: 'Status Toggle',
      qty: 0,
      actor_id: actorId,
      remarks: 'System auto-completed lot (Available quantity reached 0)'
    }, clientTransaction);
    return 'Complete';
  }
  return lot.status;
};

export const getStock = async (req, res) => {
  try {
    let lots = await Lot.getAll(req.query);
    if (req.user && req.user.role === 'Employee') {
      lots = lots.filter(l => l.status === 'Active');
    }
    const result = [];

    for (const lot of lots) {
      const available = (lot.received_qty || 0) - (lot.dispatched_qty || 0) + (lot.return_qty || 0) - (lot.redispatch_qty || 0);
      const client = await Client.findById(lot.client_id);
      const clientName = client ? client.name : "Unknown";

      result.push({
        ...lot,
        client_name: clientName,
        available
      });
    }

    let filteredResult = result;
    if (req.query.client_name) {
      filteredResult = result.filter(r => r.client_name && r.client_name.toLowerCase().includes(req.query.client_name.toLowerCase()));
    }

    res.json(filteredResult);
  } catch (err) {
    console.error('Stock summary error:', err);
    res.status(500).json({ error: "Failed to load stock data." });
  }
};

export const getClients = async (req, res) => {
  try {
    const clients = await Client.getAll();
    res.json(clients);
  } catch (err) {
    console.error('Clients fetch error:', err);
    res.status(500).json({ error: "Failed to fetch clients." });
  }
};

export const inward = async (req, res) => {
  const { lot_no, batch_no, pixel_pitch, client_name, qty_sent, qty_received, remarks } = req.body;

  if (!lot_no || !batch_no || !pixel_pitch || !client_name || qty_sent === undefined || qty_received === undefined) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // 1. Transaction wrapper setup
  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    // Check duplicate lot
    const existingLot = await Lot.findByLotNo(lot_no, txClient);
    if (existingLot) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(400).json({ error: `Lot number ${lot_no} already exists.` });
    }

    // Resolve client
    let client = await Client.findByName(client_name, txClient);
    if (!client) {
      client = await Client.create(client_name, txClient);
    }

    // Create lot
    const newLot = await Lot.create({
      lot_no: parseInt(lot_no),
      batch_no,
      pixel_pitch,
      client_id: client.id,
      qty_sent: parseInt(qty_sent),
      received_qty: parseInt(qty_received),
      remarks
    }, txClient);

    // Log transaction
    await Transaction.create({
      lot_id: newLot.id,
      transaction_type: 'Inward',
      qty: parseInt(qty_received),
      actor_id: req.user.id,
      remarks: remarks || 'Initial inward lot entry'
    }, txClient);

    // Calculate initial available and check auto-complete
    let finalStatus = newLot.status;
    const available = (newLot.received_qty || 0) - (newLot.dispatched_qty || 0) + (newLot.return_qty || 0) - (newLot.redispatch_qty || 0);
    
    if (available === 0) {
      await Lot.updateStatus(newLot.id, 'Complete', txClient);
      await Transaction.create({
        lot_id: newLot.id,
        transaction_type: 'Status Toggle',
        qty: 0,
        actor_id: req.user.id,
        remarks: 'System auto-completed lot (Available quantity reached 0)'
      }, txClient);
      finalStatus = 'Complete';
    }

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    res.status(201).json({
      ...newLot,
      status: finalStatus,
      client_name,
      available
    });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Inward stock recording error:', err);
    res.status(500).json({ error: "Failed to record inward shipment." });
  }
};

export const outward = async (req, res) => {
  const { lot_id, qty, remarks } = req.body;
  if (!lot_id || qty === undefined || qty <= 0) {
    return res.status(400).json({ error: "Valid lot_id and positive quantity are required." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    // Check lock status
    const isLocked = await checkCompleteLock(lot_id, req.user.role, txClient);
    if (isLocked) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(403).json({ error: "Access denied. This lot is completed and locked. Only a Superadmin can perform transactions." });
    }

    // Verify stock
    const lot = await Lot.findById(lot_id, txClient);
    if (!lot) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: "Lot not found." });
    }

    const available = (lot.received_qty || 0) - (lot.dispatched_qty || 0) + (lot.return_qty || 0) - (lot.redispatch_qty || 0);
    if (qty > available) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(400).json({ error: `Insufficient stock available. Requested: ${qty}, Available: ${available}` });
    }

    // Update dispatch quantity
    const updatedLot = await Lot.incrementDispatched(lot_id, qty, txClient);

    // Log transaction
    await Transaction.create({
      lot_id,
      transaction_type: 'Outward',
      qty,
      actor_id: req.user.id,
      remarks: remarks || 'Outward shipment recorded'
    }, txClient);

    // Check completion condition
    const nextStatus = await checkAndAutoSetComplete(lot_id, req.user.id, txClient);
    updatedLot.status = nextStatus;

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    const finalAvailable = (updatedLot.received_qty || 0) - (updatedLot.dispatched_qty || 0) + (updatedLot.return_qty || 0) - (updatedLot.redispatch_qty || 0);
    res.json({ ...updatedLot, available: finalAvailable });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Outward dispatch error:', err);
    res.status(500).json({ error: "Failed to record outward shipment." });
  }
};

export const customerReturn = async (req, res) => {
  const { lot_id, qty, reason, remarks } = req.body;
  if (!lot_id || qty === undefined || qty <= 0) {
    return res.status(400).json({ error: "Valid lot_id and positive quantity are required." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    // Check lock status
    const isLocked = await checkCompleteLock(lot_id, req.user.role, txClient);
    if (isLocked) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(403).json({ error: "Access denied. This lot is completed and locked. Only a Superadmin can perform transactions." });
    }

    // Update returned qty
    const updatedLot = await Lot.incrementReturn(lot_id, qty, txClient);
    if (!updatedLot) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: "Lot not found." });
    }

    // Log transaction
    const logRemarks = `Reason: ${reason || 'Not specified'}. ${remarks || ''}`.trim();
    await Transaction.create({
      lot_id,
      transaction_type: 'Return',
      qty,
      actor_id: req.user.id,
      remarks: logRemarks
    }, txClient);

    // Check completion condition
    const nextStatus = await checkAndAutoSetComplete(lot_id, req.user.id, txClient);
    updatedLot.status = nextStatus;

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    const finalAvailable = (updatedLot.received_qty || 0) - (updatedLot.dispatched_qty || 0) + (updatedLot.return_qty || 0) - (updatedLot.redispatch_qty || 0);
    res.json({ ...updatedLot, available: finalAvailable });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Customer return error:', err);
    res.status(500).json({ error: "Failed to record returned stock." });
  }
};

export const redispatch = async (req, res) => {
  const { lot_id, qty, remarks } = req.body;
  if (!lot_id || qty === undefined || qty <= 0) {
    return res.status(400).json({ error: "Valid lot_id and positive quantity are required." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    // Check lock status
    const isLocked = await checkCompleteLock(lot_id, req.user.role, txClient);
    if (isLocked) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(403).json({ error: "Access denied. This lot is completed and locked. Only a Superadmin can perform transactions." });
    }

    // Verify stock availability
    const lot = await Lot.findById(lot_id, txClient);
    if (!lot) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: "Lot not found." });
    }

    const available = (lot.received_qty || 0) - (lot.dispatched_qty || 0) + (lot.return_qty || 0) - (lot.redispatch_qty || 0);
    if (qty > available) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(400).json({ error: `Insufficient stock available. Requested: ${qty}, Available: ${available}` });
    }

    // Update redispatch quantity
    const updatedLot = await Lot.incrementRedispatch(lot_id, qty, txClient);

    // Log transaction
    await Transaction.create({
      lot_id,
      transaction_type: 'Redispatch',
      qty,
      actor_id: req.user.id,
      remarks: remarks || 'Returned lot redispatch recorded'
    }, txClient);

    // Check completion condition
    const nextStatus = await checkAndAutoSetComplete(lot_id, req.user.id, txClient);
    updatedLot.status = nextStatus;

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    const finalAvailable = (updatedLot.received_qty || 0) - (updatedLot.dispatched_qty || 0) + (updatedLot.return_qty || 0) - (updatedLot.redispatch_qty || 0);
    res.json({ ...updatedLot, available: finalAvailable });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Redispatch error:', err);
    res.status(500).json({ error: "Failed to record lot redispatch." });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const list = await Transaction.getByLotId(req.params.id);
    res.json(list);
  } catch (err) {
    console.error('Lot transactions fetch error:', err);
    res.status(500).json({ error: "Failed to load lot transactions history." });
  }
};

export const getHistory = async (req, res) => {
  try {
    // This is RLS scoped by passing user context
    if (isFallback()) {
      const list = memoryDb.tables.panels
        .filter(p => p.lot_id === Number(req.params.id))
        .map(p => {
          const u = memoryDb.tables.users.find(u => u.id === p.assigned_engineer_id);
          return {
            ...p,
            engineer_name: u ? u.name : 'Unassigned'
          };
        })
        .sort((a, b) => a.sr_no - b.sr_no);
      return res.json(list);
    }
    
    const panelsRes = await query(`
      SELECT p.*, u.name as engineer_name 
      FROM panels p
      LEFT JOIN users u ON p.assigned_engineer_id = u.id
      WHERE p.lot_id = $1
      ORDER BY p.sr_no ASC
    `, [req.params.id], req.user);
    res.json(panelsRes.rows);
  } catch (err) {
    console.error('Lot history fetch error:', err);
    res.status(500).json({ error: "Failed to load lot panel history." });
  }
};

export const toggleComplete = async (req, res) => {
  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    const lot = await Lot.findById(req.params.id, txClient);
    if (!lot) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: "Lot not found." });
    }

    const currentStatus = lot.status;

    // Lock check: Only Superadmin / Manager / Team Lead can unlock a completed lot
    if (currentStatus === 'Complete' && req.user.role === 'Employee') {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(403).json({ error: "Access denied. Lot is Complete and locked. Employees cannot unlock it." });
    }

    const nextStatus = currentStatus === 'Complete' ? 'In Process' : 'Complete';
    await Lot.updateStatus(req.params.id, nextStatus, txClient);

    // Log the toggle action
    await Transaction.create({
      lot_id: lot.id,
      transaction_type: 'Status Toggle',
      qty: 0,
      actor_id: req.user.id,
      remarks: `Lot status toggled from ${currentStatus} to ${nextStatus}`
    }, txClient);

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    res.json({ success: true, status: nextStatus });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Lot status toggle error:', err);
    res.status(500).json({ error: "Failed to toggle lot status." });
  }
};

export const addClient = async (req, res) => {
  const { name, contact, email, steps, lots } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Company name is required." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;
  try {
    if (useTx) await txClient.query('BEGIN');

    // Create client
    const newClient = await Client.create(name, contact, email, txClient);

    // Save custom steps
    if (Array.isArray(steps) && steps.length > 0) {
      await RepairStep.saveCustomSteps(newClient.id, steps, txClient);
    }

    // Save initial lots
    if (Array.isArray(lots) && lots.length > 0) {
      for (const lot of lots) {
        // Validate duplicate lot_no
        const existingLot = await Lot.findByLotNo(parseInt(lot.lot_no), txClient);
        if (existingLot) {
          throw new Error(`Lot number ${lot.lot_no} already exists.`);
        }

        const newLot = await Lot.create({
          lot_no: parseInt(lot.lot_no),
          batch_no: lot.batch_no || 'Default_Batch',
          pixel_pitch: lot.pixel_pitch || 'P5.9',
          client_id: newClient.id,
          qty_sent: parseInt(lot.qty_sent || 0),
          received_qty: parseInt(lot.received_qty || 0),
          remarks: lot.remarks || ''
        }, txClient);

        // Log transaction
        await Transaction.create({
          lot_id: newLot.id,
          transaction_type: 'Inward',
          qty: newLot.received_qty,
          actor_id: req.user.id,
          remarks: lot.remarks || 'Initial lot import during company creation'
        }, txClient);
      }
    }

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    res.status(201).json(newClient);
  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Add client error:', err);
    res.status(400).json({ error: err.message || "Failed to create client." });
  }
};

export const getClientSteps = async (req, res) => {
  const { id } = req.params;
  try {
    const steps = await RepairStep.getAllForClient(id);
    res.json(steps);
  } catch (err) {
    console.error('Fetch client steps error:', err);
    res.status(500).json({ error: "Failed to fetch steps for this client." });
  }
};

export const updateClientSteps = async (req, res) => {
  const { id } = req.params;
  const { steps } = req.body;
  if (!Array.isArray(steps)) {
    return res.status(400).json({ error: "Steps must be an array." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;
  try {
    if (useTx) await txClient.query('BEGIN');

    await RepairStep.saveCustomSteps(id, steps, txClient);

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }
    res.json({ message: "Steps updated successfully." });
  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Update client steps error:', err);
    res.status(500).json({ error: "Failed to update steps." });
  }
};
