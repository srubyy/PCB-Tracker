import React from 'react';
import { LayoutDashboard, Package, Wrench, ShieldCheck, Trophy, Users, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BottomNavigation = ({ view, setView }) => {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="bottom-nav">
      {user.role !== 'Employee' && (
        <button 
          onClick={() => setView('dashboard')} 
          className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
        >
          <LayoutDashboard />
          Dashboard
        </button>
      )}
      {user.role !== 'Employee' && (
        <button 
          onClick={() => setView('stock')} 
          className={`nav-item ${view === 'stock' ? 'active' : ''}`}
        >
          <Package />
          Stock
        </button>
      )}
      {user.role !== 'Employee' && (
        <button 
          onClick={() => setView('setup')} 
          className={`nav-item ${view === 'setup' ? 'active' : ''}`}
        >
          <FileSpreadsheet />
          Lot Setup
        </button>
      )}
      <button 
        onClick={() => setView('repair')} 
        className={`nav-item ${view === 'repair' ? 'active' : ''}`}
      >
        <Wrench />
        Repair
      </button>
      


      <button 
        onClick={() => setView('leaderboard')} 
        className={`nav-item ${view === 'leaderboard' ? 'active' : ''}`}
      >
        <Trophy />
        Trophy
      </button>

      {user.role === 'Team Lead' && (
        <button 
          onClick={() => setView('users')} 
          className={`nav-item ${view === 'users' ? 'active' : ''}`}
        >
          <Users />
          Users
        </button>
      )}
    </div>
  );
};

export default BottomNavigation;
