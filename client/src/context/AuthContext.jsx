import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const storedUser = sessionStorage.getItem('es_user');
    const storedToken = sessionStorage.getItem('es_access_token');
    
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setAccessToken(storedToken);
    }
    setLoading(false);
  }, []);

  // Login handler
  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed.');
      }
      
      // Persist state in sessionStorage
      sessionStorage.setItem('es_user', JSON.stringify(data.user));
      sessionStorage.setItem('es_access_token', data.accessToken);
      sessionStorage.setItem('es_refresh_token', data.refreshToken);
      
      setUser(data.user);
      setAccessToken(data.accessToken);
      return data.user;
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      if (accessToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      // Clear persistence regardless of request success
      sessionStorage.removeItem('es_user');
      sessionStorage.removeItem('es_access_token');
      sessionStorage.removeItem('es_refresh_token');
      
      setUser(null);
      setAccessToken(null);
    }
  };

  // Authenticated fetch wrapper with automated refresh rotation on 401
  const apiFetch = async (url, options = {}) => {
    // 1. Get token
    let currentToken = accessToken || sessionStorage.getItem('es_access_token');
    
    // Set headers
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const fetchOptions = {
      ...options,
      headers
    };

    // 2. Perform request
    let res = await fetch(url.startsWith('/api/') ? `${API_BASE_URL}${url}` : url, fetchOptions);

    // 3. Handle token expiry (401)
    if (res.status === 401) {
      console.log('Access token expired or unauthorized (401), attempting token refresh...');
      const storedRefreshToken = sessionStorage.getItem('es_refresh_token');
      
      if (!storedRefreshToken) {
        // No refresh token available, force logout
        logout();
        throw new Error('Session expired. Please log in again.');
      }

      try {
        // Attempt silent refresh
        const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefreshToken })
        });
        
        const refreshData = await refreshRes.json();
        
        if (refreshRes.ok && refreshData.accessToken) {
          console.log('Token refresh succeeded. Rotated access token received.');
          // Update persistence and state
          sessionStorage.setItem('es_access_token', refreshData.accessToken);
          sessionStorage.setItem('es_refresh_token', refreshData.refreshToken);
          setAccessToken(refreshData.accessToken);

          // 4. Retry original request with new access token
          headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
          res = await fetch(url.startsWith('/api/') ? `${API_BASE_URL}${url}` : url, {
            ...options,
            headers
          });
        } else {
          console.warn('Token refresh failed. Refresh token is likely expired or invalid.');
          logout();
          throw new Error('Session expired. Please log in again.');
        }
      } catch (err) {
        console.error('Refresh token request failed:', err);
        logout();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return res;
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
