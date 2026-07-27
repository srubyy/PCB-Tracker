import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, Barcode, Play, RefreshCw } from 'lucide-react';

const AuditTerminal = ({ lotId, stepNo, user, showToast, onComplete, apiFetch }) => {
  const [scanValue, setScanValue] = useState('');
  const [scans, setScans] = useState([]);
  const [totalExpected, setTotalExpected] = useState(0);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  const fetchReport = async () => {
    if (!lotId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/audit/report/${lotId}/${stepNo}`);
      if (res.ok) {
        const data = await res.json();
        setScans(data.scans || []);
        setTotalExpected(data.totalExpected || 0);
        setResults(data.results || null);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load audit checkpoint details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [lotId, stepNo]);

  // Keep input focused for hardware scanning
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  });

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    if (!scanValue.trim()) return;

    try {
      const res = await apiFetch('/api/audit/scan', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: lotId,
          checkpoint_step: stepNo,
          scanned_value: scanValue.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.is_unknown) {
          showToast(`Unknown Scan: "${scanValue}" flagged.`, 'warning');
        } else {
          showToast(`PCB Scanned Successfully: ${scanValue}`, 'success');
        }
        setScanValue('');
        fetchReport();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to process scan.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error during scan.', 'error');
    }
  };

  const handleCompleteCheckpoint = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/audit/complete', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: lotId,
          checkpoint_step: stepNo
        })
      });

      if (res.ok) {
        showToast(`Audit Checkpoint ${stepNo} completed successfully!`, 'success');
        fetchReport();
        if (onComplete) onComplete();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to complete checkpoint.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error during completion.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const matchedScansCount = new Set(
    scans.filter(s => !s.is_unknown && s.panel_id).map(s => s.panel_id)
  ).size;

  const progressPercent = totalExpected > 0 ? Math.min(100, Math.round((matchedScansCount / totalExpected) * 100)) : 0;

  return (
    <div className="audit-terminal-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Summary & Progress Card */}
      <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#fff' }}>
              Physical Audit Checkpoint (Step {stepNo})
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              {stepNo === 6 ? 'Cross-checking Steps 1–5' : 'Cross-checking Steps 7–9'}
            </p>
          </div>
          <button
            onClick={fetchReport}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Progress Bar & Counter */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Progress:</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--color-primary)' }}>
              Scanned {matchedScansCount} of {totalExpected} PCBs
            </strong>
          </div>
          <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                background: 'var(--color-primary)',
                boxShadow: '0 0 10px var(--color-primary)',
                transition: 'width 0.3s ease'
              }}
            ></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span>{progressPercent}% Coverage</span>
            <span>{scans.filter(s => s.is_unknown).length} Unknown Scans</span>
          </div>
        </div>

        {/* Audit Status Badge */}
        {results && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(255, 212, 0, 0.05)', border: '1px solid rgba(255, 212, 0, 0.2)', borderRadius: 8 }}>
            <CheckCircle size={16} color="var(--color-primary)" />
            <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600 }}>
              Audit Report compiled on {new Date(results.computed_at).toLocaleTimeString()} ({results.total_missing} missing, {results.total_never_touched} never touched).
            </span>
          </div>
        )}
      </div>

      {/* Hardware Scanner Input Panel */}
      <div className="glass-panel" style={{ padding: 24 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Barcode / Serial Scanner Input
        </h3>
        <form onSubmit={handleScanSubmit} style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Barcode size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Scan actual barcode serial number or dummy SR number..."
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onBlur={() => setTimeout(() => inputRef.current?.focus(), 100)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 42px',
                background: 'var(--input-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: 10,
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0 24px', borderRadius: 10, fontWeight: 700 }}>
            Enter
          </button>
        </form>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, margin: 0 }}>
          💡 Barcode input is auto-focused. Keep this browser window active to scan continuously.
        </p>
      </div>

      {/* Scans list & Completion Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* Scanned Items History */}
        <div className="glass-panel" style={{ padding: 24, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', marginBottom: 16 }}>
            Scan Log ({scans.length} records)
          </h3>
          <div style={{ flex: 1, overflowY: 'auto', maxHHeight: 400, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scans.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', gap: 8 }}>
                <Barcode size={32} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: '0.8rem' }}>No scans recorded yet for this checkpoint.</span>
              </div>
            ) : (
              scans.map((s, idx) => (
                <div
                  key={s.id || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: s.is_unknown ? 'rgba(239, 68, 68, 0.04)' : 'rgba(16, 185, 129, 0.04)',
                    border: s.is_unknown ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: s.is_unknown ? '#f87171' : '#34d399' }}>
                        {s.scanned_value}
                      </span>
                      {s.is_unknown ? (
                        <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                          UNKNOWN SCAN
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                          MATCHED ({s.matched_by})
                        </span>
                      )}
                    </div>
                    {!s.is_unknown && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Sr No: {s.pcb_sr_no || '-'} | Barcode: {s.barcode || '-'}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.scanner_name}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.8 }}>
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Completion Control Box */}
        <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', margin: 0 }}>
            Submit Checkpoint
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
            Once you have scanned all PCBs in the physical lot, click below to lock scans and trigger discrepancy cross-check computations.
          </p>

          <button
            onClick={handleCompleteCheckpoint}
            className="btn btn-primary"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px 18px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderRadius: 10
            }}
          >
            <ShieldCheck size={18} />
            {submitting ? 'Processing...' : 'Complete Checkpoint'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditTerminal;
