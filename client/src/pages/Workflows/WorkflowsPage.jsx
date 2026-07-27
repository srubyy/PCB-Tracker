import React, { useState, useEffect } from 'react';
import { Cpu, Wrench, ArrowRight, Check, CheckCheck, X, ShieldAlert, CheckCircle, RefreshCw, Search, ToggleLeft, ToggleRight } from 'lucide-react'; import { useAuth } from '../../context/AuthContext';

import StationChecklist from '../../features/workflows/StationChecklist';import PresetRemarksSelect from '../../features/workflows/PresetRemarksSelect';
import PipelineIndicator, { STEP_NAMES } from '../../features/stages/PipelineIndicator';
import InwardMappingImportSection from '../../features/workflows/InwardMappingImportSection';
import AuditTerminal from '../../features/workflows/AuditTerminal';

const WorkflowsPage = ({ selectedLotNo, selectedCompany, onChangeLot, showToast }) => {
  const { user, apiFetch } = useAuth();

  // Data states from parent or loaded locally
  const [engineers, setEngineers] = useState([]);
  const [stockData, setStockData] = useState([]);

  // Terminal selection states
  const [selectedProductionStep, setSelectedProductionStep] = useState(1);
  const [productionLotId, setProductionLotId] = useState('');
  const [productionPcbType, setProductionPcbType] = useState('SA0019 - PCB GV2_CFEfficio');
  const [stepInputs, setStepInputs] = useState({});
  const [pendingProductionLogs, setPendingProductionLogs] = useState([]);
  const [approvedProductionLogs, setApprovedProductionLogs] = useState([]);
  const [lotProductionStats, setLotProductionStats] = useState(null);
  const [rejectionLogInputId, setRejectionLogInputId] = useState(null);
  const [rejectionLogText, setRejectionLogText] = useState('');
  const [inwardTab, setInwardTab] = useState('summary');
  
  const [step6Results, setStep6Results] = useState(null);
  const [step10Results, setStep10Results] = useState(null);
  const [reportModalData, setReportModalData] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState('missing');

  // Load user-specific states when user loads
  useEffect(() => {
    if (user) {
      const email = user.email;
      const savedStep = localStorage.getItem(`es_workflow_step_${email}`);
      setSelectedProductionStep(savedStep ? parseInt(savedStep, 10) : 1);
      setProductionLotId(localStorage.getItem(`es_workflow_lot_id_${email}`) || '');
      setInwardTab(localStorage.getItem(`es_workflow_inward_tab_${email}`) || 'summary');
    } else {
      setSelectedProductionStep(1);
      setProductionLotId('');
      setInwardTab('summary');
    }
  }, [user]);

  // Sync changes to user-specific localStorage keys
  useEffect(() => {
    if (user && selectedProductionStep) {
      localStorage.setItem(`es_workflow_step_${user.email}`, selectedProductionStep);
    }
  }, [selectedProductionStep, user]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(`es_workflow_lot_id_${user.email}`, productionLotId);
    }
  }, [productionLotId, user]);

  useEffect(() => {
    if (user && inwardTab) {
      localStorage.setItem(`es_workflow_inward_tab_${user.email}`, inwardTab);
    }
  }, [inwardTab, user]);


  const [steps, setSteps] = useState([
    { step_no: 1, name: "Inward" },
    { step_no: 2, name: "Segregation" },
    { step_no: 3, name: "Programming" },
    { step_no: 4, name: "1st Testing" },
    { step_no: 5, name: "Debug" },
    { step_no: 6, name: "Entry" },
    { step_no: 7, name: "Cleaning" },
    { step_no: 8, name: "QC After Cleaning" },
    { step_no: 9, name: "Marking & Coating" },
    { step_no: 10, name: "Final Testing" },
    { step_no: 11, name: "Final Entry" },
    { step_no: 12, name: "Packing" }
  ]);

  useEffect(() => {
    const loadCustomSteps = async () => {
      if (!productionLotId) return;
      const activeLot = stockData.find(l => l.id === parseInt(productionLotId));
      if (activeLot && activeLot.client_id) {
        try {
          const res = await apiFetch(`/api/stock/clients/${activeLot.client_id}/steps`);
          if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
              setSteps(data);
              return;
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
      setSteps([
        { step_no: 1, name: "Inward" },
        { step_no: 2, name: "Segregation" },
        { step_no: 3, name: "Programming" },
        { step_no: 4, name: "1st Testing" },
        { step_no: 5, name: "Debug" },
        { step_no: 6, name: "Entry" },
        { step_no: 7, name: "Cleaning" },
        { step_no: 8, name: "QC After Cleaning" },
        { step_no: 9, name: "Marking & Coating" },
        { step_no: 10, name: "Final Testing" },
        { step_no: 11, name: "Final Entry" },
        { step_no: 12, name: "Packing" }
      ]);
    };
    loadCustomSteps();
  }, [productionLotId, stockData]);

  // Station safety checklist
  const [esdWristStrap, setEsdWristStrap] = useState(false);
  const [ionizerOn, setIonizerOn] = useState(false);
  const [esdMatGrounded, setEsdMatGrounded] = useState(false);


  // Step Detail Modal States
  const [showStepDetailModal, setShowStepDetailModal] = useState(false);
  const [stepDetailLoading, setStepDetailLoading] = useState(false);
  const [stepDetailPanels, setStepDetailPanels] = useState([]);
  const [stepDetailStepNo, setStepDetailStepNo] = useState(null);
  const [stepDetailSearchQuery, setStepDetailSearchQuery] = useState('');
  const [groupByLotEnabled, setGroupByLotEnabled] = useState(true);

  // Fetch initial helper data
  const fetchEngineers = async () => {
    try {
      const res = await apiFetch('/api/engineers');
      if (res.ok) {
        const data = await res.json();
        setEngineers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStock = async () => {
    try {
      const res = await apiFetch('/api/stock');
      if (res.ok) {
        const data = await res.json();
        setStockData(data);
        if (data.length > 0 && !productionLotId && !selectedLotNo) {
          setProductionLotId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPendingProductionLogs = async (stepNo = '') => {
    try {
      let url = '/api/production/pending';
      if (stepNo) url += `?step_no=${stepNo}`;

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setPendingProductionLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProductionLogs = async (lotId = '', stepNo = '') => {
    try {
      let url = '/api/production/logs';
      const params = [];
      if (lotId) params.push(`lot_id=${lotId}`);
      if (stepNo) params.push(`step_no=${stepNo}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setApprovedProductionLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLotProductionStats = async (lotId) => {
    if (!lotId) return;
    try {
      const res = await apiFetch(`/api/production/stats/${lotId}`);
      if (res.ok) {
        const data = await res.json();
        setLotProductionStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCheckpointResults = async (lotId = productionLotId) => {
    if (!lotId) {
      setStep6Results(null);
      setStep10Results(null);
      return;
    }
    try {
      const res6 = await apiFetch(`/api/audit/report/${lotId}/6`);
      if (res6.ok) {
        const data6 = await res6.json();
        setStep6Results(data6.results || null);
      }
      const res10 = await apiFetch(`/api/audit/report/${lotId}/10`);
      if (res10.ok) {
        const data10 = await res10.json();
        setStep10Results(data10.results || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenReport = async (step) => {
    if (!productionLotId) return;
    try {
      const res = await apiFetch(`/api/audit/report/${productionLotId}/${step}`);
      if (res.ok) {
        const data = await res.json();
        setReportModalData({
          ...data,
          step
        });
        setActiveReportTab('missing');
      } else {
        showToast('Failed to retrieve checkpoint report.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load checkpoint report.', 'error');
    }
  };

  useEffect(() => {
    fetchEngineers();
    fetchStock();
  }, []);

  useEffect(() => {
    if (stockData.length > 0) {
      if (selectedLotNo) {
        const lot = stockData.find(l => l.lot_no === parseInt(selectedLotNo));
        if (lot) {
          setProductionLotId(lot.id);
        }
      } else {
        setProductionLotId('');
      }
    }
  }, [selectedLotNo, stockData]);

  // Poll pending logs reactively
  useEffect(() => {
    if (user) {
      fetchPendingProductionLogs(selectedProductionStep);
      fetchProductionLogs(productionLotId, selectedProductionStep);
      if (productionLotId) {
        fetchLotProductionStats(productionLotId);
        fetchCheckpointResults(productionLotId);
      } else {
        setLotProductionStats(null);
        setStep6Results(null);
        setStep10Results(null);
      }
    }
  }, [user, selectedProductionStep, productionLotId]);


  // Submit Step Log
  const handleProductionLogSubmit = async (e) => {
    e.preventDefault();
    if (!productionLotId) {
      showToast('Please select a lot first.', 'warning');
      return;
    }

    try {
      const res = await apiFetch('/api/production/log', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: parseInt(productionLotId),
          step_no: selectedProductionStep,
          pcb_type: productionPcbType,
          step_data: stepInputs
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Log submitted successfully!');
        setStepInputs({});
        fetchPendingProductionLogs(selectedProductionStep);
        fetchProductionLogs(productionLotId, selectedProductionStep);
        fetchLotProductionStats(productionLotId);
      } else {
        showToast(data.error || 'Failed to submit production log.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to production log API.', 'danger');
    }
  };

  // Clearance Actions (For TL & Managers)
  const tlApproveProductionLog = async (pendingLogId) => {
    try {
      const res = await apiFetch('/api/production/tl-approve', {
        method: 'POST',
        body: JSON.stringify({ pending_log_id: pendingLogId })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Team Lead clearance approved. Log committed to production database!');
        fetchPendingProductionLogs(selectedProductionStep);
        fetchProductionLogs(productionLotId, selectedProductionStep);
        fetchLotProductionStats(productionLotId);
      } else {
        showToast(data.error || 'Failed to approve log.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API.', 'danger');
    }
  };

  const rejectProductionLog = async (pendingLogId, reason) => {
    if (!reason) {
      showToast('Please enter a rejection reason.', 'warning');
      return;
    }
    try {
      const res = await apiFetch('/api/production/reject', {
        method: 'POST',
        body: JSON.stringify({ pending_log_id: pendingLogId, rejection_reason: reason })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Production log entry rejected. Operator notified.', 'warning');
        setRejectionLogInputId(null);
        setRejectionLogText('');
        fetchPendingProductionLogs(selectedProductionStep);
      } else {
        showToast(data.error || 'Failed to reject log.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API.', 'danger');
    }
  };

  // View Step active PCBs list details
  const fetchStepPanels = async (stepNo) => {
    setStepDetailLoading(true);
    setStepDetailPanels([]);
    setStepDetailStepNo(stepNo);
    try {
      const res = await apiFetch(`/api/panels?step_no=${stepNo}`);
      if (res.ok) {
        const data = await res.json();
        setStepDetailPanels(data);
      } else {
        showToast("Failed to load step PCBs", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Error connecting to server", "danger");
    } finally {
      setStepDetailLoading(false);
    }
  };

  const filteredPendingLogs = Array.isArray(pendingProductionLogs)
    ? (selectedLotNo ? pendingProductionLogs.filter(p => p.lot_no === parseInt(selectedLotNo)) : pendingProductionLogs)
    : [];

  const activeStepName = steps[selectedProductionStep - 1]?.name || '';
  const knownSteps = [
    'Inward', 'Segregation', 'Programming', '1st Testing', 'Debug', 'Entry',
    'Cleaning', 'QC After Cleaning', 'Marking & Coating', 'Final Testing', 'Final Entry', 'Packing'
  ];
  const isGenericCustomStep = activeStepName && !knownSteps.includes(activeStepName);

  return (
    <div>
      <div className="app-header">
        <div>
          <span className="app-subtitle">Operations Terminal</span>
          <h1 className="app-title"><Wrench size={20} color='var(--color-primary)' /> Refurbishment Pipeline Station</h1>
        </div>

        {/* Active Lot selector */}
        <div className="repair-lot-selector" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>Active Lot:</label>
          <select
            value={productionLotId}
            onChange={e => {
              const newId = e.target.value;
              setProductionLotId(newId);
              fetchLotProductionStats(newId);
              setStepInputs({});
              if (onChangeLot) {
                if (newId) {
                  const lot = stockData.find(l => l.id === parseInt(newId));
                  onChangeLot(lot ? String(lot.lot_no) : '');
                } else {
                  onChangeLot('');
                }
              }
            }}
            disabled={false}
            style={{
              width: 'auto',
              minWidth: 200,
              padding: '6px 12px',
              background: 'var(--input-bg)',
              color: 'var(--text-main)',
              borderRadius: 8,
              border: '1px solid var(--card-border)',
              cursor: 'pointer'
            }}
          >
             <option value="">-- Select Active Lot --</option>
             {Array.isArray(stockData) && stockData
               .filter(l => selectedCompany ? l.client_name && l.client_name.toLowerCase().includes(selectedCompany.toLowerCase()) : true)
               .map(l => (
                 <option key={l.id} value={l.id}>Lot {l.lot_no}</option>
               ))
             }
          </select>
        </div>
      </div>

      {/* 12-Step Visual Pipeline Grid */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wrench size={14} /> Interactive {steps.length}-Step Pipeline Flow (Click to Select Step)
        </h3>
        <PipelineIndicator
          selectedStep={selectedProductionStep}
          onSelectStep={(stepNo) => { setSelectedProductionStep(stepNo); setStepInputs({}); }}
          onViewStepPanels={(stepNo) => { fetchStepPanels(stepNo); setShowStepDetailModal(true); }}
          hidePCBsButton={user?.role === 'Employee'}
          steps={steps}
        />
      </div>

      {/* Checkpoint Audit Banners */}
      {(step6Results || step10Results) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {step6Results && (
            <div className="glass-panel" style={{
              padding: '12px 18px',
              borderLeft: '4px solid #10b981',
              background: 'rgba(16, 185, 129, 0.02)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderRadius: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={16} color="#10b981" />
                <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>
                  Step 6 checkpoint: ✓ Completed — {step6Results.total_scanned} of {step6Results.total_in_scope} scanned — {step6Results.total_missing} missing
                </span>
              </div>
              {['Superadmin', 'Team Lead'].includes(user?.role) && (
                <button
                  onClick={() => handleOpenReport(6)}
                  className="btn btn-secondary"
                  style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700 }}
                >
                  View Detailed Report
                </button>
              )}
            </div>
          )}
          {step10Results && (
            <div className="glass-panel" style={{
              padding: '12px 18px',
              borderLeft: '4px solid #10b981',
              background: 'rgba(16, 185, 129, 0.02)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderRadius: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={16} color="#10b981" />
                <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>
                  Step 10 checkpoint: ✓ Completed — {step10Results.total_scanned} of {step10Results.total_in_scope} scanned — {step10Results.total_missing} missing
                </span>
              </div>
              {['Superadmin', 'Team Lead'].includes(user?.role) && (
                <button
                  onClick={() => handleOpenReport(10)}
                  className="btn btn-secondary"
                  style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700 }}
                >
                  View Detailed Report
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className={user?.role === 'Employee' ? "" : "widescreen-grid"}>
        {/* Left Column: Lot Status & ESD checklist (Only visible to non-Employees) */}
        {user?.role !== 'Employee' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, height: 'fit-content' }}>
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Cpu size={16} /> Lot Checksum & Yield Vitals
                </h3>
                {lotProductionStats ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ padding: 10, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Inward Received</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: 4 }}>
                          {lotProductionStats.received_qty} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>PCBs</span>
                        </div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Shortage</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: lotProductionStats.qty_sent - lotProductionStats.received_qty > 0 ? '#f87171' : '#10b981', marginTop: 4 }}>
                          {lotProductionStats.qty_sent - lotProductionStats.received_qty} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>units</span>
                        </div>
                      </div>
                    </div>

                    {/* Stage-wise throughput metrics */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>Stage-wise Active Throughput:</div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span>Step 1: Inward (Lot Received)</span>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{lotProductionStats.received_qty} units</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span>Step 2: Segregation</span>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                          {parseInt(lotProductionStats.steps[2]?.repairable_qty || 0)} Rep • {parseInt(lotProductionStats.steps[2]?.scrap_qty || 0)} Scrap
                        </span>
                      </div>

                      {/* Checksum discrepancy warnings */}
                      {parseInt(lotProductionStats.steps[2]?.repairable_qty || 0) + parseInt(lotProductionStats.steps[2]?.scrap_qty || 0) > 0 &&
                        parseInt(lotProductionStats.steps[2]?.repairable_qty || 0) + parseInt(lotProductionStats.steps[2]?.scrap_qty || 0) !== lotProductionStats.received_qty && (
                          <div style={{ color: '#ef4444', fontSize: '0.65rem', background: 'rgba(239, 68, 68, 0.05)', padding: 6, borderRadius: 6, border: '1px solid var(--card-border)' }}>
                            ⚠️ DISCREPANCY DETECTED: Segregated count ({parseInt(lotProductionStats.steps[2]?.repairable_qty || 0) + parseInt(lotProductionStats.steps[2]?.scrap_qty || 0)}) does not match Inward count ({lotProductionStats.received_qty})!
                          </div>
                        )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span>Step 3: Programming</span>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                          {parseInt(lotProductionStats.steps[3]?.code_ok || 0)} OK • {parseInt(lotProductionStats.steps[3]?.code_not_ok || 0)} Fail
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span>Step 4: 1st Testing</span>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                          {parseInt(lotProductionStats.steps[4]?.qty_passed || 0)} Passed • {parseInt(lotProductionStats.steps[4]?.qty_failed || 0)} Failed
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span>Step 11: Final Entry (Dispatch)</span>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>{parseInt(lotProductionStats.steps[11]?.entry_count || 0)} Dispatched</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '16px',
                    background: 'var(--card-bg)',
                    border: '1px dashed rgba(255, 255, 255, 0.06)',
                    borderRadius: 10,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    margin: '8px 0'
                  }}>
                    <span className="pulse-indicator" style={{ background: '#e11d48', width: 8, height: 8, borderRadius: '50%', boxShadow: '0 0 10px #e11d48' }}></span>
                    <div style={{ fontSize: '0.72rem', color: '#fda4af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telemetry Link Offline</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Select an active production lot from the header to link this station terminal and synchronize real-time stage checksum metrics.
                    </div>
                  </div>
                )}
              </div>

              {/* Product selection */}
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>PCB Product Type:</label>
                <select
                  value={productionPcbType}
                  onChange={e => setProductionPcbType(e.target.value)}
                  style={{ padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 8, width: '100%', cursor: 'pointer' }}
                >
                  <option value="SA0019 - PCB GV2_CFEfficio">SA0019 - PCB GV2_CFEfficio</option>
                  <option value="SA0021 - GV2  Main PCB 1200mm Reg_28W">SA0021 - GV2  Main PCB 1200mm Reg_28W</option>
                  <option value="SA0022 - GV2 Main PCB 1400mm Reg 35W">SA0022 - GV2 Main PCB 1400mm Reg 35W</option>
                  <option value="SA0011 - PCB GV3 Digital Renesat">SA0011 - PCB GV3 Digital Renesat</option>
                  <option value="SA0010 - GV3 Smart Digital 1200mm">SA0010 - GV3 Smart Digital 1200mm</option>
                  <option value="SA0061 - GV3 Power PCB White">SA0061 - GV3 Power PCB White</option>
                  <option value="SA0060 - GV3 Power PCB Black">SA0060 - GV3 Power PCB Black</option>
                  <option value="SA0039 - GV4 Studio+ Remote_ 1200mm">SA0039 - GV4 Studio+ Remote_ 1200mm</option>
                  <option value="SA0038 - GV4 Alpha PCB_Regulator_1200mm">SA0038 - GV4 Alpha PCB_Regulator_1200mm</option>
                  <option value="SA0087 - GV4 Ozeo PCB_Main_1200mm">SA0087 - GV4 Ozeo PCB_Main_1200mm</option>
                </select>
              </div>

              {/* ESD Checklist */}
              <StationChecklist
                esdWristStrap={esdWristStrap}
                setEsdWristStrap={setEsdWristStrap}
                ionizerOn={ionizerOn}
                setIonizerOn={setIonizerOn}
                esdMatGrounded={esdMatGrounded}
                setEsdMatGrounded={setEsdMatGrounded}
              />
            </div>
          </div>
        )}

        {/* Right Column: Vetting Queue / Logs form */}
        <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {[6, 10].includes(selectedProductionStep) ? (
            <AuditTerminal
              lotId={productionLotId}
              stepNo={selectedProductionStep}
              user={user}
              showToast={showToast}
              onComplete={() => {
                fetchCheckpointResults(productionLotId);
                fetchLotProductionStats(productionLotId);
              }}
              apiFetch={apiFetch}
            />
          ) : user?.role === 'Employee' ? (
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 16 }}>
                Log Production Batch - Step {selectedProductionStep}: {steps[selectedProductionStep - 1]?.name || 'Unknown Step'}
              </h2>

              <form onSubmit={handleProductionLogSubmit}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>PCB Product Type</label>
                  <select
                    value={productionPcbType}
                    onChange={e => setProductionPcbType(e.target.value)}
                    style={{ padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 8, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="SA0019 - PCB GV2_CFEfficio">SA0019 - PCB GV2_CFEfficio</option>
                    <option value="SA0021 - GV2  Main PCB 1200mm Reg_28W">SA0021 - GV2  Main PCB 1200mm Reg_28W</option>
                    <option value="SA0022 - GV2 Main PCB 1400mm Reg 35W">SA0022 - GV2 Main PCB 1400mm Reg 35W</option>
                    <option value="SA0011 - PCB GV3 Digital Renesat">SA0011 - PCB GV3 Digital Renesat</option>
                    <option value="SA0010 - GV3 Smart Digital 1200mm">SA0010 - GV3 Smart Digital 1200mm</option>
                    <option value="SA0061 - GV3 Power PCB White">SA0061 - GV3 Power PCB White</option>
                    <option value="SA0060 - GV3 Power PCB Black">SA0060 - GV3 Power PCB Black</option>
                    <option value="SA0039 - GV4 Studio+ Remote_ 1200mm">SA0039 - GV4 Studio+ Remote_ 1200mm</option>
                    <option value="SA0038 - GV4 Alpha PCB_Regulator_1200mm">SA0038 - GV4 Alpha PCB_Regulator_1200mm</option>
                    <option value="SA0087 - GV4 Ozeo PCB_Main_1200mm">SA0087 - GV4 Ozeo PCB_Main_1200mm</option>
                  </select>
                </div>
                {selectedProductionStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 8, background: 'var(--input-bg)', padding: 4, borderRadius: 8, border: '1px solid var(--card-border)' }}>
                      <button
                        type="button"
                        onClick={() => setInwardTab('summary')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          borderRadius: 6,
                          background: inwardTab === 'summary' ? 'var(--color-primary)' : 'transparent',
                          color: inwardTab === 'summary' ? '#000' : 'var(--text-muted)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Lot Inward Summary
                      </button>
                      <button
                        type="button"
                        onClick={() => setInwardTab('mapping')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          borderRadius: 6,
                          background: inwardTab === 'mapping' ? 'var(--color-primary)' : 'transparent',
                          color: inwardTab === 'mapping' ? '#000' : 'var(--text-muted)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        PCB Mapping & Excel Import
                      </button>
                    </div>

                    {inwardTab === 'summary' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="form-group">
                          <label>Challan Quantity</label>
                          <input
                            type="number"
                            required
                            placeholder="e.g. 678"
                            value={stepInputs.expected_qty || ''}
                            onChange={e => setStepInputs({ ...stepInputs, expected_qty: parseInt(e.target.value) || '' })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Quantity Received</label>
                          <input
                            type="number"
                            required
                            placeholder="e.g. 658"
                            value={stepInputs.qty_received || ''}
                            onChange={e => setStepInputs({ ...stepInputs, qty_received: parseInt(e.target.value) || '' })}
                          />
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          * Shortage will be auto-computed: <strong>{(parseInt(stepInputs.expected_qty || 0) - parseInt(stepInputs.qty_received || 0))} units shortage</strong>.
                        </div>
                      </div>
                    ) : (
                      <InwardMappingImportSection
                        lotId={productionLotId}
                        apiFetch={apiFetch}
                        showToast={showToast}
                        onSuccess={() => {
                          fetchPendingProductionLogs(selectedProductionStep);
                          fetchProductionLogs(productionLotId, selectedProductionStep);
                          fetchLotProductionStats(productionLotId);
                        }}
                      />
                    )}
                  </div>
                )}

                {activeStepName === 'Segregation' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Repairable Quantity</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 600"
                        value={stepInputs.repairable_qty || ''}
                        onChange={e => setStepInputs({ ...stepInputs, repairable_qty: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Scrap Quantity</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 58"
                        value={stepInputs.scrap_qty || ''}
                        onChange={e => setStepInputs({ ...stepInputs, scrap_qty: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Total Inspected (Repairable + Scrap): <strong>{(parseInt(stepInputs.repairable_qty || 0) + parseInt(stepInputs.scrap_qty || 0))} PCBs</strong>.
                      {lotProductionStats && (parseInt(stepInputs.repairable_qty || 0) + parseInt(stepInputs.scrap_qty || 0)) !== lotProductionStats.received_qty && (
                        <span style={{ color: '#ef4444', display: 'block', marginTop: 4 }}>
                          ⚠️ Warning: Total must equal lot received count ({lotProductionStats.received_qty})!
                        </span>
                      )}
                    </div>
                    <PresetRemarksSelect stepNo={2} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Programming' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Code OK (Passed)</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 590"
                        value={stepInputs.code_ok || ''}
                        onChange={e => setStepInputs({ ...stepInputs, code_ok: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Code Not OK (Failed)</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 10"
                        value={stepInputs.code_not_ok || ''}
                        onChange={e => setStepInputs({ ...stepInputs, code_not_ok: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Total programmed: <strong>{(parseInt(stepInputs.code_ok || 0) + parseInt(stepInputs.code_not_ok || 0))} PCBs</strong>.
                    </div>
                  </div>
                )}

                {activeStepName === '1st Testing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Passed (OK)</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 570"
                        value={stepInputs.qty_passed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_passed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity Failed</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 20"
                        value={stepInputs.qty_failed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_failed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={4} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Debug' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Debug OK</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 15"
                        value={stepInputs.debug_ok || ''}
                        onChange={e => setStepInputs({ ...stepInputs, debug_ok: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Critical Quantity</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 3"
                        value={stepInputs.critical_qty || ''}
                        onChange={e => setStepInputs({ ...stepInputs, critical_qty: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Scrap PCBs</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 2"
                        value={stepInputs.scrap_qty || ''}
                        onChange={e => setStepInputs({ ...stepInputs, scrap_qty: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={5} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Entry' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Entry Count</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 585"
                        value={stepInputs.entry_count || ''}
                        onChange={e => setStepInputs({ ...stepInputs, entry_count: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>PCB Status</label>
                      <select
                        value={stepInputs.pcb_status || 'OK PCB'}
                        onChange={e => setStepInputs({ ...stepInputs, pcb_status: e.target.value })}
                      >
                        <option value="OK PCB">OK PCB</option>
                        <option value="Faulty">Faulty</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeStepName === 'Cleaning' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Cleaned</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 580"
                        value={stepInputs.qty_cleaned || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_cleaned: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>QC Reject</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 5"
                        value={stepInputs.qc_reject || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qc_reject: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={7} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'QC After Cleaning' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Passed</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 580"
                        value={stepInputs.qty_passed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_passed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity Failed</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 0"
                        value={stepInputs.qty_failed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_failed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={8} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Marking & Coating' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Marked & Coated</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 580"
                        value={stepInputs.qty_coated || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_coated: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={9} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Final Testing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Passed</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.qty_passed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_passed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity Failed</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.qty_failed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_failed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={10} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Packing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Bubble Packed</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.bubble_packed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, bubble_packed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Box Packed</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.box_packed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, box_packed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Outbound Lot Code (Out_Lot)</label>
                      <input
                        type="text"
                        placeholder="e.g. DISP-72"
                        value={stepInputs.out_lot || ''}
                        onChange={e => setStepInputs({ ...stepInputs, out_lot: e.target.value })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={12} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {activeStepName === 'Final Entry' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Entry Count</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.entry_count || ''}
                        onChange={e => setStepInputs({ ...stepInputs, entry_count: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>PCB Status</label>
                      <select
                        value={stepInputs.pcb_status || 'OK PCB'}
                        onChange={e => setStepInputs({ ...stepInputs, pcb_status: e.target.value })}
                      >
                        <option value="OK PCB">OK PCB</option>
                        <option value="Faulty">Faulty</option>
                      </select>
                    </div>
                  </div>
                )}

                {isGenericCustomStep && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Quantity Passed</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.qty_passed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_passed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity Failed</label>
                      <input
                        type="number"
                        required
                        value={stepInputs.qty_failed || ''}
                        onChange={e => setStepInputs({ ...stepInputs, qty_failed: parseInt(e.target.value) || '' })}
                      />
                    </div>
                    <PresetRemarksSelect stepNo={selectedProductionStep} stepInputs={stepInputs} setStepInputs={setStepInputs} />
                  </div>
                )}

                {!(selectedProductionStep === 1 && inwardTab === 'mapping') && (
                  <button type="submit" className="btn" style={{ marginTop: 16 }}>
                    Submit Step Production Log <ArrowRight size={14} />
                  </button>
                )}
              </form>

              {/* My Pending & Recent Submissions */}
              <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12 }}>My Pending & Recent Step Log Submissions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {filteredPendingLogs.filter(p => p.operator_id === user.id).length === 0 ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No pending clearance approvals for this step.</div>
                  ) : (
                    filteredPendingLogs.filter(p => p.operator_id === user.id).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: 8, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: '0.72rem' }}>
                        <div>
                          <strong>{p.pcb_type}</strong> • {p.step_no === 1 ? `Challan: ${p.step_data.expected_qty || 0} • Recv: ${p.step_data.qty_received || 0}` : `Qty: ${Object.values(p.step_data)[0]}`}
                          {p.rejection_reason && <div style={{ color: '#ef4444', fontSize: '0.65rem' }}>❌ Rejected Reason: {p.rejection_reason}</div>}
                        </div>
                        <span className={`badge ${p.approval_status === 'Rejected' ? 'badge-danger' : 'badge-warning'}`}>{p.approval_status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Vetting & Approvals Queue for Selected Step (TL / Manager) */
            <div>
              <h2 className="vetting-queue-header" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <span>Vetting & Approvals Queue - Step {selectedProductionStep}: {steps[selectedProductionStep - 1]?.name || 'Unknown Step'}</span>
                <button
                  onClick={() => fetchPendingProductionLogs(selectedProductionStep)}
                  className="btn btn-secondary"
                  style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: '0.65rem' }}
                >
                  Refresh
                </button>
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredPendingLogs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text-muted)', textAlign: 'center' }}>
                    <CheckCircle size={36} color="#10b981" style={{ opacity: 0.6, marginBottom: 12 }} />
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 800, margin: 0 }}>Step Queue Clear</h3>
                    <p style={{ fontSize: '0.75rem', margin: 0, marginTop: 4 }}>No pending step-wise logs require your clearance sign-off at this step.</p>
                  </div>
                ) : (
                  filteredPendingLogs.map(log => {
                    const dataEntries = Object.entries(log.step_data);
                    const isTLPending = log.approval_status === 'Pending Team Lead';
                    const isTLRole = user.role === 'Team Lead';

                    return (
                      <div
                        key={log.id}
                        className="glass-panel"
                        style={{
                          padding: 14,
                          border: '1px solid var(--card-border)',
                          background: 'var(--card-bg)',
                          borderColor: isTLPending ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 10 }}>
                          <div>
                            <strong style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>Lot {log.lot_no} ({log.batch_no} • {log.pixel_pitch})</strong>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Operator: <strong>{log.operator_name || 'System'}</strong> • Time: {new Date(log.timestamp).toLocaleString()}
                            </div>
                          </div>
                          <span className={`badge ${log.approval_status === 'Pending Team Lead' ? 'badge-warning' : log.approval_status === 'Rejected' ? 'badge-danger' : 'badge-success'}`}>
                            {log.approval_status}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>LOG DATA FIELDS:</div>
                          <div className="approval-data-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            <div style={{ padding: '6px 8px', background: 'var(--input-bg)', borderRadius: 6 }}>
                              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>PCB Type</span>
                              <strong style={{ fontSize: '0.72rem', color: 'var(--text-main)' }}>{log.pcb_type}</strong>
                            </div>
                            {dataEntries.map(([k, v]) => (
                              <div key={k} style={{ padding: '6px 8px', background: 'var(--input-bg)', borderRadius: 6 }}>
                                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block', textTransform: 'capitalize' }}>
                                  {k === 'expected_qty' ? 'Challan Quantity' : k.replace('_', ' ')}
                                </span>
                                <strong style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}>{String(v)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Sign-off Actions */}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {rejectionLogInputId === log.id ? (
                            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                              <input
                                type="text"
                                required
                                placeholder="Enter reason for rejection..."
                                value={rejectionLogText}
                                onChange={e => setRejectionLogText(e.target.value)}
                                style={{ flex: 1, padding: '6px 12px', fontSize: '0.72rem' }}
                              />
                              <button
                                onClick={() => rejectProductionLog(log.id, rejectionLogText)}
                                className="btn btn-danger"
                                style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: '0.72rem' }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setRejectionLogInputId(null)}
                                className="btn btn-secondary"
                                style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: '0.72rem' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              {isTLPending && isTLRole && (
                                <>
                                  <button
                                    onClick={() => tlApproveProductionLog(log.id)}
                                    className="btn btn-success"
                                    style={{ width: 'auto', margin: 0, padding: '6px 14px', background: 'var(--color-primary)', color: '#000', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                                  >
                                    <Check size={12} /> TL Sign-off
                                  </button>
                                  <button
                                    onClick={() => { setRejectionLogInputId(log.id); setRejectionLogText(''); }}
                                    className="btn btn-danger"
                                    style={{ width: 'auto', margin: 0, padding: '6px 14px', fontSize: '0.72rem', cursor: 'pointer' }}
                                  >
                                    <X size={12} /> Reject
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step Active PCBs Detail Modal */}
      {showStepDetailModal && stepDetailStepNo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--input-bg)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 20, borderColor: 'var(--color-primary)', background: '#0b0f19', borderRadius: 16 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--card-border)', paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <span className="app-subtitle" style={{ fontSize: '0.65rem' }}>Stepwise Live Inventory</span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 2 }}>
                  Step {stepDetailStepNo}: {steps[stepDetailStepNo - 1]?.name || 'Unknown Step'}
                </h3>
              </div>
              <button
                onClick={() => { setShowStepDetailModal(false); setStepDetailPanels([]); setStepDetailSearchQuery(''); }}
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '50%', color: '#ef4444', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search PCBs by lot or engineer..."
                  value={stepDetailSearchQuery}
                  onChange={e => setStepDetailSearchQuery(e.target.value)}
                  style={{ padding: '8px 12px 8px 34px', fontSize: '0.78rem', background: 'var(--input-bg)', border: '1px solid var(--card-border)', borderRadius: 8, color: 'var(--text-main)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', background: 'var(--card-bg)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Group by Lot:</span>
                  <button
                    onClick={() => setGroupByLotEnabled(!groupByLotEnabled)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                  >
                    {groupByLotEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>

                <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                  {stepDetailLoading ? (
                    <span>Loading...</span>
                  ) : (
                    <span>
                      {(() => {
                        const q = stepDetailSearchQuery.toLowerCase().trim();
                        const filtered = stepDetailPanels.filter(p => {
                          if (!q) return true;
                          return (
                            String(p.lot_no).toLowerCase().includes(q) ||
                            p.engineer_name.toLowerCase().includes(q)
                          );
                        });
                        return q
                          ? `Showing ${filtered.length} of ${stepDetailPanels.length} PCBs`
                          : `${stepDetailPanels.length} active PCBs`;
                      })()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {stepDetailLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
                  <span style={{ fontSize: '0.75rem' }}>Loading stepwise PCB inventory...</span>
                </div>
              ) : stepDetailPanels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  No active PCBs currently in this station.
                </div>
              ) : (() => {
                const q = stepDetailSearchQuery.toLowerCase().trim();
                const filtered = stepDetailPanels.filter(p => {
                  if (!q) return true;
                  return (
                    String(p.lot_no).toLowerCase().includes(q) ||
                    p.engineer_name.toLowerCase().includes(q)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      No PCBs match your search criteria.
                    </div>
                  );
                }

                if (groupByLotEnabled) {
                  const groups = {};
                  filtered.forEach(p => {
                    const key = p.lot_no || 'Unassigned';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(p);
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {Object.entries(groups).map(([lotNo, panels]) => {
                        const sample = panels[0];
                        return (
                          <div key={lotNo} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--card-border)', paddingBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>📦 Lot {lotNo} ({sample.batch_no} • {sample.pixel_pitch})</span>
                              <span style={{ fontSize: '0.62rem', background: 'var(--card-bg)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-muted)' }}>
                                {panels.length} PCBs
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {panels.map(p => (
                                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: '0.75rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontFamily: 'monospace' }}>PCB Record</strong>
                                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700 }}>SR #{p.sr_no}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    <span>Side: <strong>{p.side}</strong></span>
                                    <span>Eng: <strong>{p.engineer_name.split(' ')[0]}</strong></span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                } else {
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {filtered.map(p => (
                        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontFamily: 'monospace' }}>PCB Record</strong>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700 }}>Lot {p.lot_no} • SR #{p.sr_no}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            <span>Side: <strong>{p.side}</strong></span>
                            <span>Eng: <strong>{p.engineer_name.split(' ')[0]}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
              })()}
            </div>

          </div>
        </div>
      )}

      {/* Checkpoint Audit Detailed Report Modal */}
      {reportModalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 15, 25, 0.9)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 1000, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 24, borderColor: 'var(--color-primary)', background: '#0b0f19', borderRadius: 16 }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--card-border)', paddingBottom: 16, marginBottom: 16 }}>
              <div>
                <span className="app-subtitle" style={{ fontSize: '0.65rem' }}>Checkpoint Audit Center</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 2 }}>
                  Step {reportModalData.step} Audit Checkpoint Detailed Report
                </h3>
              </div>
              <button
                onClick={() => setReportModalData(null)}
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '50%', color: '#ef4444', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Stats Summary Widgets */}
            {reportModalData.results && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: 10 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Expected in steps</span>
                  <strong style={{ fontSize: '1.1rem', color: '#fff' }}>{reportModalData.results.total_in_scope} PCBs</strong>
                </div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: 10 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Physically Scanned</span>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>{reportModalData.results.total_scanned} PCBs</strong>
                </div>
                <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 10 }}>
                  <span style={{ fontSize: '0.6rem', color: '#ef4444', textTransform: 'uppercase', display: 'block' }}>Missing</span>
                  <strong style={{ fontSize: '1.1rem', color: '#f87171' }}>{reportModalData.results.total_missing} PCBs</strong>
                </div>
                <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 10 }}>
                  <span style={{ fontSize: '0.6rem', color: '#f59e0b', textTransform: 'uppercase', display: 'block' }}>Never Touched</span>
                  <strong style={{ fontSize: '1.1rem', color: '#fbbf24' }}>{reportModalData.results.total_never_touched} PCBs</strong>
                </div>
              </div>
            )}

            {/* Tab Selection */}
            <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--card-border)', marginBottom: 16 }}>
              <button
                onClick={() => setActiveReportTab('missing')}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeReportTab === 'missing' ? '2px solid var(--color-primary)' : 'none',
                  color: activeReportTab === 'missing' ? 'var(--color-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                🔴 Missing PCBs ({reportModalData.missing.length})
              </button>
              <button
                onClick={() => setActiveReportTab('mismatches')}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeReportTab === 'mismatches' ? '2px solid var(--color-primary)' : 'none',
                  color: activeReportTab === 'mismatches' ? 'var(--color-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                ⚠️ Count Mismatch ({reportModalData.mismatches.length})
              </button>
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {activeReportTab === 'missing' ? (
                reportModalData.missing.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No missing PCBs recorded at this checkpoint.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: 10 }}>PCB Sr No</th>
                        <th style={{ padding: 10 }}>Actual Serial No</th>
                        <th style={{ padding: 10 }}>Part Code</th>
                        <th style={{ padding: 10 }}>Model</th>
                        <th style={{ padding: 10 }}>Mfg Year</th>
                        <th style={{ padding: 10 }}>Action</th>
                        <th style={{ padding: 10 }}>Last Step Logged</th>
                        <th style={{ padding: 10 }}>Logged By</th>
                        <th style={{ padding: 10 }}>Last Logged At</th>
                        <th style={{ padding: 10 }}>Missing Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportModalData.missing.map((m, idx) => {
                        const isNeverTouched = m.missing_type === 'Never touched';
                        const rowBg = isNeverTouched ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)';
                        const rowBorder = isNeverTouched ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
                        const txtColor = isNeverTouched ? '#f87171' : '#fbbf24';

                        return (
                          <tr key={m.id || idx} style={{ borderBottom: `1px solid ${rowBorder}`, background: rowBg, color: txtColor }}>
                            <td style={{ padding: 10, fontWeight: 700 }}>{m.pcb_sr_no || '-'}</td>
                            <td style={{ padding: 10, fontFamily: 'monospace' }}>{m.barcode || '-'}</td>
                            <td style={{ padding: 10 }}>{m.part_code || '-'}</td>
                            <td style={{ padding: 10 }}>{m.model || '-'}</td>
                            <td style={{ padding: 10 }}>{m.mfg_year || '-'}</td>
                            <td style={{ padding: 10 }}>{m.action || '-'}</td>
                            <td style={{ padding: 10 }}>{m.last_step_name || 'N/A'}</td>
                            <td style={{ padding: 10 }}>{m.last_logged_by_name || 'N/A'}</td>
                            <td style={{ padding: 10 }}>{m.last_logged_at ? new Date(m.last_logged_at).toLocaleString() : 'N/A'}</td>
                            <td style={{ padding: 10 }}>
                              <span style={{ fontSize: '0.62rem', background: isNeverTouched ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                                {m.missing_type}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              ) : (
                reportModalData.mismatches.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No part code count mismatches recorded at this checkpoint.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: 10 }}>Part Code</th>
                        <th style={{ padding: 10 }}>Expected at Checkpoint</th>
                        <th style={{ padding: 10 }}>Scanned at Checkpoint</th>
                        <th style={{ padding: 10 }}>Delta</th>
                        <th style={{ padding: 10 }}>First Step where Count Dropped</th>
                        <th style={{ padding: 10 }}>Step-by-step breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportModalData.mismatches.map((m, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)', color: '#fff' }}>
                          <td style={{ padding: 10, fontWeight: 700, color: 'var(--color-primary)' }}>{m.part_code}</td>
                          <td style={{ padding: 10 }}>{m.expected} units</td>
                          <td style={{ padding: 10 }}>{m.scanned} units</td>
                          <td style={{ padding: 10, color: m.delta > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                            {m.delta > 0 ? `-${m.delta}` : `+${Math.abs(m.delta)}`}
                          </td>
                          <td style={{ padding: 10, color: '#fbbf24', fontWeight: 700 }}>{m.first_step_dropped}</td>
                          <td style={{ padding: 10 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {m.steps_breakdown.map((sb, sIdx) => (
                                <div key={sIdx} style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  <strong>{sb.step_name}:</strong> {sb.count} units logged by [{sb.logged_by}]
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowsPage;
