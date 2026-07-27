import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertCircle, LayoutDashboard, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Import feature components
import ApprovalsQueueItem from '../../features/reports/ApprovalsQueueItem';
import RejectionModal from '../../features/reports/RejectionModal';

const ReportsPage = ({ selectedLotNo, showToast }) => {
  const { user, apiFetch } = useAuth();
  
  const [approvalsData, setApprovalsData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingLogId, setRejectingLogId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/approvals');
      if (res.ok) {
        const data = await res.json();
        setApprovalsData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'Employee') {
      fetchApprovals();
    }
  }, [user]);

  const handleTLApprove = async (logId) => {
    try {
      const res = await apiFetch('/api/approvals/tl-approve', {
        method: 'POST',
        body: JSON.stringify({ pending_log_id: logId })
      });
      if (res.ok) {
        showToast('Task approved successfully!');
        fetchApprovals();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed Team Lead approval.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Server connection error.', 'danger');
    }
  };


  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectingLogId || !rejectionReason.trim()) return;

    try {
      const res = await apiFetch('/api/approvals/reject', {
        method: 'POST',
        body: JSON.stringify({
          pending_log_id: rejectingLogId,
          rejection_reason: rejectionReason
        })
      });
      if (res.ok) {
        showToast('Task rejected and sent back to Employee for rework.', 'warning');
        setShowRejectModal(false);
        setRejectingLogId(null);
        setRejectionReason('');
        fetchApprovals();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to submit rejection.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Server connection error.', 'danger');
    }
  };

  const filteredApprovals = Array.isArray(approvalsData)
    ? (selectedLotNo ? approvalsData.filter(item => item.lot_no === parseInt(selectedLotNo)) : approvalsData)
    : [];

  return (
    <div>
      <div className="app-header">
        <div>
          <span className="app-subtitle">Quality Clearance Queue</span>
          <h1 className="app-title"><ShieldCheck size={20} color='var(--color-primary)' /> Vetting Center</h1>
        </div>
        <button 
          onClick={() => { fetchApprovals(); showToast("Approvals list updated!"); }} 
          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer' }}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="widescreen-grid">
        {/* Left Column: Quality Audit Metrics & Bottleneck Heatmap */}
        <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 16 }}>Vetting Center Vitals</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: 10, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Cleared Today</span>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                  14 <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>Panels</span>
                </div>
              </div>
              <div style={{ padding: 10, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Clearance Rate</span>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: 4 }}>
                  98.6%
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} /> Quality Hotspots & Reworks
            </h4>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
              PCB components experiencing the highest diagnostic reflow or rework reject frequencies:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, border: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: '0.75rem', color: '#fca5a5' }}>Step 7 (QC Rework)</strong>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>High rate of Solder bridge failures</div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444' }}>8 reworks</span>
              </div>

              <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.05)', borderRadius: 8, border: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: '0.75rem', color: '#fcd34d' }}>Step 14 (Visual QC Vetting)</strong>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>Awaiting Team Lead final sign-off</div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f59e0b' }}>3 pending</span>
              </div>
            </div>
          </div>

          {/* PCB Failure Defect Heatmap Matrix */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <LayoutDashboard size={14} /> PCB Defect Heatmap Matrix
            </h4>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
              Failure count by PCB component grid section:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center', fontSize: '0.65rem', marginTop: 4 }}>
              <div style={{ padding: '8px 2px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: 6, color: '#fca5a5' }} title="Microcontroller Unit (High Defect Rate)">
                <strong>MCU</strong>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, marginTop: 2 }}>8 Fails</div>
              </div>
              <div style={{ padding: '8px 2px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 6, color: '#fde047' }} title="Power Regulators (Medium Defect Rate)">
                <strong>POWER</strong>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, marginTop: 2 }}>3 Fails</div>
              </div>
              <div style={{ padding: '8px 2px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid #10b981', borderRadius: 6, color: '#a7f3d0' }} title="LED Pixel Driver Grid (Low Defect Rate)">
                <strong>LED</strong>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, marginTop: 2 }}>1 Fail</div>
              </div>
              <div style={{ padding: '8px 2px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid #10b981', borderRadius: 6, color: '#a7f3d0' }} title="Interface Connectors (Low Defect Rate)">
                <strong>CONN</strong>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, marginTop: 2 }}>0 Fails</div>
              </div>
            </div>
          </div>

          {/* Clearance SLA Breach Risk Monitor */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <AlertCircle size={14} /> SLA Breach Risk Monitor
              </h4>
              <span style={{ fontSize: '0.62rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>RISK HIGH</span>
            </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.7rem' }}>
              {(!selectedLotNo || selectedLotNo === '18' || selectedLotNo === '19') ? (
                <>
                  {(!selectedLotNo || selectedLotNo === '18') && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 6, border: '1px solid var(--card-border)' }}>
                      <span style={{ fontFamily: 'monospace', color: '#fca5a5', fontWeight: 700 }}>Lot 18 (DX128) - Batch 1</span>
                      <span style={{ color: '#ef4444', fontWeight: 800 }}>42 mins ago</span>
                    </div>
                  )}
                  {(!selectedLotNo || selectedLotNo === '19') && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '6px 10px', background: 'var(--card-bg)', borderRadius: 6, border: '1px solid var(--card-border)' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>Lot 19 (DX128) - Batch 3</span>
                      <span style={{ color: 'var(--text-muted)' }}>18 mins ago</span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 10px', background: 'var(--card-bg)', borderRadius: 6, border: '1px solid var(--card-border)' }}>
                  No SLA breach risks for Lot {selectedLotNo}.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Clearance Queue */}
        <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8 }}>
            Pending Clearance Queue ({filteredApprovals.length})
          </h3>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredApprovals.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <CheckCircle size={36} color='var(--color-primary)' style={{ display: 'block', margin: '0 auto 12px auto', opacity: 0.8 }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>Clearance Queue Clear</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 0, margin: 0 }}>
                  No pending shop floor logs are currently awaiting your verification approval.
                </p>
              </div>
            ) : (
              filteredApprovals.map(log => (
                <ApprovalsQueueItem 
                  key={log.id} 
                  log={log} 
                  user={user} 
                  onTLApprove={handleTLApprove} 
                  onReject={(id) => {
                    setRejectingLogId(id);
                    setShowRejectModal(true);
                  }} 
                />
              ))
            )}
          </div>
        </div>
      </div>

      <RejectionModal 
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectingLogId(null);
          setRejectionReason('');
        }}
        onSubmit={handleRejectSubmit}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
      />
    </div>
  );
};

export default ReportsPage;
