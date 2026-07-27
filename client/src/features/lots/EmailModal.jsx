import React from 'react';
import { X } from 'lucide-react';

const EmailModal = ({ isOpen, onClose, onSubmit, selectedLotForEmail, form, setForm, emailSending }) => {
  if (!isOpen || !selectedLotForEmail) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--input-bg)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: 1050, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderColor: 'var(--color-primary)', background: '#111827', display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)', margin: 0 }}>
              📧 Discrepancy Email Dispatcher Center
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Team Lead Action Console • Lot {selectedLotForEmail.lot_no} ({selectedLotForEmail.client_name})
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Body: Responsive Dual-Pane Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24, flex: 1, overflowY: 'visible' }}>
          
          {/* Left Column: Editable Composer Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: 0.5, margin: 0 }}>
              1. Configure Email Header & Metadata
            </h4>

            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Subject Line</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                  required
                  style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Recipient Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={form.recipient_name}
                    onChange={e => setForm({ ...form, recipient_name: e.target.value })}
                    required
                    style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Challan / Ref No.</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={form.challan_no}
                    onChange={e => setForm({ ...form, challan_no: e.target.value })}
                    style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Recipient Email Address</label>
                <input 
                  type="email" 
                  className="form-control" 
                  value={form.recipient_email}
                  onChange={e => setForm({ ...form, recipient_email: e.target.value })}
                  required
                  style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>CC Emails (Comma-separated)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={form.cc_emails}
                  onChange={e => setForm({ ...form, cc_emails: e.target.value })}
                  placeholder="e.g. spares@client.com, manager@client.com"
                  style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Custom Closing / Action Remarks</label>
                <textarea 
                  className="form-control" 
                  rows="4"
                  value={form.custom_remarks}
                  onChange={e => setForm({ ...form, custom_remarks: e.target.value })}
                  style={{ fontSize: '0.8rem', padding: '8px 12px', resize: 'vertical', minHeight: '80px' }}
                  placeholder="Enter custom closing statements or invite references..."
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={onClose}
                  style={{ flex: 1, padding: '10px 16px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={emailSending}
                  style={{ flex: 1.5, background: 'var(--color-primary)', color: '#000000', fontWeight: 800, padding: '10px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {emailSending ? 'Sending simulated email...' : '✉️ Dispatch Simulated Email'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: High-Fidelity Live HTML Email Preview Pane */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: 0.5, margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>2. Live HTML compiled Preview</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--color-primary)', background: 'rgba(255,212,0,0.1)', padding: '2px 8px', borderRadius: 4, textTransform: 'none' }}>Hot Reloading</span>
            </h4>

            {/* Email Client UI Mockup Container */}
            <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, color: '#334155', fontFamily: 'Arial, sans-serif', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)' }}>
              
              {/* Email Headers Info */}
              <div style={{ fontSize: '0.78rem', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong>From:</strong> Electrolyte Solutions Team &lt;no-reply@electrolyte-solutions.com&gt;</div>
                <div><strong>To:</strong> {form.recipient_name} &lt;{form.recipient_email || '...'}&gt;</div>
                {form.cc_emails && <div><strong>CC:</strong> {form.cc_emails}</div>}
                <div><strong>Subject:</strong> {form.subject || 'Discrepancy Report'}</div>
              </div>

              {/* Real Rendered Email Body */}
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', lineHeight: 1.5, color: '#333333' }}>
                <p style={{ margin: '0 0 16px 0' }}>Dear {form.recipient_name || 'Recipient'},</p>
                <p style={{ margin: '0 0 16px 0' }}>Greetings from Electrolyte Solutions..!</p>
                
                {selectedLotForEmail.client_name === 'Atomberg' ? (
                  <p style={{ margin: '0 0 16px 0' }}>I would like to inform you about discrepancies observed in the PCB received against Challan No. <strong>{form.challan_no || 'N/A'}</strong>. The following table provides detailed information on the short and excess quantities received:</p>
                ) : (
                  <p style={{ margin: '0 0 16px 0' }}>We have checked Lot No. <strong>{selectedLotForEmail.lot_no}</strong> and found some PCB quantity differences (short/excess). Details are shared below. Kindly review and update.</p>
                )}

                {/* Styled Table Markup matching Backend Output */}
                <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0', fontSize: '0.78rem', textRendering: 'optimizeLegibility' }}>
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: 'var(--color-primary)', color: '#000000', fontWeight: 'bold', border: '1px solid #dddddd', padding: 8, textAlign: 'center' }}>Challan No. / Ref</th>
                      <th style={{ backgroundColor: 'var(--color-primary)', color: '#000000', fontWeight: 'bold', border: '1px solid #dddddd', padding: 8, textAlign: 'center' }}>Challan Qty</th>
                      <th style={{ backgroundColor: 'var(--color-primary)', color: '#000000', fontWeight: 'bold', border: '1px solid #dddddd', padding: 8, textAlign: 'center' }}>Received Qty</th>
                      <th style={{ backgroundColor: 'var(--color-primary)', color: '#000000', fontWeight: 'bold', border: '1px solid #dddddd', padding: 8, textAlign: 'center' }}>Diff</th>
                      <th style={{ backgroundColor: 'var(--color-primary)', color: '#000000', fontWeight: 'bold', border: '1px solid #dddddd', padding: 8, textAlign: 'center' }}>Discrepancy Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #dddddd', padding: 8, textAlign: 'center', backgroundColor: '#fef08a' }}>{form.challan_no || `Lot ${selectedLotForEmail.lot_no}`}</td>
                      <td style={{ border: '1px solid #dddddd', padding: 8, textAlign: 'center', backgroundColor: '#fef08a' }}>{selectedLotForEmail.qty_sent}</td>
                      <td style={{ border: '1px solid #dddddd', padding: 8, textAlign: 'center', backgroundColor: '#fef08a' }}>{selectedLotForEmail.received_qty}</td>
                      <td style={{ 
                        border: '1px solid #dddddd', 
                        padding: 8, 
                        textAlign: 'center', 
                        fontWeight: 'bold', 
                        color: 'var(--text-main)', 
                        backgroundColor: selectedLotForEmail.received_qty < selectedLotForEmail.qty_sent ? '#ef4444' : '#fb923c' 
                      }}>
                        {selectedLotForEmail.received_qty < selectedLotForEmail.qty_sent 
                          ? `-${selectedLotForEmail.qty_sent - selectedLotForEmail.received_qty}` 
                          : `+${selectedLotForEmail.received_qty - selectedLotForEmail.qty_sent}`}
                      </td>
                      <td style={{ border: '1px solid #dddddd', padding: 8, textAlign: 'center', backgroundColor: '#fef08a' }}>
                        {selectedLotForEmail.received_qty < selectedLotForEmail.qty_sent ? 'Short' : 'Excess'}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {form.custom_remarks ? (
                  <p style={{ margin: '16px 0', whiteSpace: 'pre-wrap' }}>{form.custom_remarks}</p>
                ) : (
                  selectedLotForEmail.client_name === 'Atomberg' ? (
                    <p style={{ margin: '16px 0' }}>Kindly suggest the way forward and would like to invite @CC CWH Mumbai Spare and @Chetan Joshi Sir to visit our facility and cross verify the quantities.</p>
                  ) : (
                    <p style={{ margin: '16px 0' }}>Please let us know if any further information is required from our side</p>
                  )
                )}

                <div style={{ marginTop: 30, borderTop: '1px solid #cbd5e1', paddingTop: 16, fontSize: '0.78rem', color: '#64748b' }}>
                  Warm regards,<br />
                  <strong>Electrolyte Solutions Team</strong><br />
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Automated Operations Dispatcher</span>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default EmailModal;
