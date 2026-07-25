import React, { useState } from 'react';
import { Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const AuthPage = ({ showToast }) => {
  const { login } = useAuth();
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await login(loginEmail, loginPassword);
      showToast('Logged in successfully!');
    } catch (err) {
      setLoginError(err.message || 'Invalid credentials or connection failure.');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 450 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <span className="app-subtitle" style={{ fontSize: '0.75rem' }}>Factory Portal</span>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Lock color='var(--color-primary)' size={24} />
            Security Guard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
            Please authenticate to access factory board tracking and operations terminal.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '24px 20px', borderColor: 'rgba(255, 212, 0, 0.25)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 16, borderBottom: '1px solid var(--card-border)', paddingBottom: 8 }}>Sign In</h3>
          
          <form onSubmit={handleLoginSubmit}>
            {loginError && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239, 68, 68, 0.05)', padding: 8, borderRadius: 8 }}>
                <AlertCircle size={14} /> {loginError}
              </div>
            )}

            <div className="form-group">
              <label>Corporate Email</label>
              <input 
                type="email" 
                required 
                placeholder="e.g. rahul.gupta@electrolytesoln.com"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn" disabled={loginLoading}>
              {loginLoading ? 'Verifying Context...' : 'Authenticate'}
            </button>
          </form>
        </div>

        {/* Login Helper Note */}
        <div style={{ marginTop: 24, padding: 12, background: 'var(--card-bg)', borderRadius: 12, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <div style={{ fontWeight: 800, color: 'var(--color-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={10} /> Operator Cheat Sheet:</div>
          - Team Lead Account: <span style={{ color: 'var(--text-main)' }}>rahul.gupta@electrolytesoln.com</span> / <span style={{ color: 'var(--text-main)' }}>Electrolyte2026!</span><br/>
          - Engineer Account 1: <span style={{ color: 'var(--text-main)' }}>mayuri.s@electrolytesoln.com</span> / <span style={{ color: 'var(--text-main)' }}>Electrolyte2026!</span><br/>
          - Engineer Account 2: <span style={{ color: 'var(--text-main)' }}>akash.p@electrolytesoln.com</span> / <span style={{ color: 'var(--text-main)' }}>Electrolyte2026!</span><br/>
          - Engineer Account 3: <span style={{ color: 'var(--text-main)' }}>nilam.dhanavde@electrolytesoln.com</span> / <span style={{ color: 'var(--text-main)' }}>Electrolyte2026!</span><br/>
          - Engineer Account 4: <span style={{ color: 'var(--text-main)' }}>usha.m@electrolytesoln.com</span> / <span style={{ color: 'var(--text-main)' }}>Electrolyte2026!</span><br/>
          - Engineer Account 5: <span style={{ color: 'var(--text-main)' }}>swarupa.vishwakarma@electrolytesoln.com</span> / <span style={{ color: 'var(--text-main)' }}>Electrolyte2026!</span>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
