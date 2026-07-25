import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Building, Layers, ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft, Upload, Grid } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const LotSetupWizard = ({ showToast, apiFetch, onRefreshLots }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [companies, setCompanies] = useState([]);
  const [lots, setLots] = useState([]);
  
  // Selections
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');
  const [selectedLotNo, setSelectedLotNo] = useState('');

  // Load user-specific states when user loads
  useEffect(() => {
    if (user) {
      const email = user.email;
      const savedStep = localStorage.getItem(`es_wizard_step_${email}`);
      setStep(savedStep ? parseInt(savedStep, 10) : 1);
      setSelectedCompanyId(localStorage.getItem(`es_wizard_company_id_${email}`) || '');
      setSelectedCompanyName(localStorage.getItem(`es_wizard_company_name_${email}`) || '');
      setSelectedLotId(localStorage.getItem(`es_wizard_lot_id_${email}`) || '');
      setSelectedLotNo(localStorage.getItem(`es_wizard_lot_no_${email}`) || '');
    } else {
      setStep(1);
      setSelectedCompanyId('');
      setSelectedCompanyName('');
      setSelectedLotId('');
      setSelectedLotNo('');
    }
  }, [user]);

  // Sync changes to user-specific localStorage keys
  useEffect(() => {
    if (user && step) {
      localStorage.setItem(`es_wizard_step_${user.email}`, step);
    }
  }, [step, user]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(`es_wizard_company_id_${user.email}`, selectedCompanyId);
    }
  }, [selectedCompanyId, user]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(`es_wizard_company_name_${user.email}`, selectedCompanyName);
    }
  }, [selectedCompanyName, user]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(`es_wizard_lot_id_${user.email}`, selectedLotId);
    }
  }, [selectedLotId, user]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(`es_wizard_lot_no_${user.email}`, selectedLotNo);
    }
  }, [selectedLotNo, user]);
  
  // Step 1: New Company Form
  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyContact, setNewCompanyContact] = useState('');
  const [newCompanyEmail, setNewCompanyEmail] = useState('');

  // Step 2: New Lot Form
  const [createNewLot, setCreateNewLot] = useState(false);
  const [newLotForm, setNewLotForm] = useState({
    lot_no: '',
    batch_no: '',
    pixel_pitch: 'P5.9',
    qty_sent: '',
    qty_received: '',
    remarks: ''
  });

  // Step 3: Excel Upload Preview
  const [isDragging, setIsDragging] = useState(false);
  const [excelData, setExcelData] = useState(null);
  const [activeSheetName, setActiveSheetName] = useState('');
  const [visibleRowsCount, setVisibleRowsCount] = useState(10);
  const [uploading, setUploading] = useState(false);

  // Step 4: Rules Form
  const [rulesForm, setRulesForm] = useState({
    scrap_year_threshold: '2021',
    separate_year_threshold: '2022',
    checkbox_year_threshold: '2023'
  });
  const [rulesSaved, setRulesSaved] = useState(false);

  // Data loaders
  const loadCompanies = async () => {
    try {
      const res = await apiFetch('/api/stock/clients');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadLots = async () => {
    try {
      const res = await apiFetch('/api/stock');
      if (res.ok) {
        const data = await res.json();
        setLots(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCompanies();
    loadLots();
  }, []);

  // Helpers
  const getColumnLetter = (colIdx) => {
    let letter = '';
    let temp = colIdx;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Step 1 handlers
  const handleCreateCompany = async (e) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    try {
      const res = await apiFetch('/api/stock/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: newCompanyName.trim(),
          contact: newCompanyContact.trim() || 'Default Contact',
          email: newCompanyEmail.trim() || 'contact@client.com'
        })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Company "${data.name}" created successfully!`);
        setSelectedCompanyId(data.id);
        setSelectedCompanyName(data.name);
        setNewCompanyName('');
        setNewCompanyContact('');
        setNewCompanyEmail('');
        setShowNewCompanyForm(false);
        await loadCompanies();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create company.', 'danger');
      }
    } catch (e) {
      showToast('Error creating company.', 'danger');
    }
  };

  // Step 2 handlers
  const handleCreateLotSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      showToast('Please go back and select a company first.', 'warning');
      return;
    }
    try {
      const res = await apiFetch('/api/stock/inward', {
        method: 'POST',
        body: JSON.stringify({
          lot_no: parseInt(newLotForm.lot_no, 10),
          batch_no: newLotForm.batch_no,
          pixel_pitch: newLotForm.pixel_pitch,
          client_name: selectedCompanyName,
          qty_sent: parseInt(newLotForm.qty_sent, 10),
          qty_received: parseInt(newLotForm.qty_received, 10),
          remarks: newLotForm.remarks,
          status: 'Draft' // force Draft status
        })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Lot ${data.lot_no} created in Draft status!`);
        setSelectedLotId(data.id);
        setSelectedLotNo(data.lot_no);
        setCreateNewLot(false);
        setNewLotForm({ lot_no: '', batch_no: '', pixel_pitch: 'P5.9', qty_sent: '', qty_received: '', remarks: '' });
        await loadLots();
        if (onRefreshLots) onRefreshLots();
        setStep(3);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create lot.', 'danger');
      }
    } catch (e) {
      showToast('Error creating lot.', 'danger');
    }
  };

  // Step 3 handlers
  const handleUploadExcelFile = async (file) => {
    if (!selectedLotId) {
      showToast('Please select or create a lot first.', 'warning');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${API_BASE_URL}/api/lots/${selectedLotId}/upload-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('es_access_token') || ''}`
        },
        body: file
      });
      if (res.ok) {
        showToast('Excel file uploaded successfully! Fetching preview...');
        const previewRes = await fetch(`${API_BASE_URL}/api/lots/${selectedLotId}/excel-data`, {
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('es_access_token') || ''}`
          }
        });
        if (previewRes.ok) {
          const previewData = await previewRes.json();
          setExcelData(previewData.sheets || {});
          const sheetNames = Object.keys(previewData.sheets || {});
          if (sheetNames.length > 0) {
            setActiveSheetName(sheetNames[0]);
          }
        } else {
          showToast('Failed to load excel preview data.', 'danger');
        }
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to parse Excel file.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error uploading Excel file.', 'danger');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadExcelFile(e.target.files[0]);
    }
  };

  // Step 4 handlers
  const handleSaveRules = async (e) => {
    e.preventDefault();
    if (!selectedLotId) return;
    try {
      const res = await apiFetch(`/api/lots/${selectedLotId}/rules`, {
        method: 'PUT',
        body: JSON.stringify({
          scrap_year_threshold: parseInt(rulesForm.scrap_year_threshold, 10),
          separate_year_threshold: rulesForm.separate_year_threshold !== '' ? parseInt(rulesForm.separate_year_threshold, 10) : null,
          checkbox_year_threshold: parseInt(rulesForm.checkbox_year_threshold, 10)
        })
      });
      if (res.ok) {
        showToast('Year-based action rules saved successfully!');
        setRulesSaved(true);
        setStep(5);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save rules.', 'danger');
      }
    } catch (e) {
      showToast('Error saving rules.', 'danger');
    }
  };

  // Step 5 activation
  const handleActivateLot = async () => {
    if (!selectedLotId) return;
    try {
      const res = await apiFetch(`/api/lots/${selectedLotId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Active' })
      });
      if (res.ok) {
        showToast(`Lot ${selectedLotNo} has been activated and is now visible to Employees!`, 'success');
        await loadLots();
        if (onRefreshLots) onRefreshLots();
        // Reset Setup Wizard state
        setStep(1);
        setSelectedCompanyId('');
        setSelectedCompanyName('');
        setSelectedLotId('');
        setSelectedLotNo('');
        setExcelData(null);
        setRulesSaved(false);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to activate lot.', 'danger');
      }
    } catch (e) {
      showToast('Error activating lot.', 'danger');
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 20px 40px 20px' }}>
      <div className="app-header" style={{ marginBottom: 24 }}>
        <div>
          <span className="app-subtitle">Lot Configuration Panel</span>
          <h1 className="app-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={20} color='var(--color-primary)' /> Lot Setup Wizard
          </h1>
        </div>
      </div>

      {/* Progress Stepper bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '16px 24px', marginBottom: 24 }}>
        {[
          { label: 'Client Company', icon: Building, stepNo: 1 },
          { label: 'Lot Assignment', icon: Layers, stepNo: 2 },
          { label: 'Import Excel', icon: FileSpreadsheet, stepNo: 3 },
          { label: 'Configure Rules', icon: ShieldCheck, stepNo: 4 },
          { label: 'Activate Lot', icon: CheckCircle2, stepNo: 5 }
        ].map((s) => {
          const Icon = s.icon;
          const isActive = step === s.stepNo;
          const isCompleted = step > s.stepNo;
          return (
            <div key={s.stepNo} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: isActive || isCompleted ? 1 : 0.4 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isActive ? 'var(--color-primary)' : (isCompleted ? 'var(--color-blue)' : 'rgba(255,255,255,0.05)'),
                color: isActive || isCompleted ? '#000' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.8rem',
                border: isActive ? '2px solid #fff' : 'none'
              }}>
                {isCompleted ? '✓' : s.stepNo}
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: isActive ? 800 : 600, color: isActive ? 'var(--color-primary)' : 'var(--text-main)', display: 'none', md: 'inline' }}>{s.label}</span>
              {s.stepNo < 5 && <ArrowRight size={14} style={{ color: 'var(--card-border)', marginLeft: 10 }} />}
            </div>
          );
        })}
      </div>

      <div className="glass-panel" style={{ padding: 24 }}>
        {/* STEP 1: Select Client Company */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 20 }}>
              Step 1: Select Client Company
            </h3>
            {!showNewCompanyForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label>Select Existing Client Company</label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setSelectedCompanyId(cid);
                      const cmp = companies.find(c => String(c.id) === String(cid));
                      setSelectedCompanyName(cmp ? cmp.name : '');
                    }}
                    style={{ padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 8, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">-- Choose Company --</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowNewCompanyForm(true)}
                    style={{ padding: '8px 16px', fontSize: '0.78rem' }}
                  >
                    + Add New Client Company
                  </button>
                  {selectedCompanyId && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setStep(2)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: '0.78rem' }}
                    >
                      Next Step <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateCompany} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label>Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Atomberg"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Jane Smith"
                    value={newCompanyContact}
                    onChange={(e) => setNewCompanyContact(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Email</label>
                  <input
                    type="email"
                    placeholder="e.g. support@client.com"
                    value={newCompanyEmail}
                    onChange={(e) => setNewCompanyEmail(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowNewCompanyForm(false)}
                    style={{ padding: '8px 16px', fontSize: '0.78rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ padding: '8px 20px', fontSize: '0.78rem' }}
                  >
                    Create Client
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* STEP 2: Select or Create Lot */}
        {step === 2 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 20 }}>
              Step 2: Assign Lot for {selectedCompanyName}
            </h3>
            
            {!createNewLot ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label>Select Existing Lot (Only Draft/Active lots configured previously)</label>
                  <select
                    value={selectedLotId}
                    onChange={(e) => {
                      const lid = e.target.value;
                      setSelectedLotId(lid);
                      const lot = lots.find(l => String(l.id) === String(lid));
                      setSelectedLotNo(lot ? lot.lot_no : '');
                    }}
                    style={{ padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 8, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">-- Choose Existing Lot --</option>
                    {lots
                      .filter(l => l.client_name === selectedCompanyName)
                      .map(l => (
                        <option key={l.id} value={l.id}>Lot {l.lot_no} ({l.status})</option>
                      ))
                    }
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setStep(1)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.78rem' }}
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCreateNewLot(true)}
                      style={{ padding: '8px 16px', fontSize: '0.78rem' }}
                    >
                      + Create New Lot
                    </button>
                  </div>
                  {selectedLotId && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setStep(3)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: '0.78rem' }}
                    >
                      Next Step <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateLotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label>Lot Number *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 21"
                      value={newLotForm.lot_no}
                      onChange={(e) => setNewLotForm({ ...newLotForm, lot_no: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Batch Code (e.g. DX128) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DX128"
                      value={newLotForm.batch_no}
                      onChange={(e) => setNewLotForm({ ...newLotForm, batch_no: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label>Pixel Pitch</label>
                    <input
                      type="text"
                      required
                      value={newLotForm.pixel_pitch}
                      onChange={(e) => setNewLotForm({ ...newLotForm, pixel_pitch: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Expected Qty (Challan) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 260"
                      value={newLotForm.qty_sent}
                      onChange={(e) => setNewLotForm({ ...newLotForm, qty_sent: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Received Qty (Inward) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 260"
                      value={newLotForm.qty_received}
                      onChange={(e) => setNewLotForm({ ...newLotForm, qty_received: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    rows="3"
                    placeholder="Enter setup remarks..."
                    value={newLotForm.remarks}
                    onChange={(e) => setNewLotForm({ ...newLotForm, remarks: e.target.value })}
                    style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 8, padding: 12, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCreateNewLot(false)}
                    style={{ padding: '8px 16px', fontSize: '0.78rem' }}
                  >
                    Back to Selection
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ padding: '8px 20px', fontSize: '0.78rem' }}
                  >
                    Create Lot
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* STEP 3: Excel Import */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 20 }}>
              Step 3: Upload Company Excel file for Lot {selectedLotNo}
            </h3>

            {!excelData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleUploadExcelFile(e.dataTransfer.files[0]);
                    }
                  }}
                  style={{
                    border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed var(--card-border)',
                    background: isDragging ? 'rgba(var(--color-primary-rgb), 0.05)' : 'rgba(255,255,255,0.01)',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 32,
                    cursor: 'pointer',
                    minHeight: 180,
                    transition: 'all 0.2s ease',
                    marginBottom: 12
                  }}
                  onClick={() => document.getElementById('excelSetupFileInput').click()}
                >
                  <FileSpreadsheet size={40} color={isDragging ? 'var(--color-primary)' : 'var(--text-muted)'} style={{ marginBottom: 12 }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{uploading ? 'Processing Excel file...' : 'Drag and drop Client Excel here'}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>or click to browse (.xlsx, .xls)</span>
                  <input
                    type="file"
                    id="excelSetupFileInput"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStep(2)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.78rem' }}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Object.keys(excelData).map((sheetName) => (
                      <button
                        key={sheetName}
                        type="button"
                        onClick={() => { setActiveSheetName(sheetName); setVisibleRowsCount(10); }}
                        style={{
                          padding: '6px 12px',
                          background: activeSheetName === sheetName ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)',
                          color: activeSheetName === sheetName ? '#000' : 'var(--text-main)',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        {sheetName}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setExcelData(null)}
                    style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                  >
                    Clear Preview & Re-upload
                  </button>
                </div>

                {/* Raw Grid Table Preview */}
                <div style={{ overflowX: 'auto', border: '1px solid var(--card-border)', borderRadius: 8, maxHeight: 350, overflowY: 'auto' }}>
                  <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--card-border)' }}>
                        <th style={{ padding: '6px 10px', width: 40, background: 'var(--card-bg)', position: 'sticky', left: 0 }}>#</th>
                        {(excelData[activeSheetName]?.[0] || []).map((_, idx) => (
                          <th key={idx} style={{ padding: '6px 10px', fontWeight: 800, textAlign: 'center' }}>
                            {getColumnLetter(idx)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(excelData[activeSheetName] || []).slice(0, visibleRowsCount).map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 'bold', background: 'rgba(255,255,255,0.01)', position: 'sticky', left: 0 }}>{rIdx + 1}</td>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                              {cell !== null ? String(cell) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {excelData[activeSheetName]?.length > visibleRowsCount && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setVisibleRowsCount(prev => prev + 50)}
                    style={{ margin: '12px auto 0 auto', display: 'block', fontSize: '0.7rem', padding: '6px 16px' }}
                  >
                    Load More Rows
                  </button>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStep(2)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.78rem' }}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setStep(4)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: '0.78rem' }}
                  >
                    Confirm Import & Go to Rules <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Configure Rules */}
        {step === 4 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 20 }}>
              Step 4: Set Year-Based Action Rules for Lot {selectedLotNo}
            </h3>
            
            <form onSubmit={handleSaveRules} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="form-group">
                <label>1. Scrap if Manufacturing Year ≤ [Year Input]</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 2021"
                  value={rulesForm.scrap_year_threshold}
                  onChange={(e) => setRulesForm({ ...rulesForm, scrap_year_threshold: e.target.value })}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Units manufactured on or before this year will be auto-marked SCRAP.</span>
              </div>

              <div className="form-group">
                <label>2. Separate if Manufacturing Year = [Year Input] (Leave empty if no separate rules)</label>
                <input
                  type="number"
                  placeholder="e.g. 2022"
                  value={rulesForm.separate_year_threshold}
                  onChange={(e) => setRulesForm({ ...rulesForm, separate_year_threshold: e.target.value })}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Units manufactured in this specific year will be auto-marked SEPARATE.</span>
              </div>

              <div className="form-group">
                <label>3. Repairable / Non-Repairable Checkbox if Manufacturing Year ≥ [Year Input]</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 2023"
                  value={rulesForm.checkbox_year_threshold}
                  onChange={(e) => setRulesForm({ ...rulesForm, checkbox_year_threshold: e.target.value })}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Units manufactured in this year or later will request the Employee to tick Repairable or Non-Repairable.</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(3)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.78rem' }}
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: '0.78rem' }}
                >
                  Save Rules & Review <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 5: Activate Lot */}
        {step === 5 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 20 }}>
              Step 5: Review & Activate Lot {selectedLotNo}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(255,255,255,0.01)', padding: 20, borderRadius: 8, border: '1px solid var(--card-border)', marginBottom: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Client Company:</strong>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginTop: 4 }}>{selectedCompanyName}</div>
                </div>
                <div>
                  <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Lot Number:</strong>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginTop: 4 }}>Lot {selectedLotNo}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Year-Based Action Rules:</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#dc3545', fontWeight: 'bold' }}>[SCRAP]</span>
                    <span>If Mfg Year ≤ <strong>{rulesForm.scrap_year_threshold}</strong></span>
                  </div>
                  {rulesForm.separate_year_threshold && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>[SEPARATE]</span>
                      <span>If Mfg Year = <strong>{rulesForm.separate_year_threshold}</strong></span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>[REP / NON-REP]</span>
                    <span>If Mfg Year ≥ <strong>{rulesForm.checkbox_year_threshold}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Dynamic Sheets Imported:</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {excelData && Object.keys(excelData).map(name => (
                    <span key={name} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: '0.7rem' }}>
                      {name} ({excelData[name]?.length || 0} rows)
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(4)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.78rem' }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleActivateLot}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px', fontSize: '0.8rem', background: 'var(--color-primary)', color: '#000', border: 'none', fontWeight: 'bold' }}
              >
                Activate Lot Now <CheckCircle2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LotSetupWizard;
