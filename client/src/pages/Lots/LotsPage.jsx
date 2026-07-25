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

  return (
    <div>
      <div className="app-header">
        <div>
          <span className="app-subtitle">Inventory Management</span>
          <h1 className="app-title"><Package size={20} color='var(--color-primary)' /> Stock Summary</h1>
        </div>
        
        {/* Header Action Grid */}
        <div style={{ display: 'flex', gap: 8 }}>
          {['Superadmin', 'Manager'].includes(user?.role) && (
            <button 
              onClick={exportAllLots} 
              className="badge badge-info"
              style={{ cursor: 'pointer', background: '#38bdf8', color: '#000', border: 'none', padding: '6px 12px' }}
            >
              <Download size={12} /> Export All
            </button>
          )}
          {['Superadmin', 'Manager', 'Team Lead'].includes(user?.role) && (
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
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 600 }}>{totalAvailable} / {totalReceived} avl</span>
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
                <div key={lot.id} style={{ padding: 16, borderRadius: 12, border: '1px solid var(--card-border)', background: 'var(--card-bg)', borderColor: isComplete ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Client: {lot.client_name}</span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '2px 0 0 0' }}>Lot {lot.lot_no} <span style={{ color: '#475569', fontSize: '0.85rem' }}>({lot.batch_no} • {lot.pixel_pitch})</span></h3>
                    </div>
                    
                    {/* Lot Action Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button 
                        onClick={() => handleViewLotTransactions(lot.id, lot.lot_no)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 4 }}
                        title="View Audit Trail Logs"
                      >
                        <History size={16} />
                      </button>

                      {shortage !== 0 && user?.role === 'Superadmin' && (
                        <button 
                          onClick={() => handleOpenEmailModal(lot, shortage)}
                          style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 4 }}
                          title="Dispatch Discrepancy Email"
                        >
                          <Mail size={16} />
                        </button>
                      )}
                      
                      {['Superadmin', 'Manager'].includes(user?.role) && (
                        <button 
                          onClick={async () => {
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

                      {['Superadmin', 'Manager'].includes(user?.role) && (
                        <button 
                          onClick={() => handleToggleLotStatus(lot.id)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: isComplete ? 'var(--color-primary)' : '#475569', 
                            cursor: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 'not-allowed' : 'pointer',
                            padding: 4 
                          }}
                          disabled={isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)}
                          title={isComplete ? "Lock status (Team Lead or Manager can unlock)" : "Toggle Complete status"}
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
                      disabled={isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)}
                      onClick={() => {
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
                        cursor: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 'not-allowed' : 'pointer',
                        opacity: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 0.3 : 1
                      }}
                    >
                      Dispatch Out
                    </button>
                    <button 
                      disabled={isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)}
                      onClick={() => {
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
                        cursor: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 'not-allowed' : 'pointer',
                        opacity: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 0.3 : 1
                      }}
                    >
                      Log Return
                    </button>
                    <button 
                      disabled={isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)}
                      onClick={() => {
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
                        cursor: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 'not-allowed' : 'pointer',
                        opacity: (isComplete && !['Superadmin', 'Manager', 'Team Lead'].includes(user?.role)) ? 0.3 : 1
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

      {/* Modals portal mount */}
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
