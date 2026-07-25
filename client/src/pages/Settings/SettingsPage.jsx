import React, { useState, useEffect } from 'react';
import { 
  Users, RefreshCw, Plus, ShieldCheck, Activity, ToggleLeft, ToggleRight, 
  Briefcase, ArrowUp, ArrowDown, Trash2, Settings, PlusCircle 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const DEFAULT_12_STEPS = [
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
];

const SettingsPage = ({ showToast, onRefreshCompanies, onRefreshLots }) => {
  const { user, apiFetch } = useAuth();
  
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('es_settings_active_tab') || 'users');

  useEffect(() => {
    localStorage.setItem('es_settings_active_tab', activeTab);
  }, [activeTab]);
  
  // Tab 1: System Users Directory
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ firstName: '', lastName: '', role: 'Employee', attendance_rate: '95.0' });
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Tab 2: Companies & Workflows
  const [companies, setCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [showAddCompanyForm, setShowAddCompanyForm] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({ name: '', contact: '', email: '' });
  const [workflowSteps, setWorkflowSteps] = useState(DEFAULT_12_STEPS);
  const [companyLots, setCompanyLots] = useState([]);
  
  const [selectedEditCompany, setSelectedEditCompany] = useState(null);
  const [newLotForm, setNewLotForm] = useState({ lot_no: '', batch_no: '', pixel_pitch: 'P5.9', qty_sent: '', received_qty: '', remarks: '' });

  const fetchAdminUsers = async () => {
    try {
      if (!user || user.role === 'Employee') return;
      setAdminUsersLoading(true);
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch active system accounts.', 'danger');
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const fetchCompaniesList = async () => {
    try {
      if (!user || user.role === 'Employee') return;
      setCompaniesLoading(true);
      const res = await apiFetch('/api/stock/clients');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch active companies list.', 'danger');
    } finally {
      setCompaniesLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'Employee') {
      if (activeTab === 'users') {
        fetchAdminUsers();
      } else {
        fetchCompaniesList();
      }
    }
  }, [user, activeTab]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!user || user.role === 'Employee') return;
    
    const firstName = newUserForm.firstName?.trim() || '';
    const lastName = newUserForm.lastName?.trim() || '';
    
    if (!firstName || !lastName) {
      showToast('Both First Name and Last Name are required.', 'danger');
      return;
    }
    
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
    const formattedFirstName = firstName.split(' ').map(capitalize).join(' ');
    const formattedLastName = lastName.split(' ').map(capitalize).join(' ');
    const name = `${formattedFirstName} ${formattedLastName}`;
    
    const cleanFirstName = firstName.toLowerCase().replace(/\s+/g, '');
    const firstLetterOfSurname = lastName.charAt(0).toLowerCase();
    const email = `${cleanFirstName}.${firstLetterOfSurname}@electrolytesoln.com`;
    
    const password = 'Electrolyte2026!';
    
    setIsSubmittingUser(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          role: newUserForm.role,
          attendance_rate: newUserForm.attendance_rate
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'User account provisioned successfully!');
        setNewUserForm({ firstName: '', lastName: '', role: 'Employee', attendance_rate: '95.0' });
        fetchAdminUsers();
      } else {
        showToast(data.error || 'Failed to provision user.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to user management API.', 'danger');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleToggleUserStatus = async (targetUserId) => {
    if (!user || user.role === 'Employee') return;
    try {
      const res = await apiFetch(`/api/admin/users/toggle/${targetUserId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'User status updated successfully!');
        fetchAdminUsers();
      } else {
        showToast(data.error || 'Failed to update user status.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error communicating with active directory API.', 'danger');
    }
  };

  // Drag & Drop / Reordering workflow steps helpers
  const handleMoveStepUp = (index) => {
    if (index === 0) return;
    setWorkflowSteps(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index - 1];
      copy[index - 1] = temp;
      return copy.map((step, idx) => ({ ...step, step_no: idx + 1 }));
    });
  };

  const handleMoveStepDown = (index) => {
    if (index === workflowSteps.length - 1) return;
    setWorkflowSteps(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index + 1];
      copy[index + 1] = temp;
      return copy.map((step, idx) => ({ ...step, step_no: idx + 1 }));
    });
  };

  const handleStepNameChange = (index, newName) => {
    setWorkflowSteps(prev => {
      const copy = [...prev];
      copy[index].name = newName;
      return copy;
    });
  };

  const handleAddStep = () => {
    setWorkflowSteps(prev => [
      ...prev,
      { step_no: prev.length + 1, name: 'New Workflow Step' }
    ]);
  };

  const handleDeleteStep = (index) => {
    setWorkflowSteps(prev => {
      const copy = prev.filter((_, idx) => idx !== index);
      return copy.map((step, idx) => ({ ...step, step_no: idx + 1 }));
    });
  };

  // Dynamic lots list helpers
  const handleAddLotRow = () => {
    setCompanyLots(prev => [
      ...prev,
      { lot_no: '', batch_no: '', pixel_pitch: 'P5.9', qty_sent: '', received_qty: '', remarks: '' }
    ]);
  };

  const handleRemoveLotRow = (index) => {
    setCompanyLots(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleLotRowChange = (index, field, value) => {
    setCompanyLots(prev => {
      const copy = [...prev];
      copy[index][field] = value;
      return copy;
    });
  };

  // Submit Company (Steps + Lots) Creator
  const handleAddCompanySubmit = async (e) => {
    e.preventDefault();
    if (!newCompanyForm.name?.trim()) {
      showToast('Company name is required.', 'danger');
      return;
    }
    
    const validLots = companyLots
      .filter(l => l.lot_no)
      .map(l => ({
        lot_no: parseInt(l.lot_no),
        batch_no: l.batch_no || 'Default_Batch',
        pixel_pitch: l.pixel_pitch || 'P5.9',
        qty_sent: parseInt(l.qty_sent || 0),
        received_qty: parseInt(l.received_qty || 0),
        remarks: l.remarks || ''
      }));

    try {
      const res = await apiFetch('/api/stock/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: newCompanyForm.name.trim(),
          contact: newCompanyForm.contact.trim(),
          email: newCompanyForm.email.trim(),
          steps: workflowSteps,
          lots: validLots
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Company, custom steps, and initial lots added successfully!');
        setNewCompanyForm({ name: '', contact: '', email: '' });
        setWorkflowSteps(DEFAULT_12_STEPS);
        setCompanyLots([]);
        setShowAddCompanyForm(false);
        fetchCompaniesList();
        if (onRefreshCompanies) onRefreshCompanies();
        if (onRefreshLots) onRefreshLots();
      } else {
        showToast(data.error || 'Failed to create company.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to company API.', 'danger');
    }
  };

  // Save/Update Workflow steps
  const handleUpdateWorkflowSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEditCompany) return;

    try {
      const res = await apiFetch(`/api/stock/clients/${selectedEditCompany.id}/steps`, {
        method: 'PUT',
        body: JSON.stringify({
          steps: workflowSteps
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Company workflow steps updated successfully!');
        setSelectedEditCompany(null);
        fetchCompaniesList();
      } else {
        showToast(data.error || 'Failed to update steps.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating workflow steps.', 'danger');
    }
  };

  // Add Lot to selected company
  const handleAddLotToCompany = async (e) => {
    e.preventDefault();
    if (!newLotForm.lot_no) {
      showToast('Lot number is required.', 'danger');
      return;
    }
    if (!selectedEditCompany) return;

    try {
      const res = await apiFetch('/api/stock/inward', {
        method: 'POST',
        body: JSON.stringify({
          lot_no: parseInt(newLotForm.lot_no),
          batch_no: newLotForm.batch_no || 'Default_Batch',
          pixel_pitch: newLotForm.pixel_pitch || 'P5.9',
          client_name: selectedEditCompany.name,
          qty_sent: parseInt(newLotForm.qty_sent || 0),
          qty_received: parseInt(newLotForm.received_qty || 0),
          remarks: newLotForm.remarks || ''
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Lot ${newLotForm.lot_no} created and registered under ${selectedEditCompany.name}!`);
        setNewLotForm({ lot_no: '', batch_no: '', pixel_pitch: 'P5.9', qty_sent: '', received_qty: '', remarks: '' });
        if (onRefreshLots) onRefreshLots();
      } else {
        showToast(data.error || 'Failed to add lot.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error adding lot.', 'danger');
    }
  };

  const previewFirstName = newUserForm.firstName?.trim() || '';
  const previewLastName = newUserForm.lastName?.trim() || '';
  const capitalizeWord = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };
  const previewFormattedFirstName = previewFirstName.split(' ').map(capitalizeWord).join(' ');
  const previewFormattedLastName = previewLastName.split(' ').map(capitalizeWord).join(' ');
  const previewName = (previewFirstName || previewLastName) 
    ? `${previewFormattedFirstName} ${previewFormattedLastName}`.trim() 
    : '';

  const previewCleanFirstName = previewFirstName.toLowerCase().replace(/\s+/g, '');
  const previewFirstLetter = previewLastName ? previewLastName.charAt(0).toLowerCase() : '';
  const previewEmail = previewFirstName 
    ? `${previewCleanFirstName}.${previewFirstLetter || '?' }@electrolytesoln.com` 
    : '';
  const defaultPassword = 'Electrolyte2026!';

  if (user?.role === 'Employee') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>
        <div>You do not have administrative access privileges to configure system directories.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="app-header" style={{ marginBottom: 12 }}>
        <div>
          <span className="app-subtitle">Administrative Controls</span>
          <h1 className="app-title"><Users size={20} color='var(--color-primary)' /> Command & Settings Control Center</h1>
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--card-border)', paddingBottom: 12 }}>
        <button 
          onClick={() => { setActiveTab('users'); setSelectedEditCompany(null); setShowAddCompanyForm(false); }}
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ width: 'auto', margin: 0, padding: '8px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Users size={14} /> System Users Directory
        </button>
        <button 
          onClick={() => { setActiveTab('companies'); setSelectedEditCompany(null); setShowAddCompanyForm(false); }}
          className={`btn ${activeTab === 'companies' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ width: 'auto', margin: 0, padding: '8px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Briefcase size={14} /> Companies & Custom Workflows
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="widescreen-grid">
          {/* Left Column: Create New Account Form */}
          <div className="glass-panel" style={{ padding: 20, height: 'fit-content' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Provision New Team Member
            </h3>
            
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>First Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Mayuri"
                    value={newUserForm.firstName || ''}
                    onChange={e => setNewUserForm({...newUserForm, firstName: e.target.value})}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Last Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Sharma"
                    value={newUserForm.lastName || ''}
                    onChange={e => setNewUserForm({...newUserForm, lastName: e.target.value})}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {(previewFirstName || previewLastName) && (
                <div className="glass-panel" style={{
                  padding: '16px',
                  background: 'rgba(255, 212, 0, 0.02)',
                  borderColor: 'rgba(255, 212, 0, 0.15)',
                  borderRadius: '12px',
                  marginTop: '2px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <ShieldCheck size={14} color='var(--color-primary)' /> Automated Vitals Preview
                    </span>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '12px', fontWeight: 700 }}>
                      Ready to Sync
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: '0.8rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Display Name:</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{previewName || '—'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: '0.8rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Login Email:</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>{previewEmail || '—'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Login Password:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                          {showPassword ? defaultPassword : '••••••••••••••••'}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)} 
                          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '0 4px', fontSize: '0.7rem', fontWeight: 700 }}
                        >
                          {showPassword ? 'HIDE' : 'SHOW'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Access Role</label>
                <select
                  value={newUserForm.role}
                  onChange={e => setNewUserForm({...newUserForm, role: e.target.value})}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--input-bg)', color: 'var(--text-main)', borderRadius: 8, border: '1px solid var(--card-border)', cursor: 'pointer' }}
                >
                  <option value="Employee">Employee (Operations Terminal Entry Only)</option>
                  <option value="Team Lead">Team Lead (Operation Entry + Highest Configuration/Approval Authority)</option>
                  <option value="Manager">Manager (Operation Entry + final Step approvals)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Starting Attendance Rating (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  min="0"
                  max="100"
                  required 
                  placeholder="e.g. 95.0"
                  value={newUserForm.attendance_rate}
                  onChange={e => setNewUserForm({...newUserForm, attendance_rate: e.target.value})}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={isSubmittingUser}
                style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {isSubmittingUser ? (
                  <>
                    <RefreshCw size={14} className="spin" /> Provisioning Account...
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Provision Team Member
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Accounts Directory */}
          <div className="glass-panel" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={16} /> Active System Accounts ({adminUsers.length})
            </h3>

            {adminUsersLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', flexDirection: 'column', gap: 12 }}>
                <RefreshCw className="spin" size={24} color='var(--color-primary)' />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Refreshing Directory...</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
                {adminUsers.map((item) => {
                  let badgeClass = 'badge-success';
                  if (item.role === 'Team Lead') badgeClass = 'badge-warning';
                  else if (item.role === 'Manager') badgeClass = 'badge-info';
                  else if (item.role === 'Superadmin') badgeClass = 'badge-danger';

                  const isSelf = item.id === user?.id;

                  return (
                    <div 
                      key={item.id} 
                      className="leader-item glass-panel" 
                      style={{ 
                        background: item.is_active ? 'rgba(255,255,255,0.01)' : 'rgba(239, 68, 68, 0.02)', 
                        borderRadius: 12, 
                        border: item.is_active ? '1px solid rgba(255,255,255,0.02)' : '1px solid rgba(239, 68, 68, 0.08)',
                        margin: 0,
                        opacity: item.is_active ? 1 : 0.65,
                        padding: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={item.avatar} alt={item.name} className="leader-avatar" style={{ width: 36, height: 36, border: '1.5px solid rgba(255,255,255,0.05)' }} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="leader-name" style={{ fontSize: '0.8rem', fontWeight: 800 }}>{item.name}</span>
                              <span className={`badge ${badgeClass}`} style={{ fontSize: '0.52rem', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {item.role}
                              </span>
                              {isSelf && (
                                <span style={{ fontSize: '0.55rem', background: 'var(--card-bg)', color: 'var(--text-main)', padding: '1px 4px', borderRadius: 4 }}>
                                  You
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
                              {item.email} • Attendance: {parseFloat(item.attendance_rate)}%
                            </span>
                          </div>
                        </div>

                        <div>
                          <button
                            onClick={() => handleToggleUserStatus(item.id)}
                            disabled={isSelf}
                            style={{
                              background: item.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              border: `1px solid ${item.is_active ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                              color: item.is_active ? '#10b981' : '#ef4444',
                              padding: '4px 10px',
                              borderRadius: '30px',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              opacity: isSelf ? 0.4 : 1
                            }}
                            title={isSelf ? "You cannot deactivate your own account" : `Click to ${item.is_active ? 'deactivate' : 'activate'} this user`}
                          >
                            {item.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div>
          {!selectedEditCompany && !showAddCompanyForm && (
            <div className="glass-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: 12, marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                  <Briefcase size={16} /> Registered Clients / Companies Directory
                </h3>
                <button 
                  onClick={() => { setShowAddCompanyForm(true); setWorkflowSteps(DEFAULT_12_STEPS); setCompanyLots([]); }}
                  className="btn btn-primary"
                  style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <PlusCircle size={14} /> Add Company
                </button>
              </div>

              {companiesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', flexDirection: 'column', gap: 12 }}>
                  <RefreshCw className="spin" size={24} color='var(--color-primary)' />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading Companies...</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {companies.map((c) => (
                    <div 
                      key={c.id} 
                      className="glass-panel" 
                      onClick={async () => {
                        setSelectedEditCompany(c);
                        try {
                          const res = await apiFetch(`/api/stock/clients/${c.id}/steps`);
                          if (res.ok) {
                            const stepsData = await res.json();
                            setWorkflowSteps(stepsData.length > 0 ? stepsData : DEFAULT_12_STEPS);
                          }
                        } catch (err) {
                          console.error(err);
                          setWorkflowSteps(DEFAULT_12_STEPS);
                        }
                      }}
                      style={{ padding: 16, cursor: 'pointer', border: '1px solid var(--card-border)', borderRadius: 12, transition: 'transform 0.2s' }}
                    >
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>{c.name}</h4>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><strong>Contact:</strong> {c.contact || 'N/A'}</div>
                        <div><strong>Email:</strong> {c.email || 'N/A'}</div>
                        <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 8px', background: 'rgba(255, 212, 0, 0.08)', border: '1px solid rgba(255, 212, 0, 0.2)', borderRadius: 20, color: 'var(--color-primary)', width: 'fit-content', fontWeight: 700 }}>
                          Custom Steps Defined
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showAddCompanyForm && (
            <div className="glass-panel" style={{ padding: 20 }}>
              <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: 10, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                  <PlusCircle size={16} /> Register New Company & Workflow Setup
                </h3>
                <button 
                  onClick={() => setShowAddCompanyForm(false)} 
                  className="btn btn-secondary" 
                  style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  Back to Directory
                </button>
              </div>

              <form onSubmit={handleAddCompanySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Basic Company Details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <div className="form-group">
                    <label>Company / Brand Name</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Havells"
                      value={newCompanyForm.name}
                      onChange={e => setNewCompanyForm({ ...newCompanyForm, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Rajesh Kumar"
                      value={newCompanyForm.contact}
                      onChange={e => setNewCompanyForm({ ...newCompanyForm, contact: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Email</label>
                    <input 
                      type="email" 
                      placeholder="e.g. rajesh@havells.com"
                      value={newCompanyForm.email}
                      onChange={e => setNewCompanyForm({ ...newCompanyForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <hr style={{ border: 'none', borderBottom: '1px solid var(--card-border)', margin: '10px 0' }} />

                {/* Drag-and-drop/Reorderable Steps Editor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Customize Repair Workflow Steps ({workflowSteps.length} Steps)</h4>
                    <button 
                      type="button" 
                      onClick={handleAddStep}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <PlusCircle size={12} /> Add Custom Step
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 12, maxHeight: 350, overflowY: 'auto' }}>
                    {workflowSteps.map((step, index) => (
                      <div key={step.step_no} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 8 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', width: 60 }}>Step {step.step_no}:</span>
                        <input 
                          type="text" 
                          required 
                          value={step.name} 
                          onChange={(e) => handleStepNameChange(index, e.target.value)}
                          style={{ flex: 1, padding: '6px 12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: '0.75rem', color: '#fff' }}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button 
                            type="button" 
                            disabled={index === 0}
                            onClick={() => handleMoveStepUp(index)}
                            style={{ background: 'none', border: 'none', color: index === 0 ? 'var(--text-muted)' : 'var(--color-primary)', cursor: index === 0 ? 'not-allowed' : 'pointer', padding: 4 }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button 
                            type="button" 
                            disabled={index === workflowSteps.length - 1}
                            onClick={() => handleMoveStepDown(index)}
                            style={{ background: 'none', border: 'none', color: index === workflowSteps.length - 1 ? 'var(--text-muted)' : 'var(--color-primary)', cursor: index === workflowSteps.length - 1 ? 'not-allowed' : 'pointer', padding: 4 }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteStep(index)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <hr style={{ border: 'none', borderBottom: '1px solid var(--card-border)', margin: '10px 0' }} />

                {/* Initial Lot Imports */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Register Initial Production Lots (Optional)</h4>
                    <button 
                      type="button" 
                      onClick={handleAddLotRow}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <PlusCircle size={12} /> Add Lot Row
                    </button>
                  </div>

                  {companyLots.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: 16, border: '1px dashed var(--card-border)', borderRadius: 12 }}>
                      No lots added yet. (You can also inward lots later using the standard Inward tool).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {companyLots.map((lot, index) => (
                        <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr)) 40px', gap: 10, padding: 12, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: 10, alignItems: 'center' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.62rem', marginBottom: 4 }}>Lot No.</label>
                            <input 
                              type="number" 
                              required 
                              placeholder="e.g. 21" 
                              value={lot.lot_no}
                              onChange={e => handleLotRowChange(index, 'lot_no', e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.62rem', marginBottom: 4 }}>Batch Code</label>
                            <input 
                              type="text" 
                              placeholder="e.g. B-01" 
                              value={lot.batch_no}
                              onChange={e => handleLotRowChange(index, 'batch_no', e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.62rem', marginBottom: 4 }}>Pixel Pitch</label>
                            <select 
                              value={lot.pixel_pitch}
                              onChange={e => handleLotRowChange(index, 'pixel_pitch', e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 6 }}
                            >
                              <option value="P5.9">P5.9</option>
                              <option value="P4.8">P4.8</option>
                              <option value="P3.9">P3.9</option>
                              <option value="P2.5">P2.5</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.62rem', marginBottom: 4 }}>Qty Sent</label>
                            <input 
                              type="number" 
                              value={lot.qty_sent}
                              onChange={e => handleLotRowChange(index, 'qty_sent', e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.62rem', marginBottom: 4 }}>Qty Received</label>
                            <input 
                              type="number" 
                              value={lot.received_qty}
                              onChange={e => handleLotRowChange(index, 'received_qty', e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.62rem', marginBottom: 4 }}>Remarks</label>
                            <input 
                              type="text" 
                              placeholder="Remarks" 
                              value={lot.remarks}
                              onChange={e => handleLotRowChange(index, 'remarks', e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            />
                          </div>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveLotRow(index)}
                            style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'end', marginBottom: 2 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'end', width: 'auto', padding: '10px 20px', marginTop: 12 }}
                >
                  <PlusCircle size={14} /> Register Company & Save Custom Workflow
                </button>
              </form>
            </div>
          )}

          {selectedEditCompany && (
            <div className="widescreen-grid">
              {/* Left Column: Edit Custom Steps */}
              <div className="glass-panel" style={{ padding: 20 }}>
                <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: 10, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Settings size={16} /> Customize {selectedEditCompany.name} Steps
                  </h3>
                  <button 
                    onClick={() => setSelectedEditCompany(null)} 
                    className="btn btn-secondary" 
                    style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.75rem' }}
                  >
                    Back to Directory
                  </button>
                </div>

                <form onSubmit={handleUpdateWorkflowSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Arrange, rename, add, or delete workflow steps:</span>
                    <button 
                      type="button" 
                      onClick={handleAddStep}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <PlusCircle size={12} /> Add Custom Step
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 12, maxHeight: 380, overflowY: 'auto' }}>
                    {workflowSteps.map((step, index) => (
                      <div key={step.step_no} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 8 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', width: 60 }}>Step {step.step_no}:</span>
                        <input 
                          type="text" 
                          required 
                          value={step.name} 
                          onChange={(e) => handleStepNameChange(index, e.target.value)}
                          style={{ flex: 1, padding: '6px 12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: '0.75rem', color: '#fff' }}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button 
                            type="button" 
                            disabled={index === 0}
                            onClick={() => handleMoveStepUp(index)}
                            style={{ background: 'none', border: 'none', color: index === 0 ? 'var(--text-muted)' : 'var(--color-primary)', cursor: index === 0 ? 'not-allowed' : 'pointer', padding: 4 }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button 
                            type="button" 
                            disabled={index === workflowSteps.length - 1}
                            onClick={() => handleMoveStepDown(index)}
                            style={{ background: 'none', border: 'none', color: index === workflowSteps.length - 1 ? 'var(--text-muted)' : 'var(--color-primary)', cursor: index === workflowSteps.length - 1 ? 'not-allowed' : 'pointer', padding: 4 }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteStep(index)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    style={{ alignSelf: 'end', width: 'auto', padding: '8px 16px', fontSize: '0.8rem', marginTop: 8 }}
                  >
                    Save Custom Workflow Steps
                  </button>
                </form>
              </div>

              {/* Right Column: Register Lots to selected company */}
              <div className="glass-panel" style={{ padding: 20, height: 'fit-content' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PlusCircle size={16} /> Inward New Lot for {selectedEditCompany.name}
                </h3>

                <form onSubmit={handleAddLotToCompany} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label>Lot Number</label>
                      <input 
                        type="number" 
                        required 
                        placeholder="e.g. 25" 
                        value={newLotForm.lot_no}
                        onChange={e => setNewLotForm({ ...newLotForm, lot_no: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Batch Code</label>
                      <input 
                        type="text" 
                        placeholder="e.g. BAT-25" 
                        value={newLotForm.batch_no}
                        onChange={e => setNewLotForm({ ...newLotForm, batch_no: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: 12 }}>
                    <div className="form-group">
                      <label>Pixel Pitch</label>
                      <select 
                        value={newLotForm.pixel_pitch}
                        onChange={e => setNewLotForm({ ...newLotForm, pixel_pitch: e.target.value })}
                        style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', borderRadius: 8, width: '100%', cursor: 'pointer' }}
                      >
                        <option value="P5.9">P5.9</option>
                        <option value="P4.8">P4.8</option>
                        <option value="P3.9">P3.9</option>
                        <option value="P2.5">P2.5</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Qty Sent</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 500" 
                        value={newLotForm.qty_sent}
                        onChange={e => setNewLotForm({ ...newLotForm, qty_sent: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Qty Received</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 498" 
                        value={newLotForm.received_qty}
                        onChange={e => setNewLotForm({ ...newLotForm, received_qty: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Remarks</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Initial lot consignment" 
                      value={newLotForm.remarks}
                      onChange={e => setNewLotForm({ ...newLotForm, remarks: e.target.value })}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}
                  >
                    <PlusCircle size={14} /> Register Lot Inward
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
