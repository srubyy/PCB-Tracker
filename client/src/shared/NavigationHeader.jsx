import React from 'react';
import { LayoutDashboard, Package, Wrench, ShieldCheck, Trophy, Users, LogOut, User, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NavigationHeader = ({ view, setView, showToast }) => {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="app-navigation">
      <div className="app-brand">
        <span className="app-brand-dot"></span>
        <h1 className="app-brand-title">Electrolyte Solutions</h1>
      </div>

      {/* Desktop Navigation Tabs */}
      <nav className="app-nav-tabs">
        {user.role !== 'Employee' && (
          <button 
            onClick={() => setView('dashboard')} 
            className={`app-nav-tab ${view === 'dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
        )}
        {user.role !== 'Employee' && (
          <button 
            onClick={() => setView('stock')} 
            className={`app-nav-tab ${view === 'stock' ? 'active' : ''}`}
          >
            <Package size={18} /> Stock Summary
          </button>
        )}
        {user.role !== 'Employee' && (
          <button 
            onClick={() => setView('setup')} 
            className={`app-nav-tab ${view === 'setup' ? 'active' : ''}`}
          >
            <FileSpreadsheet size={18} /> Lot Setup
          </button>
        )}
        <button 
          onClick={() => setView('repair')} 
          className={`app-nav-tab ${view === 'repair' ? 'active' : ''}`}
        >
          <Wrench size={18} /> Repair Terminal
        </button>

        <button 
          onClick={() => setView('leaderboard')} 
          className={`app-nav-tab ${view === 'leaderboard' ? 'active' : ''}`}
        >
          <Trophy size={18} /> Leaderboard
        </button>
        {user.role === 'Team Lead' && (
          <button 
            onClick={() => setView('users')} 
            className={`app-nav-tab ${view === 'users' ? 'active' : ''}`}
          >
            <Users size={18} /> Users
          </button>
        )}
      </nav>

      {/* Profile Actions Widget */}
      <div className="header-profile-widget">
        <div className="profile-info">
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt="Operator avatar" 
              className="profile-avatar"
            />
          ) : (
            <div className="profile-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e8f0', color: '#64748b' }}>
              <User size={24} />
            </div>
          )}
          <div className="profile-details desktop-only-flex">
            <span className="profile-name">{user.name}</span>
            <span className="profile-role">{user.role}</span>
          </div>
        </div>
        
        <button 
          onClick={() => { logout(); showToast('Logged out successfully!'); }} 
          className="logout-btn"
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </header>
  );
};

export default NavigationHeader;
