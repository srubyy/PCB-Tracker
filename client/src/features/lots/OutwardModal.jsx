import React from 'react';
import { X } from 'lucide-react';

const OutwardModal = ({ isOpen, onClose, onSubmit, stockData, user, form, setForm }) => {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--input-bg)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: 400, padding: 20, borderColor: '#10b981', background: '#111827' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>Record Outward Dispatch</h3>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Select Lot</label>
            <select 
              required
              value={form.lot_id}
              onChange={e => setForm({...form, lot_id: e.target.value})}
            >
              <option value="">-- Choose Lot --</option>
              {stockData.filter(l => l.status !== 'Complete' || ['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)).map(l => (
                <option key={l.id} value={l.id}>Lot {l.lot_no} (Avail: {l.available})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Quantity to Dispatch</label>
            <input 
              type="number" 
              required 
              min="1"
              max={form.lot_id ? stockData.find(l => l.id === parseInt(form.lot_id))?.available : undefined}
              placeholder="e.g. 50"
              value={form.qty}
              onChange={e => setForm({...form, qty: e.target.value})}
            />
            {form.lot_id && (
              <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: 4 }}>
                * Max available to dispatch: {stockData.find(l => l.id === parseInt(form.lot_id))?.available} units
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Remarks</label>
            <textarea 
              rows="2" 
              placeholder="e.g. Dispatched to Atomberg warehouse"
              value={form.remarks}
              onChange={e => setForm({...form, remarks: e.target.value})}
            />
          </div>
          <div className="metrics-grid">
            <button type="submit" className="btn" style={{ background: '#10b981', color: 'var(--text-main)' }}>Record Dispatch</button>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OutwardModal;
