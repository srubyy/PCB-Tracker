import React, { useState, useEffect } from 'react';
import { Package, Download, Plus, Search, History, Mail, ToggleRight, ToggleLeft, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Import feature components
import InwardForm from '../../features/lots/InwardForm';
import OutwardModal from '../../features/lots/OutwardModal';
import ReturnModal from '../../features/lots/ReturnModal';
import RedispatchModal from '../../features/lots/RedispatchModal';
import TransactionHistoryModal from '../../features/lots/TransactionHistoryModal';
import EmailModal from '../../features/lots/EmailModal';

const LotsPage = ({ selectedLotNo, selectedCompany, showToast, onRefreshLots }) => {
  const { user, apiFetch } = useAuth();
  
  // Detailed Lot view states
  const [activeLotDetail, setActiveLotDetail] = useState(null);
  const [lotDetailTab, setLotDetailTab] = useState('stock');
  const [checkpointReport6, setCheckpointReport6] = useState(null);
  const [checkpointReport10, setCheckpointReport10] = useState(null);
  const [detailedScanLog, setDetailedScanLog] = useState([]);
  const [detailScanSearch, setDetailScanSearch] = useState('');
  const [detailScansPage, setDetailScansPage] = useState(1);
  const [timelineExpandedRowId, setTimelineExpandedRowId] = useState(null);
  
  // Checkpoints filters
  const [selectedCheckpointFilter, setSelectedCheckpointFilter] = useState('all');
  const [missingFilterType, setMissingFilterType] = useState('all');
  const [missingFilterPartCode, setMissingFilterPartCode] = useState('');
  const [missingFilterEmployee, setMissingFilterEmployee] = useState('');
  const [missingSearchQuery, setMissingSearchQuery] = useState('');
  
  // Resolving missing items states
  const [resolvingMissingId, setResolvingMissingId] = useState(null);
  const [resolvingAction, setResolvingAction] = useState('Found');
  const [resolvingLocationNote, setResolvingLocationNote] = useState('');
  const [resolvingTargetLotId, setResolvingTargetLotId] = useState('');
  
  // Data states
  const [stockData, setStockData] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  
  // Filtering & Search
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateStartFilter, setDateStartFilter] = useState('');
  const [dateEndFilter, setDateEndFilter] = useState('');
  
  // Pagination
  const [currentStockPage, setCurrentStockPage] = useState(1);
  const lotsPerPage = 5;

  // Form toggles
  const [showInwardForm, setShowInwardForm] = useState(false);
  const [newLot, setNewLot] = useState({
    lot_no: '',
    batch_no: '',
    pixel_pitch: 'P5.9',
    client_name: 'Atomberg',
    qty_sent: '',
    qty_received: '',
    remarks: ''
  });
  const [managerSignOff, setManagerSignOff] = useState(false);

  // Modals visibility & form states
  const [showOutwardModal, setShowOutwardModal] = useState(false);
  const [outwardForm, setOutwardForm] = useState({ lot_id: '', qty: '', remarks: '' });

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnForm, setReturnForm] = useState({ lot_id: '', qty: '', reason: 'Solder Defect', remarks: '' });

  const [showRedispatchModal, setShowRedispatchModal] = useState(false);
  const [redispatchForm, setRedispatchForm] = useState({ lot_id: '', qty: '', remarks: '' });

  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [selectedLotTransactions, setSelectedLotTransactions] = useState([]);
  const [transactionsLotNo, setTransactionsLotNo] = useState('');

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedLotForEmail, setSelectedLotForEmail] = useState(null);
  const [emailForm, setEmailForm] = useState({
    recipient_email: '',
    recipient_name: '',
    challan_no: '',
    custom_remarks: '',
    cc_emails: '',
    subject: ''
  });
  const [emailSending, setEmailSending] = useState(false);

  // Fetch Checkpoint Reports and Scan Logs
  const fetchCheckpointReports = async (lotId = activeLotDetail?.id) => {
    if (!lotId) return;
    try {
      const res6 = await apiFetch(`/api/audit/report/${lotId}/6`);
      if (res6.ok) {
        const data6 = await res6.json();
        setCheckpointReport6(data6);
      }
      const res10 = await apiFetch(`/api/audit/report/${lotId}/10`);
      if (res10.ok) {
        const data10 = await res10.json();
        setCheckpointReport10(data10);
      }

      // Populate detailed scan logs
      let allScans = [];
      const scans6Res = await apiFetch(`/api/audit/report/${lotId}/6`);
      if (scans6Res.ok) {
        const d6 = await scans6Res.json();
        allScans = [...allScans, ...(d6.scans || []).map(s => ({ ...s, step: 6 }))];
      }
      const scans10Res = await apiFetch(`/api/audit/report/${lotId}/10`);
      if (scans10Res.ok) {
        const d10 = await scans10Res.json();
        allScans = [...allScans, ...(d10.scans || []).map(s => ({ ...s, step: 10 }))];
      }
      allScans.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setDetailedScanLog(allScans);
    } catch (err) {
      console.error('Failed to fetch checkpoint reports:', err);
    }
  };

  // Auto-refresh reports every 60s when on checkpoints tab
  useEffect(() => {
    let interval = null;
    if (activeLotDetail && lotDetailTab === 'checkpoints') {
      fetchCheckpointReports(activeLotDetail.id);
      interval = setInterval(() => {
        fetchCheckpointReports(activeLotDetail.id);
      }, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeLotDetail, lotDetailTab]);

  const handleAcknowledgeCheckpoint = async (checkpointStep) => {
    if (!activeLotDetail) return;
    try {
      const res = await apiFetch('/api/audit/acknowledge', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: activeLotDetail.id,
          checkpoint_step: checkpointStep
        })
      });
      if (res.ok) {
        showToast(`Checkpoint Step ${checkpointStep} acknowledged successfully!`);
        fetchCheckpointReports(activeLotDetail.id);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to acknowledge checkpoint.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error while acknowledging.', 'danger');
    }
  };

  const handleResolveMissing = async (missingId, action, note) => {
    if (!activeLotDetail) return;
    try {
      const res = await apiFetch('/api/audit/resolve-missing', {
        method: 'POST',
        body: JSON.stringify({
          missing_id: missingId,
          action,
          note
        })
      });
      if (res.ok) {
        showToast(`Discrepancy resolved as ${action}!`);
        fetchCheckpointReports(activeLotDetail.id);
        fetchStock();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to resolve missing PCB.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error while resolving discrepancy.', 'danger');
    }
  };

  // Fetch Stock list with filters
  const fetchStock = async () => {
    try {
      let queryParams = [];
      if (stockSearchQuery) queryParams.push(`search=${encodeURIComponent(stockSearchQuery)}`);
      if (clientFilter) queryParams.push(`client_id=${clientFilter}`);
      if (statusFilter) queryParams.push(`status=${statusFilter}`);
      if (dateStartFilter) queryParams.push(`start_date=${dateStartFilter}`);
      if (dateEndFilter) queryParams.push(`end_date=${dateEndFilter}`);
      
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const res = await apiFetch(`/api/stock${queryString}`);
      if (res.ok) {
        const data = await res.json();
        setStockData(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await apiFetch('/api/stock/clients');
      if (res.ok) {
        const data = await res.json();
        setClientsList(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStock();
    }
  }, [stockSearchQuery, clientFilter, statusFilter, dateStartFilter, dateEndFilter]);

  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, []);

  // Submit Inward Shipment
  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    const qtySent = parseInt(newLot.qty_sent);
    const qtyRecv = parseInt(newLot.qty_received);
    const hasDiscrepancy = qtySent !== qtyRecv;

    if (hasDiscrepancy && !['Superadmin', 'Manager', 'Team Lead'].includes(user.role)) {
      showToast('Team Lead or Manager privilege is required to sign off on discrepancies.', 'danger');
      return;
    }

    if (hasDiscrepancy && !managerSignOff) {
      showToast('You must confirm sign-off for this discrepancy.', 'warning');
      return;
    }

    try {
      const res = await apiFetch('/api/stock/inward', {
        method: 'POST',
        body: JSON.stringify({
          lot_no: parseInt(newLot.lot_no),
          batch_no: newLot.batch_no,
          pixel_pitch: newLot.pixel_pitch,
          client_name: newLot.client_name,
          qty_sent: qtySent,
          qty_received: qtyRecv,
          remarks: newLot.remarks
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Inward Lot ${data.lot_no} recorded successfully!`);
        setShowInwardForm(false);
        setNewLot({
          lot_no: '',
          batch_no: '',
          pixel_pitch: 'P5.9',
          client_name: 'Atomberg',
          qty_sent: '',
          qty_received: '',
          remarks: ''
        });
        setManagerSignOff(false);
        fetchStock();
        fetchClients();
        if (onRefreshLots) onRefreshLots();
      } else {
        showToast(data.error || 'Failed to inward lot', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API', 'danger');
    }
  };

  // Submit Outward Dispatch
  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/stock/outward', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: parseInt(outwardForm.lot_id),
          qty: parseInt(outwardForm.qty),
          remarks: outwardForm.remarks
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Outward dispatch of ${outwardForm.qty} recorded successfully!`);
        setShowOutwardModal(false);
        setOutwardForm({ lot_id: '', qty: '', remarks: '' });
        fetchStock();
      } else {
        showToast(data.error || 'Failed to record outward dispatch', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API', 'danger');
    }
  };

  // Submit Customer Return
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/stock/return', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: parseInt(returnForm.lot_id),
          qty: parseInt(returnForm.qty),
          reason: returnForm.reason,
          remarks: returnForm.remarks
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Return of ${returnForm.qty} recorded successfully!`);
        setShowReturnModal(false);
        setReturnForm({ lot_id: '', qty: '', reason: 'Solder Defect', remarks: '' });
        fetchStock();
      } else {
        showToast(data.error || 'Failed to record return', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API', 'danger');
    }
  };

  // Submit Redispatch
  const handleRedispatchSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/stock/redispatch', {
        method: 'POST',
        body: JSON.stringify({
          lot_id: parseInt(redispatchForm.lot_id),
          qty: parseInt(redispatchForm.qty),
          remarks: redispatchForm.remarks
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Redispatch of ${redispatchForm.qty} recorded successfully!`);
        setShowRedispatchModal(false);
        setRedispatchForm({ lot_id: '', qty: '', remarks: '' });
        fetchStock();
      } else {
        showToast(data.error || 'Failed to record redispatch', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API', 'danger');
    }
  };

  // View Audit Trail Transactions
  const handleViewLotTransactions = async (lotId, lotNo) => {
    try {
      const res = await apiFetch(`/api/stock/transactions/${lotId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedLotTransactions(data);
        setTransactionsLotNo(lotNo);
        setShowTransactionsModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle status Complete
  const handleToggleLotStatus = async (lotId) => {
    try {
      const res = await apiFetch(`/api/stock/toggle/${lotId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Lot status toggled successfully!');
        fetchStock();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to toggle status.', 'danger');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Email discrepancy
  const handleOpenEmailModal = (lot, shortage) => {
    const isAtomberg = lot.client_name === 'Atomberg';
    const isBajaj = lot.client_name === 'Bajaj';
    
    const recipientName = isAtomberg ? 'Rohit ji' : (isBajaj ? 'Bajaj Spares Manager' : 'John Doe');
    const recipientEmail = isAtomberg ? 'info@atomberg.com' : (isBajaj ? 'spares@bajaj.com' : 'contact@xtrememedia.co');
    const ccEmails = isAtomberg ? 'cwh.mumbai.spare@atomberg.com, chetan.joshi@atomberg.com' : (isBajaj ? 'cc.spares@bajaj.com' : 'cc.support@xtrememedia.co');
    const subject = `[Discrepancy Report] ${lot.client_name} Lot ${lot.lot_no} - ${shortage > 0 ? 'Shortage' : 'Excess'} Alert`;
    const challanNo = lot.batch_no || `CH-${lot.lot_no}`;
    const customRemarks = isAtomberg 
      ? 'Kindly suggest the way forward and would like to invite @CC CWH Mumbai Spare and @Chetan Joshi Sir to visit our facility and cross verify the quantities.'
      : 'Please let us know if any further information is required from our side';

    setSelectedLotForEmail(lot);
    setEmailForm({
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      challan_no: challanNo,
      custom_remarks: customRemarks,
      cc_emails: ccEmails,
      subject: subject
    });
    setShowEmailModal(true);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!selectedLotForEmail) return;
    setEmailSending(true);

    try {
      const res = await apiFetch('/api/admin/email/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lot_id: selectedLotForEmail.id,
          recipient_email: emailForm.recipient_email,
          recipient_name: emailForm.recipient_name,
          challan_no: emailForm.challan_no,
          qty_sent: selectedLotForEmail.qty_sent,
          received_qty: selectedLotForEmail.received_qty,
          cc_emails: emailForm.cc_emails,
          subject: emailForm.subject,
          custom_remarks: emailForm.custom_remarks
        })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'Discrepancy email simulated successfully!');
        setShowEmailModal(false);
        setSelectedLotForEmail(null);
        fetchStock();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to dispatch email.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('An error occurred while sending email.', 'danger');
    } finally {
      setEmailSending(false);
    }
  };

  // CSV Exporters
  const downloadCSV = (filename, headers, rows) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSingleLot = (lotNo, panels) => {
    const headers = ["Serial Number", "PCB Record ID", "Side", "Status", "Current Step", "Assigned Operator"];
    const STEP_NAMES = [
      "Inward", "Segregation", "Programming", "1st Testing", "Debug", "Entry",
      "Cleaning", "QC After Cleaning", "Marking & Coating", "Final Testing", "Final Entry", "Packing"
    ];
    const rows = panels.map(p => [p.sr_no, p.id, p.side, p.status, STEP_NAMES[p.current_step - 1], p.engineer_name || 'Unassigned']);
    downloadCSV(`ES_Lot_${lotNo}_Report.csv`, headers, rows);
    showToast(`Report downloaded for Lot ${lotNo}!`);
  };

  const filteredStock = Array.isArray(stockData)
    ? stockData.filter(l => {
        const matchesLot = selectedLotNo ? l.lot_no === parseInt(selectedLotNo) : true;
        const matchesCompany = selectedCompany ? l.client_name && l.client_name.toLowerCase().includes(selectedCompany.toLowerCase()) : true;
        return matchesLot && matchesCompany;
      })
    : [];

  const exportAllLots = () => {
    const headers = ["Lot Number", "Batch Code", "Pixel Pitch", "Client", "Sent Quantity", "Received Quantity", "Dispatched", "Scrap", "Available", "Status"];
    const rows = filteredStock.map(l => [l.lot_no, l.batch_no, l.pixel_pitch, l.client_name, l.qty_sent, l.received_qty, l.dispatched_qty, l.return_qty, l.available, l.status]);
    downloadCSV(`ES_Cumulative_Lots_Report.csv`, headers, rows);
    showToast("Cumulative lots summary downloaded!");
  };

  // Pagination limits
  const indexOfLastLot = currentStockPage * lotsPerPage;
  const indexOfFirstLot = indexOfLastLot - lotsPerPage;
  const paginatedLots = filteredStock.slice(indexOfFirstLot, indexOfLastLot);
  const totalStockPages = Math.ceil(filteredStock.length / lotsPerPage);

  const TransactionHistoryInline = ({ lotId }) => {
    const [transLogs, setTransLogs] = useState([]);
    useEffect(() => {
      const loadTrans = async () => {
        try {
          const res = await apiFetch(`/api/stock/transactions/${lotId}`);
          if (res.ok) {
            const data = await res.json();
            setTransLogs(data);
          }
        } catch (err) {
          console.error(err);
        }
      };
      loadTrans();
    }, [lotId, stockData]);

    if (transLogs.length === 0) {
      return (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: 12 }}>
          No ledger transaction logs recorded for this lot yet.
        </p>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', paddingLeft: 12, borderLeft: '2px solid rgba(255,255,255,0.05)', marginLeft: 8 }}>
        {transLogs.map(trans => {
          const isCompletionAuto = trans.remarks && trans.remarks.includes('auto-completed');
          const pillColor = trans.transaction_type === 'Inward' ? 'var(--color-primary)' : trans.transaction_type === 'Outward' ? '#10b981' : trans.transaction_type === 'Return' ? '#ef4444' : trans.transaction_type === 'Redispatch' ? '#3b82f6' : '#8b5cf6';
          return (
            <div key={trans.id} style={{ position: 'relative', fontSize: '0.75rem' }}>
              <span style={{ 
                position: 'absolute', 
                left: -20, 
                top: 4, 
                width: 10, 
                height: 10, 
                borderRadius: '50%', 
                background: pillColor,
                boxShadow: `0 0 8px ${pillColor}`
              }}></span>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <strong style={{ color: pillColor }}>
                  {trans.transaction_type} {trans.qty > 0 && `(Qty: ${trans.qty})`}
                </strong>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  {new Date(trans.created_at).toLocaleString()}
                </span>
              </div>
              <p style={{ margin: '2px 0', color: '#cbd5e1', fontStyle: isCompletionAuto ? 'italic' : 'normal' }}>
                {trans.remarks}
              </p>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                Actioned By: {trans.actor_name || 'System / Auto'}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTimeline = (timeline) => {
    if (!timeline || timeline.length === 0) {
      return (
        <div style={{ padding: 10, fontStyle: 'italic', color: 'var(--text-muted)' }}>
          No historical steps logged for this PCB.
        </div>
      );
    }
    return (
      <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.01)', borderLeft: '2px solid rgba(255,255,255,0.05)', marginLeft: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {timeline.map((step, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                marginTop: 4,
                boxShadow: '0 0 6px var(--color-primary)'
              }}></div>
              <div>
                <strong style={{ fontSize: '0.78rem', color: '#fff' }}>Step {step.step_no}: {step.step_name}</strong>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Logged by: <strong>{step.logged_by}</strong> • {new Date(step.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }}></div>
            <span style={{ fontSize: '0.72rem', color: '#fca5a5', fontWeight: 'bold' }}>Trail Ends Here</span>
          </div>
        </div>
      </div>
    );
  };

  const renderStepDropChart = (mismatch) => {
    const items = mismatch.steps_breakdown;
    return (
      <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: 10 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase' }}>
          Visual Step-by-Step Quantity Drop Tracing:
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {items.map((sb, idx) => {
            const nextItem = items[idx + 1];
            const drop = nextItem ? sb.count - nextItem.count : 0;
            return (
              <React.Fragment key={idx}>
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 8,
                  textAlign: 'center',
                  minWidth: 100
                }}>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Step {sb.step_no}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: 2 }}>{sb.count} units</div>
                  <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 90 }} title={sb.logged_by}>
                    {sb.logged_by.split(' ')[0]}
                  </div>
                </div>
                {nextItem && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: drop > 0 ? '#ef4444' : '#10b981' }}>
                      {drop > 0 ? `↓ -${drop}` : `→ 0`}
                    </div>
                    <div style={{ width: 24, height: 1, background: 'var(--card-border)' }}></div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: (items[items.length - 1]?.count - mismatch.scanned) > 0 ? '#ef4444' : '#10b981' }}>
              {items[items.length - 1]?.count - mismatch.scanned > 0 ? `↓ -${items[items.length - 1].count - mismatch.scanned}` : `→ 0`}
            </div>
            <div style={{ width: 24, height: 1, background: 'var(--card-border)' }}></div>
          </div>
          <div style={{
            padding: '8px 12px',
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 8,
            textAlign: 'center',
            minWidth: 100
          }}>
            <div style={{ fontSize: '0.58rem', color: '#10b981', fontWeight: 700 }}>Scanned</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981', marginTop: 2 }}>{mismatch.scanned} units</div>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 4 }}>Checkpoint</div>
          </div>
        </div>
      </div>
    );
  };

  const ScannerActivityTable = ({ report }) => {
    if (!report.scanner_activity || report.scanner_activity.length === 0) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          No scanner activity recorded.
        </div>
      );
    }
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 10px' }}>Scanner Name</th>
            <th style={{ padding: '8px 10px' }}>PCBs Scanned</th>
            <th style={{ padding: '8px 10px' }}>Time Started</th>
            <th style={{ padding: '8px 10px' }}>Time Completed</th>
            <th style={{ padding: '8px 10px' }}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {report.scanner_activity.map((a, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)', color: '#fff' }}>
              <td style={{ padding: 10, fontWeight: 700 }}>{a.scanner_name}</td>
              <td style={{ padding: 10, color: 'var(--color-primary)' }}>{a.pcbs_scanned} units</td>
              <td style={{ padding: 10 }}>{a.time_started ? new Date(a.time_started).toLocaleTimeString() : 'N/A'}</td>
              <td style={{ padding: 10 }}>{a.time_completed ? new Date(a.time_completed).toLocaleTimeString() : 'N/A'}</td>
              <td style={{ padding: 10, color: '#60a5fa', fontWeight: 700 }}>{a.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const UnknownScansTable = ({ report }) => {
    const filtered = (report.unknown_scans || []).filter(u => {
      if (missingFilterType !== 'all') return false;
      if (missingSearchQuery) {
        const q = missingSearchQuery.toLowerCase();
        return String(u.scanned_value || '').toLowerCase().includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          No unknown scans logged at this checkpoint.
        </div>
      );
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 10px' }}>Scanned Value</th>
            <th style={{ padding: '8px 10px' }}>Scanned By</th>
            <th style={{ padding: '8px 10px' }}>Timestamp</th>
            <th style={{ padding: '8px 10px' }}>Possible Similarity Match</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)', color: '#fff' }}>
              <td style={{ padding: 10, fontFamily: 'monospace', color: '#ef4444' }}>{u.scanned_value}</td>
              <td style={{ padding: 10 }}>{u.scanner_name}</td>
              <td style={{ padding: 10 }}>{new Date(u.timestamp).toLocaleString()}</td>
              <td style={{ padding: 10, color: '#f59e0b', fontWeight: 600 }}>{u.possible_match}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const CountMismatchTable = ({ report }) => {
    const filtered = (report.mismatches || []).filter(m => {
      if (missingFilterPartCode && !String(m.part_code || '').toLowerCase().includes(missingFilterPartCode.toLowerCase())) return false;
      return true;
    });

    if (filtered.length === 0) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          No part code count mismatches logged matching filter.
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px 10px' }}>Part Code</th>
              <th style={{ padding: '8px 10px' }}>Step where count first dropped</th>
              <th style={{ padding: '8px 10px' }}>Who logged at that step</th>
              <th style={{ padding: '8px 10px' }}>Count at that step</th>
              <th style={{ padding: '8px 10px' }}>Count at checkpoint</th>
              <th style={{ padding: '8px 10px' }}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, idx) => {
              const dropStep = m.steps_breakdown.find(s => s.step_name === m.first_step_dropped);
              const loggedBy = dropStep ? dropStep.logged_by : 'N/A';
              const loggedCount = dropStep ? dropStep.count : 'N/A';

              return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)', color: '#fff' }}>
                  <td style={{ padding: 10, fontWeight: 700, color: 'var(--color-primary)' }}>{m.part_code}</td>
                  <td style={{ padding: 10, color: '#f59e0b', fontWeight: 600 }}>{m.first_step_dropped}</td>
                  <td style={{ padding: 10 }}>{loggedBy}</td>
                  <td style={{ padding: 10 }}>{loggedCount} units</td>
                  <td style={{ padding: 10 }}>{m.scanned} units</td>
                  <td style={{ padding: 10, color: '#ef4444', fontWeight: 700 }}>
                    ↓ -{m.delta}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.map((m, idx) => (
          <div key={idx}>
            <strong style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}>{m.part_code} Quantity Drop Flow Chart:</strong>
            {renderStepDropChart(m)}
          </div>
        ))}
      </div>
    );
  };

  const MissingTable = ({ report, step }) => {
    const filtered = (report.missing || []).filter(m => {
      if (missingFilterType !== 'all' && m.missing_type !== missingFilterType) return false;
      if (missingFilterPartCode && !String(m.part_code || '').toLowerCase().includes(missingFilterPartCode.toLowerCase())) return false;
      if (missingFilterEmployee && !String(m.last_logged_by_name || '').toLowerCase().includes(missingFilterEmployee.toLowerCase())) return false;
      if (missingSearchQuery) {
        const q = missingSearchQuery.toLowerCase();
        return (
          String(m.pcb_sr_no || '').toLowerCase().includes(q) ||
          String(m.barcode || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (filtered.length === 0) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          No missing PCBs match the active filters.
        </div>
      );
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 10px' }}>PCB Sr No</th>
            <th style={{ padding: '8px 10px' }}>Actual Serial No</th>
            <th style={{ padding: '8px 10px' }}>Part Code</th>
            <th style={{ padding: '8px 10px' }}>Last Step</th>
            <th style={{ padding: '8px 10px' }}>Last Logged By</th>
            <th style={{ padding: '8px 10px' }}>Last Logged At</th>
            <th style={{ padding: '8px 10px' }}>Missing Type</th>
            <th style={{ padding: '8px 10px' }}>Resolution Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(m => {
            const isNeverTouched = m.missing_type === 'Never touched';
            const badgeBg = isNeverTouched ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)';
            const badgeColor = isNeverTouched ? '#f87171' : '#fbbf24';
            const isExpanded = timelineExpandedRowId === `${step}_${m.panel_id}`;
            const isResolved = !!m.resolution_action;

            return (
              <React.Fragment key={m.id}>
                <tr 
                  onClick={() => setTimelineExpandedRowId(isExpanded ? null : `${step}_${m.panel_id}`)}
                  style={{
                    borderBottom: '1px solid var(--card-border)',
                    background: isExpanded ? 'rgba(255,255,255,0.01)' : 'transparent',
                    cursor: 'pointer',
                    color: isResolved ? '#10b981' : '#fff'
                  }}
                  title="Click to view history timeline trace"
                >
                  <td style={{ padding: 10, fontWeight: 700 }}>{m.pcb_sr_no || '-'}</td>
                  <td style={{ padding: 10, fontFamily: 'monospace' }}>{m.barcode || '-'}</td>
                  <td style={{ padding: 10 }}>{m.part_code || '-'}</td>
                  <td style={{ padding: 10 }}>{m.last_step_name || 'N/A'}</td>
                  <td style={{ padding: 10 }}>{m.last_logged_by_name || 'N/A'}</td>
                  <td style={{ padding: 10 }}>{m.last_logged_at ? new Date(m.last_logged_at).toLocaleString() : 'N/A'}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{ background: badgeBg, color: badgeColor, padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: '0.6rem' }}>
                      {m.missing_type}
                    </span>
                  </td>
                  <td style={{ padding: 10 }} onClick={e => e.stopPropagation()}>
                    {isResolved ? (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        ✓ {m.resolution_action} ({m.resolution_note || 'Lost'})
                      </span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          value={resolvingMissingId === m.id ? resolvingAction : ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val) {
                              setResolvingMissingId(m.id);
                              setResolvingAction(val);
                              setResolvingLocationNote('');
                              setResolvingTargetLotId('');
                            } else {
                              setResolvingMissingId(null);
                            }
                          }}
                          style={{ padding: '2px 6px', fontSize: '0.68rem', width: 'auto', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 4 }}
                        >
                          <option value="">-- Take Action --</option>
                          <option value="Found">Found - log location</option>
                          <option value="Lost">Confirmed lost</option>
                          <option value="Reassigned">Reassigned to another lot</option>
                        </select>

                        {resolvingMissingId === m.id && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(0,0,0,0.1)', padding: 4, borderRadius: 6 }}>
                            {resolvingAction === 'Found' && (
                              <input
                                type="text"
                                placeholder="Location..."
                                value={resolvingLocationNote}
                                onChange={e => setResolvingLocationNote(e.target.value)}
                                style={{ padding: '2px 6px', fontSize: '0.68rem', width: 100 }}
                              />
                            )}

                            {resolvingAction === 'Reassigned' && (
                              <select
                                value={resolvingTargetLotId}
                                onChange={e => setResolvingTargetLotId(e.target.value)}
                                style={{ padding: '2px 4px', fontSize: '0.68rem', width: 'auto' }}
                              >
                                <option value="">-- Select Lot --</option>
                                {stockData
                                  .filter(l => l.id !== activeLotDetail.id && l.status === 'Active')
                                  .map(l => (
                                    <option key={l.id} value={l.id}>Lot {l.lot_no}</option>
                                  ))
                                }
                              </select>
                            )}

                            <button
                              onClick={() => {
                                const note = resolvingAction === 'Found' 
                                  ? resolvingLocationNote 
                                  : (resolvingAction === 'Reassigned' ? resolvingTargetLotId : '');
                                handleResolveMissing(m.id, resolvingAction, note);
                                setResolvingMissingId(null);
                              }}
                              className="btn btn-primary"
                              style={{ width: 'auto', margin: 0, padding: '2px 6px', fontSize: '0.62rem' }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setResolvingMissingId(null)}
                              className="btn btn-secondary"
                              style={{ width: 'auto', margin: 0, padding: '2px 6px', fontSize: '0.62rem' }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={8} style={{ padding: 12, background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>LIVE TIMELINE HISTORICAL AUDIT TRAIL:</div>
                      {renderTimeline(m.timeline)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  const CheckpointReportCard = ({ step, report, status, expanded, setExpanded, lot }) => {
    const [missingOpen, setMissingOpen] = useState(true);
    const [mismatchOpen, setMismatchOpen] = useState(true);
    const [unknownOpen, setUnknownOpen] = useState(true);
    const [scannerOpen, setScannerOpen] = useState(true);

    const getStatusTextAndBadge = () => {
      if (status === 'pending') return { text: 'Pending Scanning', badge: 'badge-secondary' };
      if (status === 'red') return { text: 'Discrepancies Unresolved', badge: 'badge-danger' };
      if (status === 'amber') return { text: 'Partially Resolved', badge: 'badge-warning' };
      return { text: 'Discrepancies Resolved', badge: 'badge-success' };
    };

    const statusObj = getStatusTextAndBadge();
    const expectedDate = new Date(new Date(lot.created_at).getTime() + (step === 6 ? 2 : 4) * 24 * 60 * 60 * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    return (
      <div className="glass-panel" style={{ padding: 18, marginBottom: 20, borderLeft: `4px solid ${status === 'green' ? '#10b981' : (status === 'amber' ? '#f59e0b' : (status === 'red' ? '#ef4444' : '#64748b'))}` }}>
        <div 
          onClick={() => setExpanded(!expanded)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        >
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#fff' }}>
              Step {step} Checkpoint: {step === 6 ? 'Mid-point Audit Checkpoint' : 'Post-repair Final Checkpoint'}
            </h3>
            {!report?.results && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Pipeline Expected Date: <strong>{expectedDate}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`badge ${statusObj.badge}`}>{statusObj.text}</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        {expanded && (
          <div style={{ marginTop: 20 }}>
            {!report || !report.results ? (
              <div style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--card-border)', borderRadius: 12, background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: 8 }}>⏳</span>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Audit Checkpoint Not Yet Completed</strong>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  This checkpoint will become available once the worker completes the physical scanning process on the shop floor.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                  <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Total In Scope</span>
                    <strong style={{ fontSize: '1.05rem', color: '#fff' }}>{report.results.total_in_scope}</strong>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.58rem', color: '#10b981', textTransform: 'uppercase', display: 'block' }}>Scanned</span>
                    <strong style={{ fontSize: '1.05rem', color: '#10b981' }}>{report.results.total_scanned} ✓</strong>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.58rem', color: '#ef4444', textTransform: 'uppercase', display: 'block' }}>Missing</span>
                    <strong style={{ fontSize: '1.05rem', color: '#f87171' }}>{report.results.total_missing} ⚠</strong>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.58rem', color: '#a78bfa', textTransform: 'uppercase', display: 'block' }}>Never Touched</span>
                    <strong style={{ fontSize: '1.05rem', color: '#c084fc' }}>{report.results.total_never_touched} 🔴</strong>
                  </div>
                </div>

                {(() => {
                  const rate = report.results.total_in_scope > 0 
                    ? Math.round((report.results.total_scanned / report.results.total_in_scope) * 100)
                    : 0;
                  return (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        <span>Checkpoint Completion Rate:</span>
                        <strong style={{ color: 'var(--color-primary)' }}>{rate}% scanned</strong>
                      </div>
                      <div style={{ height: 6, background: '#ef4444', borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
                        <div style={{ width: `${rate}%`, height: '100%', background: '#10b981' }}></div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ marginBottom: 16 }}>
                  <div 
                    onClick={() => setMissingOpen(!missingOpen)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.15)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ fontSize: '0.8rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6 }}>
                      🔴 SECTION 1: Missing PCBs ({report.missing?.length || 0} entries)
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>{missingOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
                  </div>

                  {missingOpen && (
                    <div style={{ padding: '10px 4px', border: '1px solid var(--card-border)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                      <MissingTable report={report} step={step} />
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div 
                    onClick={() => setMismatchOpen(!mismatchOpen)}
                    style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.15)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ fontSize: '0.8rem', color: '#fde047', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ⚠️ SECTION 2: Part Code Count Mismatch ({report.mismatches?.length || 0} entries)
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: '#fde047' }}>{mismatchOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
                  </div>

                  {mismatchOpen && (
                    <div style={{ padding: '10px 4px', border: '1px solid var(--card-border)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                      <CountMismatchTable report={report} />
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div 
                    onClick={() => setUnknownOpen(!unknownOpen)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--card-border)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ❓ SECTION 3: Unknown Scans ({report.unknown_scans?.length || 0} entries)
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{unknownOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
                  </div>

                  {unknownOpen && (
                    <div style={{ padding: '10px 4px', border: '1px solid var(--card-border)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                      <UnknownScansTable report={report} />
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div 
                    onClick={() => setScannerOpen(!scannerOpen)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--card-border)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                      📋 SECTION 4: Scanner Activity ({report.scanner_activity?.length || 0} operators)
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{scannerOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
                  </div>

                  {scannerOpen && (
                    <div style={{ padding: '10px 4px', border: '1px solid var(--card-border)', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                      <ScannerActivityTable report={report} />
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const [checkpoint6Expanded, setCheckpoint6Expanded] = useState(true);
  const [checkpoint10Expanded, setCheckpoint10Expanded] = useState(true);

  const renderLotDetailView = () => {
    if (!activeLotDetail) return null;

    const unresolvedCount6 = checkpointReport6?.missing?.filter(m => !m.resolution_action)?.length || 0;
    const unresolvedCount10 = checkpointReport10?.missing?.filter(m => !m.resolution_action)?.length || 0;

    const ack6 = checkpointReport6?.acknowledgement?.acknowledged;
    const ack10 = checkpointReport10?.acknowledgement?.acknowledged;

    const getCardStatus = (report) => {
      if (!report || !report.results) return 'pending';
      const missing = report.results.total_missing;
      if (missing === 0) return 'green';
      const unresolved = report.missing?.filter(m => !m.resolution_action)?.length || 0;
      if (unresolved === 0) return 'green';
      if (unresolved < missing) return 'amber';
      return 'red';
    };

    const status6 = getCardStatus(checkpointReport6);
    const status10 = getCardStatus(checkpointReport10);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => {
                setActiveLotDetail(null);
                setCheckpointReport6(null);
                setCheckpointReport10(null);
                setDetailedScanLog([]);
              }}
              className="btn btn-secondary"
              style={{ width: 'auto', margin: 0, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
            >
              ← Back to Lots
            </button>
            <div>
              <span className="app-subtitle" style={{ fontSize: '0.65rem' }}>Active Factory Scope</span>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                Lot {activeLotDetail.lot_no} Details
                <span className={`badge ${activeLotDetail.status === 'Complete' ? 'badge-success' : 'badge-warning'}`}>
                  {activeLotDetail.status}
                </span>
              </h2>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span>Client: <strong>{activeLotDetail.client_name}</strong></span>
            <span>•</span>
            <span>Batch: <strong>{activeLotDetail.batch_no}</strong></span>
          </div>
        </div>

        {unresolvedCount6 > 0 && !ack6 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 8,
            marginBottom: 16,
            color: '#fca5a5',
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={16} color="#ef4444" />
              Step 6 checkpoint: {unresolvedCount6} PCBs missing — last updated {checkpointReport6.results?.computed_at ? new Date(checkpointReport6.results.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'}
            </span>
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                onClick={() => setLotDetailTab('checkpoints')}
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, fontWeight: 'bold', textDecoration: 'underline' }}
              >
                [View Details]
              </button>
              <button
                onClick={() => handleAcknowledgeCheckpoint(6)}
                style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0, fontWeight: 'bold', textDecoration: 'underline' }}
              >
                [Acknowledge Alert]
              </button>
            </div>
          </div>
        )}

        {unresolvedCount10 > 0 && !ack10 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 8,
            marginBottom: 16,
            color: '#fca5a5',
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={16} color="#ef4444" />
              Step 10 checkpoint: {unresolvedCount10} PCBs missing — last updated {checkpointReport10.results?.computed_at ? new Date(checkpointReport10.results.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'}
            </span>
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                onClick={() => setLotDetailTab('checkpoints')}
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, fontWeight: 'bold', textDecoration: 'underline' }}
              >
                [View Details]
              </button>
              <button
                onClick={() => handleAcknowledgeCheckpoint(10)}
                style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0, fontWeight: 'bold', textDecoration: 'underline' }}
              >
                [Acknowledge Alert]
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--card-border)', marginBottom: 20 }}>
          <button
            onClick={() => setLotDetailTab('stock')}
            style={{
              padding: '10px 16px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: lotDetailTab === 'stock' ? '2px solid var(--color-primary)' : 'none',
              color: lotDetailTab === 'stock' ? 'var(--color-primary)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Stock
          </button>
          <button
            onClick={() => setLotDetailTab('scan_log')}
            style={{
              padding: '10px 16px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: lotDetailTab === 'scan_log' ? '2px solid var(--color-primary)' : 'none',
              color: lotDetailTab === 'scan_log' ? 'var(--color-primary)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Scan Log ({detailedScanLog.length})
          </button>
          {user?.role === 'Team Lead' && (
            <button
              onClick={() => setLotDetailTab('checkpoints')}
              style={{
                padding: '10px 16px',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: 'transparent',
                border: 'none',
                borderBottom: lotDetailTab === 'checkpoints' ? '2px solid var(--color-primary)' : 'none',
                color: lotDetailTab === 'checkpoints' ? 'var(--color-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              Checkpoints {(unresolvedCount6 > 0 || unresolvedCount10 > 0) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }}></span>}
            </button>
          )}
        </div>

        {lotDetailTab === 'stock' && (
          <div>
            <div className="lot-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, fontSize: '0.75rem', textAlign: 'center', background: 'var(--card-bg)', padding: 18, borderRadius: 12, border: '1px solid var(--card-border)', marginBottom: 20 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', fontWeight: 700 }}>Inward Qty</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#fff', marginTop: 4 }}>{activeLotDetail.received_qty}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', fontWeight: 700 }}>Outward Qty</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#10b981', marginTop: 4 }}>{activeLotDetail.dispatched_qty}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', fontWeight: 700 }}>Returned Qty</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#ef4444', marginTop: 4 }}>{activeLotDetail.return_qty}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', fontWeight: 700 }}>Redispatched Qty</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#60a5fa', marginTop: 4 }}>{activeLotDetail.redispatch_qty}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', fontWeight: 700 }}>Available Qty</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--color-primary)', marginTop: 4 }}>{activeLotDetail.available}</div>
              </div>
            </div>

            {user?.role === 'Team Lead' && (
              <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12 }}>Stock Refurbishment Quick Transactions</h4>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button 
                    disabled={activeLotDetail.status === 'Complete'}
                    onClick={() => {
                      setOutwardForm({ lot_id: activeLotDetail.id, qty: '', remarks: '' });
                      setShowOutwardModal(true);
                    }}
                    className="btn btn-success"
                    style={{ flex: 1, margin: 0, padding: '10px 14px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--card-border)', color: '#10b981', fontWeight: 700 }}
                  >
                    Dispatch Out
                  </button>
                  <button 
                    disabled={activeLotDetail.status === 'Complete'}
                    onClick={() => {
                      setReturnForm({ lot_id: activeLotDetail.id, qty: '', reason: 'Solder Defect', remarks: '' });
                      setShowReturnModal(true);
                    }}
                    className="btn btn-danger"
                    style={{ flex: 1, margin: 0, padding: '10px 14px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--card-border)', color: '#ef4444', fontWeight: 700 }}
                  >
                    Log Return
                  </button>
                  <button 
                    disabled={activeLotDetail.status === 'Complete'}
                    onClick={() => {
                      setRedispatchForm({ lot_id: activeLotDetail.id, qty: '', remarks: '' });
                      setShowRedispatchModal(true);
                    }}
                    className="btn btn-primary"
                    style={{ flex: 1, margin: 0, padding: '10px 14px', fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--card-border)', color: '#3b82f6', fontWeight: 700 }}
                  >
                    Redispatch
                  </button>
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ padding: 20 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', borderBottom: '1px solid var(--card-border)', paddingBottom: 10, marginBottom: 16 }}>
                Ledger Transaction History Feed
              </h4>
              <TransactionHistoryInline lotId={activeLotDetail.id} />
            </div>
          </div>
        )}

        {lotDetailTab === 'scan_log' && (
          <div className="glass-panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', margin: 0 }}>Physical Checkpoint Scans Logs</h4>
              <input
                type="text"
                placeholder="Search scans by barcode or scanner..."
                value={detailScanSearch}
                onChange={e => { setDetailScanSearch(e.target.value); setDetailScansPage(1); }}
                style={{ width: 'auto', minWidth: 260, padding: '6px 12px', fontSize: '0.78rem' }}
              />
            </div>

            {(() => {
              const filtered = detailedScanLog.filter(s => {
                const search = detailScanSearch.toLowerCase();
                return (
                  String(s.scanned_value || '').toLowerCase().includes(search) ||
                  String(s.scanner_name || '').toLowerCase().includes(search) ||
                  String(s.pcb_sr_no || '').toLowerCase().includes(search)
                );
              });

              const limit = 8;
              const pages = Math.ceil(filtered.length / limit);
              const paginated = filtered.slice((detailScansPage - 1) * limit, detailScansPage * limit);

              if (filtered.length === 0) {
                return (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No checkpoint scans logged matching search query.
                  </div>
                );
              }

              return (
                <div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: 10 }}>Scanned Value</th>
                        <th style={{ padding: 10 }}>PCB Sr No (Matched)</th>
                        <th style={{ padding: 10 }}>Scan Mode</th>
                        <th style={{ padding: 10 }}>Checkpoint</th>
                        <th style={{ padding: 10 }}>Scanned By</th>
                        <th style={{ padding: 10 }}>Timestamp</th>
                        <th style={{ padding: 10 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((s, idx) => (
                        <tr key={s.id || idx} style={{ borderBottom: '1px solid var(--card-border)', color: '#fff' }}>
                          <td style={{ padding: 10, fontFamily: 'monospace' }}>{s.scanned_value}</td>
                          <td style={{ padding: 10 }}>{s.pcb_sr_no || '-'}</td>
                          <td style={{ padding: 10, textTransform: 'capitalize' }}>{s.matched_by || 'none'}</td>
                          <td style={{ padding: 10, fontWeight: 700 }}>Step {s.step}</td>
                          <td style={{ padding: 10 }}>{s.scanner_name}</td>
                          <td style={{ padding: 10 }}>{new Date(s.timestamp).toLocaleString()}</td>
                          <td style={{ padding: 10 }}>
                            <span className={`badge ${s.is_unknown ? 'badge-danger' : 'badge-success'}`}>
                              {s.is_unknown ? 'Unknown Scan' : 'Matched'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <button
                        onClick={() => setDetailScansPage(p => Math.max(p - 1, 1))}
                        disabled={detailScansPage === 1}
                        className="btn btn-secondary"
                        style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.7rem' }}
                      >
                        Prev
                      </button>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Page {detailScansPage} of {pages}</span>
                      <button
                        onClick={() => setDetailScansPage(p => Math.min(p + 1, pages))}
                        disabled={detailScansPage === pages}
                        className="btn btn-secondary"
                        style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.7rem' }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {lotDetailTab === 'checkpoints' && user?.role === 'Team Lead' && (
          <div>
            <div className="glass-panel" style={{ padding: 14, marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginRight: 6 }}>Dashboard Filters:</div>
              
              <select
                value={selectedCheckpointFilter}
                onChange={e => setSelectedCheckpointFilter(e.target.value)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem' }}
              >
                <option value="all">Both Checkpoints</option>
                <option value="6">Step 6 Checkpoint Only</option>
                <option value="10">Step 10 Checkpoint Only</option>
              </select>

              <select
                value={missingFilterType}
                onChange={e => setMissingFilterType(e.target.value)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem' }}
              >
                <option value="all">All Missing Types</option>
                <option value="Not scanned at checkpoint">Not Scanned at Checkpoint</option>
                <option value="Never touched">Never Touched</option>
              </select>

              <input
                type="text"
                placeholder="Filter by part code..."
                value={missingFilterPartCode}
                onChange={e => setMissingFilterPartCode(e.target.value)}
                style={{ width: 'auto', minWidth: 150, padding: '6px 12px', fontSize: '0.75rem' }}
              />

              <input
                type="text"
                placeholder="Filter by operator..."
                value={missingFilterEmployee}
                onChange={e => setMissingFilterEmployee(e.target.value)}
                style={{ width: 'auto', minWidth: 150, padding: '6px 12px', fontSize: '0.75rem' }}
              />

              <input
                type="text"
                placeholder="Search PCB Sr No/barcode..."
                value={missingSearchQuery}
                onChange={e => setMissingSearchQuery(e.target.value)}
                style={{ width: 'auto', minWidth: 200, padding: '6px 12px', fontSize: '0.75rem' }}
              />
            </div>

            {(selectedCheckpointFilter === 'all' || selectedCheckpointFilter === '6') && (
              <CheckpointReportCard
                step={6}
                report={checkpointReport6}
                status={status6}
                expanded={checkpoint6Expanded}
                setExpanded={setCheckpoint6Expanded}
                lot={activeLotDetail}
              />
            )}

            {(selectedCheckpointFilter === 'all' || selectedCheckpointFilter === '10') && (
              <CheckpointReportCard
                step={10}
                report={checkpointReport10}
                status={status10}
                expanded={checkpoint10Expanded}
                setExpanded={setCheckpoint10Expanded}
                lot={activeLotDetail}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {activeLotDetail ? (
        renderLotDetailView()
      ) : (
        <>
          <div className="app-header">
            <div>
              <span className="app-subtitle">Inventory Management</span>
              <h1 className="app-title"><Package size={20} color='var(--color-primary)' /> Stock Summary</h1>
            </div>
            
            {/* Header Action Grid */}
            <div style={{ display: 'flex', gap: 8 }}>
              {user?.role === 'Team Lead' && (
                <button 
                  onClick={exportAllLots} 
                  className="badge badge-info"
                  style={{ cursor: 'pointer', background: '#38bdf8', color: '#000', border: 'none', padding: '6px 12px' }}
                >
                  <Download size={12} /> Export All
                </button>
              )}
              {user?.role === 'Team Lead' && (
                <button 
                  onClick={() => setShowInwardForm(!showInwardForm)} 
                  className="badge badge-success"
                  style={{ cursor: 'pointer', background: 'var(--color-primary)', color: '#000', border: 'none', padding: '6px 12px' }}
                >
                  <Plus size={12} /> Inward Lot
                </button>
              )}
            </div>
          </div>

          {/* KPI cards */}
          <div className="metrics-grid" style={{ marginBottom: 20 }}>
            <div className="metric-card glass-panel blue">
              <span className="metric-label">Total Lots</span>
              <h3 className="metric-val">{filteredStock.length}</h3>
            </div>
            <div className="metric-card glass-panel">
              <span className="metric-label">Total Received</span>
              <h3 className="metric-val">{filteredStock.reduce((sum, l) => sum + l.received_qty, 0)}</h3>
            </div>
            <div className="metric-card glass-panel success">
              <span className="metric-label">Dispatched OK</span>
              <h3 className="metric-val">{filteredStock.reduce((sum, l) => sum + l.dispatched_qty, 0)}</h3>
            </div>
            <div className="metric-card glass-panel warning">
              <span className="metric-label">Total Available</span>
              <h3 className="metric-val" style={{ color: '#f59e0b' }}>
                {filteredStock.reduce((sum, l) => sum + l.available, 0)}
              </h3>
            </div>
          </div>

          <div className="widescreen-grid">
            {/* Left Column: Search & Filters */}
            <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 12 }}>Filter Stock Records</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      placeholder="Search lot number or batch code..." 
                      value={stockSearchQuery}
                      onChange={e => { setStockSearchQuery(e.target.value); setCurrentStockPage(1); }}
                      style={{ paddingLeft: 36 }}
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setCurrentStockPage(1); }}>
                        <option value="">All Clients</option>
                        {clientsList.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentStockPage(1); }}>
                        <option value="">All Statuses</option>
                        <option value="In Process">In Process</option>
                        <option value="Complete">Complete</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.65rem', marginBottom: 2 }}>From Date</label>
                      <input 
                        type="date" 
                        value={dateStartFilter} 
                        onChange={e => { setDateStartFilter(e.target.value); setCurrentStockPage(1); }} 
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.65rem', marginBottom: 2 }}>To Date</label>
                      <input 
                        type="date" 
                        value={dateEndFilter} 
                        onChange={e => { setDateEndFilter(e.target.value); setCurrentStockPage(1); }} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Inward New Lot Form Drawer */}
              {showInwardForm && (
                <InwardForm 
                  onSubmit={handleInwardSubmit}
                  onCancel={() => { setShowInwardForm(false); setManagerSignOff(false); }}
                  newLot={newLot}
                  setNewLot={setNewLot}
                  managerSignOff={managerSignOff}
                  setManagerSignOff={setManagerSignOff}
                  userRole={user?.role}
                />
              )}

              {/* Client Allocation Vitals */}
              {user && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Package size={14} /> Client Allocation Vitals
                  </h4>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    Allocated quantities by client representing active, in-process shop floor lots.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {clientsList.map(client => {
                      const clientLots = filteredStock.filter(l => l.client_name === client.name);
                      const totalReceived = clientLots.reduce((sum, l) => sum + l.received_qty, 0);
                      const totalAvailable = clientLots.reduce((sum, l) => sum + l.available, 0);
                      const progressPct = filteredStock.length > 0 ? Math.round((clientLots.length / filteredStock.length) * 100) : 0;
                      
                      if (totalReceived === 0) return null;
                      
                      return (
                        <div key={client.id} style={{ padding: 10, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>{client.name}</span>
                            <span style={{ fontSize: '0.7' + 'rem', color: 'var(--color-primary)', fontWeight: 600 }}>{totalAvailable} / {totalReceived} avl</span>
                          </div>
                          <div style={{ height: 4, background: 'var(--card-bg)', borderRadius: 2 }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--color-blue)', borderRadius: 2 }}></div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            <span>Share: {progressPct}% of warehouse</span>
                            <span>Lots: {clientLots.length} active</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Environmental Vitals */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-blue)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                  <Info size={14} /> Environmental Vitals
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: '0.68rem', textAlign: 'center' }}>
                  <div style={{ padding: '8px 4px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', textTransform: 'uppercase', marginBottom: 2 }}>Humidity</div>
                    <strong style={{ color: '#10b981', fontSize: '0.85rem' }}>38% RH</strong>
                    <div style={{ color: '#10b981', fontSize: '0.5rem', fontWeight: 700, marginTop: 2 }}>SAFE</div>
                  </div>
                  <div style={{ padding: '8px 4px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', textTransform: 'uppercase', marginBottom: 2 }}>Temperature</div>
                    <strong style={{ color: '#10b981', fontSize: '0.85rem' }}>22.4°C</strong>
                    <div style={{ color: '#10b981', fontSize: '0.5rem', fontWeight: 700, marginTop: 2 }}>SAFE</div>
                  </div>
                  <div style={{ padding: '8px 4px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', textTransform: 'uppercase', marginBottom: 2 }}>ESD Level</div>
                    <strong style={{ color: '#60a5fa', fontSize: '0.85rem' }}>0V</strong>
                    <div style={{ color: '#60a5fa', fontSize: '0.5rem', fontWeight: 700, marginTop: 2 }}>SAFE</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Ledger List */}
            <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8 }}>
                Stock Records Ledger
              </h3>
              
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '520px', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {paginatedLots.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No lots match the active filter criteria.
                  </div>
                ) : paginatedLots.map(lot => {
                  const shortage = lot.qty_sent - lot.received_qty;
                  const isComplete = lot.status === 'Complete';
                  return (
                    <div 
                      key={lot.id} 
                      onClick={() => {
                        setActiveLotDetail(lot);
                        setLotDetailTab('stock');
                        fetchCheckpointReports(lot.id);
                      }}
                      className="lot-hover-card"
                      style={{ 
                        padding: 16, 
                        borderRadius: 12, 
                        border: '1px solid var(--card-border)', 
                        background: 'var(--card-bg)', 
                        borderColor: isComplete ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Client: {lot.client_name}</span>
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '2px 0 0 0' }}>Lot {lot.lot_no} <span style={{ color: '#475569', fontSize: '0.85rem' }}>({lot.batch_no} • {lot.pixel_pitch})</span></h3>
                        </div>
                        
                        {/* Lot Action Toolbar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleViewLotTransactions(lot.id, lot.lot_no); }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 4 }}
                            title="View Audit Trail Logs"
                          >
                            <History size={16} />
                          </button>

                          {shortage !== 0 && user?.role === 'Team Lead' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleOpenEmailModal(lot, shortage); }}
                              style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 4 }}
                              title="Dispatch Discrepancy Email"
                            >
                              <Mail size={16} />
                            </button>
                          )}
                          
                          {user?.role === 'Team Lead' && (
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                const res = await apiFetch(`/api/stock/history/${lot.id}`);
                                if (res.ok) {
                                  const data = await res.json();
                                  exportSingleLot(lot.lot_no, data);
                                }
                              }}
                              style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 4 }}
                              title="Export Lot Panels CSV"
                            >
                              <Download size={16} />
                            </button>
                          )}

                          {user?.role === 'Team Lead' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleToggleLotStatus(lot.id); }}
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: isComplete ? 'var(--color-primary)' : '#475569', 
                                cursor: (isComplete && user?.role !== 'Team Lead') ? 'not-allowed' : 'pointer',
                                padding: 4 
                              }}
                              disabled={isComplete && user?.role !== 'Team Lead'}
                              title={isComplete ? "Lock status (Team Lead can unlock)" : "Toggle Complete status"}
                            >
                              {isComplete ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            </button>
                          )}

                          <span className={`badge ${isComplete ? 'badge-success' : 'badge-warning'}`}>
                            {lot.status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Shortage Discrepancy Highlight */}
                      {shortage !== 0 && (
                        <div className="badge badge-danger" style={{ display: 'flex', width: '100%', marginBottom: 12, justifyContent: 'center', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '0.5px solid rgba(239,68,68,0.2)' }}>
                          <AlertTriangle size={12} /> Discrepancy: {shortage > 0 ? `${shortage} units Shortage` : `${Math.abs(shortage)} units Excess`} (Challan Qty: {lot.qty_sent} vs Inward: {lot.received_qty})
                        </div>
                      )}

                      <div className="lot-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, fontSize: '0.75rem', textAlign: 'center', background: 'var(--card-bg)', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Inward</div>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>{lot.received_qty}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Outward</div>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#10b981' }}>{lot.dispatched_qty}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Return</div>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#f87171' }}>{lot.return_qty}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Redispatch</div>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#60a5fa' }}>{lot.redispatch_qty}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Available</div>
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: lot.available > 0 ? 'var(--color-primary)' : '#64748b' }}>{lot.available}</div>
                        </div>
                      </div>

                      {/* Quick Action Transaction Toolbar */}
                      <div className="lot-action-btns" style={{ display: 'flex', gap: 6 }}>
                        <button 
                          disabled={isComplete && user?.role !== 'Team Lead'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOutwardForm({ lot_id: lot.id, qty: '', remarks: '' });
                            setShowOutwardModal(true);
                          }}
                          className="btn"
                          style={{ 
                            flex: 1, 
                            margin: 0, 
                            padding: '6px 8px', 
                            fontSize: '0.72rem', 
                            background: 'rgba(16, 185, 129, 0.1)', 
                            border: '1px solid var(--card-border)', 
                            color: '#10b981',
                            cursor: (isComplete && user?.role !== 'Team Lead') ? 'not-allowed' : 'pointer',
                            opacity: (isComplete && user?.role !== 'Team Lead') ? 0.3 : 1
                          }}
                        >
                          Dispatch Out
                        </button>
                        <button 
                          disabled={isComplete && user?.role !== 'Team Lead'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setReturnForm({ lot_id: lot.id, qty: '', reason: 'Solder Defect', remarks: '' });
                            setShowReturnModal(true);
                          }}
                          className="btn"
                          style={{ 
                            flex: 1, 
                            margin: 0, 
                            padding: '6px 8px', 
                            fontSize: '0.72rem', 
                            background: 'rgba(239, 68, 68, 0.1)', 
                            border: '1px solid var(--card-border)', 
                            color: '#ef4444',
                            cursor: (isComplete && user?.role !== 'Team Lead') ? 'not-allowed' : 'pointer',
                            opacity: (isComplete && user?.role !== 'Team Lead') ? 0.3 : 1
                          }}
                        >
                          Log Return
                        </button>
                        <button 
                          disabled={isComplete && user?.role !== 'Team Lead'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRedispatchForm({ lot_id: lot.id, qty: '', remarks: '' });
                            setShowRedispatchModal(true);
                          }}
                          className="btn"
                          style={{ 
                            flex: 1, 
                            margin: 0, 
                            padding: '6px 8px', 
                            fontSize: '0.72rem', 
                            background: 'rgba(59, 130, 246, 0.1)', 
                            border: '1px solid var(--card-border)', 
                            color: '#3b82f6',
                            cursor: (isComplete && user?.role !== 'Team Lead') ? 'not-allowed' : 'pointer',
                            opacity: (isComplete && user?.role !== 'Team Lead') ? 0.3 : 1
                          }}
                        >
                          Redispatch
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalStockPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: 'var(--card-bg)', padding: 10, borderRadius: 12, border: '1px solid var(--card-border)' }}>
                  <button 
                    onClick={() => setCurrentStockPage(prev => Math.max(prev - 1, 1))} 
                    disabled={currentStockPage === 1}
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', margin: 0 }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Page {currentStockPage} of {totalStockPages}</span>
                  <button 
                    onClick={() => setCurrentStockPage(prev => Math.min(prev + 1, totalStockPages))} 
                    disabled={currentStockPage === totalStockPages}
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', margin: 0 }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <OutwardModal 
        isOpen={showOutwardModal}
        onClose={() => { setShowOutwardModal(false); setOutwardForm({ lot_id: '', qty: '', remarks: '' }); }}
        onSubmit={handleOutwardSubmit}
        stockData={stockData}
        user={user}
        form={outwardForm}
        setForm={setOutwardForm}
      />

      <ReturnModal 
        isOpen={showReturnModal}
        onClose={() => { setShowReturnModal(false); setReturnForm({ lot_id: '', qty: '', reason: 'Solder Defect', remarks: '' }); }}
        onSubmit={handleReturnSubmit}
        stockData={stockData}
        user={user}
        form={returnForm}
        setForm={setReturnForm}
      />

      <RedispatchModal 
        isOpen={showRedispatchModal}
        onClose={() => { setShowRedispatchModal(false); setRedispatchForm({ lot_id: '', qty: '', remarks: '' }); }}
        onSubmit={handleRedispatchSubmit}
        stockData={stockData}
        user={user}
        form={redispatchForm}
        setForm={setRedispatchForm}
      />

      <TransactionHistoryModal 
        isOpen={showTransactionsModal}
        onClose={() => { setShowTransactionsModal(false); setSelectedLotTransactions([]); }}
        selectedLotTransactions={selectedLotTransactions}
        transactionsLotNo={transactionsLotNo}
      />

      <EmailModal 
        isOpen={showEmailModal}
        onClose={() => { setShowEmailModal(false); setSelectedLotForEmail(null); }}
        onSubmit={handleSendEmail}
        selectedLotForEmail={selectedLotForEmail}
        form={emailForm}
        setForm={setEmailForm}
        emailSending={emailSending}
      />
    </div>
  );
};

export default LotsPage;
