import React from 'react';
import { AlertTriangle } from 'lucide-react';

const InwardForm = ({ onSubmit, onCancel, newLot, setNewLot, managerSignOff, setManagerSignOff, userRole }) => {
  const isDiscrepancy = newLot.qty_sent && newLot.qty_received && parseInt(newLot.qty_sent) !== parseInt(newLot.qty_received);
  const diffQty = isDiscrepancy ? Math.abs(parseInt(newLot.qty_sent) - parseInt(newLot.qty_received)) : 0;
  const isShortage = isDiscrepancy && parseInt(newLot.qty_received) < parseInt(newLot.qty_sent);

  const canSave = !isDiscrepancy || (['Superadmin', 'Manager', 'Team Lead'].includes(userRole) && managerSignOff);

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: 12, color: 'var(--color-primary)' }}>New Inward Lot Shipment</h3>
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label>Lot Number</label>
          <input 
            type="number" 
            required 
            placeholder="e.g. 21" 
            value={newLot.lot_no}
            onChange={e => setNewLot({...newLot, lot_no: e.target.value})}
          />
        </div>
        <div className="form-group">
          <label>Batch Code</label>
          <input 
            type="text" 
            required 
            placeholder="e.g. DX128" 
            value={newLot.batch_no}
            onChange={e => setNewLot({...newLot, batch_no: e.target.value})}
          />
        </div>
        <div className="form-group">
          <label>Pixel Pitch</label>
          <select 
            value={newLot.pixel_pitch}
            onChange={e => setNewLot({...newLot, pixel_pitch: e.target.value})}
          >
            <option value="P5.9">P5.9</option>
            <option value="P3.9">P3.9</option>
            <option value="P2.6">P2.6</option>
          </select>
        </div>
        <div className="form-group">
          <label>Client Name</label>
          <input 
            type="text" 
            required 
            value={newLot.client_name}
            onChange={e => setNewLot({...newLot, client_name: e.target.value})}
          />
        </div>
        <div className="metrics-grid" style={{ marginBottom: 0 }}>
          <div className="form-group">
            <label>Client Qty Sent (Challan Quantity)</label>
            <input 
              type="number" 
              required 
              placeholder="e.g. 500" 
              value={newLot.qty_sent}
              onChange={e => setNewLot({...newLot, qty_sent: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Actual Qty Recv (Inward)</label>
            <input 
              type="number" 
              required 
              placeholder="e.g. 498" 
              value={newLot.qty_received}
              onChange={e => setNewLot({...newLot, qty_received: e.target.value})}
            />
          </div>
        </div>

        {/* GRN Discrepancy Warnings & Sign-offs */}
        {isDiscrepancy && (
          <div className="glass-panel" style={{ padding: 12, marginBottom: 16, borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.05)' }}>
            <div style={{ color: '#fca5a5', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6 }}>
              <AlertTriangle size={14} color="#ef4444" /> GRN DISCREPANCY DETECTED
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 8 }}>
              The actual received quantity ({newLot.qty_received}) differs from Challan Quantity ({newLot.qty_sent}) by {diffQty} units.
            </p>
            {!['Superadmin', 'Manager', 'Team Lead'].includes(userRole) ? (
              <div style={{ color: '#f87171', fontSize: '0.7rem', fontWeight: 700 }}>
                🚫 BLOCKER: You have Operator/Employee privileges. Discrepancy requires a Team Lead, Manager, or Superadmin to inward.
              </div>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 600 }}>
                <input 
                  type="checkbox" 
                  checked={managerSignOff} 
                  onChange={e => setManagerSignOff(e.target.checked)} 
                  style={{ width: 'auto' }}
                />
                I confirm Team Lead / Manager sign-off for this discrepancy.
              </label>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Remarks</label>
          <textarea 
            rows="2" 
            placeholder="e.g. Discrepancy checked. Box packing undamaged."
            value={newLot.remarks}
            onChange={e => setNewLot({...newLot, remarks: e.target.value})}
          />
        </div>
        <div className="metrics-grid">
          <button 
            type="submit" 
            className="btn" 
            disabled={!canSave}
          >
            Save Inward
          </button>
          <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default InwardForm;
