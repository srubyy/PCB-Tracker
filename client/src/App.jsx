import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';

// Import Shared components
import NavigationHeader from './shared/NavigationHeader';
import BottomNavigation from './shared/BottomNavigation';
import ToastNotification from './shared/ToastNotification';

// Import Pages
import AuthPage from './pages/Auth/AuthPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import LotsPage from './pages/Lots/LotsPage';
import WorkflowsPage from './pages/Workflows/WorkflowsPage';
import EngineersPage from './pages/Engineers/EngineersPage';
import SettingsPage from './pages/Settings/SettingsPage';
import LotSetupWizard from './pages/LotSetup/LotSetupWizard';

function App() {
  const { user, loading, apiFetch } = useAuth();
  const [view, setView] = useState(() => localStorage.getItem('es_app_view') || 'dashboard');
  const [searchLotNo, setSearchLotNo] = useState('');
  const [searchSrNo, setSearchSrNo] = useState('');
  const [lots, setLots] = useState([]);
  const [globalLotNo, setGlobalLotNo] = useState(() => localStorage.getItem('es_app_global_lot_no') || '');
  const [selectedCompany, setSelectedCompany] = useState(() => localStorage.getItem('es_app_selected_company') || '');
  const [notification, setNotification] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    localStorage.setItem('es_app_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('es_app_global_lot_no', globalLotNo);
  }, [globalLotNo]);

  useEffect(() => {
    localStorage.setItem('es_app_selected_company', selectedCompany);
  }, [selectedCompany]);

  const fetchLotsList = async () => {
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

  const fetchClientsList = async () => {
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

  useEffect(() => {
    if (user) {
      fetchLotsList();
      fetchClientsList();
    }
  }, [user]);

  useEffect(() => {
    if (globalLotNo) {
      setSearchLotNo(globalLotNo);
    }
  }, [globalLotNo]);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    if (user) {
      if (user.role === 'Employee') {
        setView('repair');
      } else {
        setView('dashboard');
      }
    }
  }, [user]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0b0f19', color: 'var(--color-primary)', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ border: '4px solid rgba(255, 212, 0, 0.1)', borderLeftColor: 'var(--color-primary)', borderRadius: '50%', width: 40, height: 40, animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}></div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <div>Initializing System...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ToastNotification notification={notification} />
        <AuthPage showToast={showToast} />
      </>
    );
  }

  return (
    <div className="app-layout">
      {/* Top desktop header bar */}
      <NavigationHeader view={view} setView={setView} showToast={showToast} />
      
      {/* Main Container Area */}
      <main className="app-main-content">
        <ToastNotification notification={notification} />

        {/* Global Lot Selection Dropdown */}
        {user && (
          <div className="global-lot-selector-card" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            background: 'rgba(255, 212, 0, 0.02)',
            border: '1px solid var(--card-border)',
            borderRadius: 10,
            marginBottom: 18,
            gap: 12,
            flexWrap: 'wrap',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: globalLotNo ? 'var(--color-primary)' : '#475569',
                boxShadow: globalLotNo ? '0 0 10px var(--color-primary)' : 'none'
              }}></span>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Active Factory Scope:
              </span>
              <strong style={{ fontSize: '0.82rem', color: '#fff' }}>
                {globalLotNo ? `Lot ${globalLotNo}` : (selectedCompany ? `All ${selectedCompany} Lots` : 'All Lots (Global Factory View)')}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label htmlFor="global-company-select" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Company:</label>
                <select
                  id="global-company-select"
                  value={selectedCompany}
                  onChange={(e) => {
                    setSelectedCompany(e.target.value);
                    setGlobalLotNo('');
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text-main)',
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    minWidth: '150px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <option value="">-- Select Company --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label htmlFor="global-lot-select" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Filter by Lot:</label>
                <select
                  id="global-lot-select"
                  value={globalLotNo}
                  disabled={!selectedCompany}
                  onChange={(e) => setGlobalLotNo(e.target.value)}
                  style={{
                    padding: '8px 16px',
                    background: !selectedCompany ? 'rgba(255,255,255,0.02)' : 'var(--input-bg)',
                    border: '1px solid var(--card-border)',
                    color: !selectedCompany ? 'var(--text-muted)' : 'var(--text-main)',
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    cursor: !selectedCompany ? 'not-allowed' : 'pointer',
                    minWidth: '180px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <option value="">All Lots (Global View)</option>
                  {Array.isArray(lots) && lots
                    .filter(l => {
                      const matchesCompany = selectedCompany ? l.client_name && l.client_name.toLowerCase().includes(selectedCompany.toLowerCase()) : false;
                      if (user && user.role === 'Employee') {
                        return matchesCompany && l.status === 'Active';
                      }
                      return matchesCompany;
                    })
                    .map(l => (
                      <option key={l.id} value={l.lot_no}>Lot {l.lot_no}</option>
                    ))
                  }
                </select>
              </div>
            </div>
          </div>
        )}
        
        {view === 'dashboard' && (
          <DashboardPage 
            setView={setView} 
            selectedLotNo={globalLotNo}
            selectedCompany={selectedCompany}
            setSearchLotNo={setSearchLotNo}
            setSearchSrNo={setSearchSrNo}
            showToast={showToast} 
          />
        )}
        {view === 'stock' && (
          <LotsPage 
            selectedLotNo={globalLotNo}
            selectedCompany={selectedCompany}
            showToast={showToast}
            onRefreshLots={fetchLotsList}
          />
        )}
        {view === 'repair' && (
          <WorkflowsPage 
            selectedLotNo={globalLotNo}
            selectedCompany={selectedCompany}
            onChangeLot={setGlobalLotNo}
            showToast={showToast} 
          />
        )}
        {view === 'setup' && (
          <LotSetupWizard 
            showToast={showToast} 
            apiFetch={apiFetch}
            onRefreshLots={fetchLotsList}
          />
        )}

        {view === 'leaderboard' && (
          <EngineersPage showToast={showToast} />
        )}
        {view === 'users' && ['Superadmin', 'Manager', 'Team Lead'].includes(user.role) && (
          <SettingsPage 
            showToast={showToast} 
            onRefreshCompanies={fetchClientsList}
            onRefreshLots={fetchLotsList}
          />
        )}
      </main>
      
      {/* Bottom mobile navigation menu */}
      <BottomNavigation view={view} setView={setView} />
    </div>
  );
}

export default App;
