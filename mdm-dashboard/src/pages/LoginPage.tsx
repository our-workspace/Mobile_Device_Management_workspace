// src/pages/LoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useDashboardStore } from '../store/dashboardStore';

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useDashboardStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.login(username, password);
      setAuth(res.data.admin as any, res.data.token);
      navigate('/devices');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">🛡️</div>
          <div>
            <div className="login-title">MDM Console</div>
            <div className="login-subtitle">Mobile Device Management</div>
          </div>
        </div>

        {/* Error */}
        {error && <div className="login-error">⚠️ {error}</div>}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              className="form-input"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            id="login-btn"
            type="submit"
            className="btn btn-primary w-full mt-4"
            disabled={loading}
            style={{ justifyContent: 'center', padding: '11px' }}
          >
            {loading ? <><span className="spinner" style={{width:16,height:16}} /> Signing in...</> : '→ Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: '12px', background: 'rgba(59,130,246,0.08)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Development credentials</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            admin / admin123
          </div>
        </div>
      </div>
    </div>
  );
}
