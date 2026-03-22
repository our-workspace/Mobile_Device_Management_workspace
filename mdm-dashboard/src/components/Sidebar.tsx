// src/components/Sidebar.tsx
import { useNavigate, useLocation } from 'react-router-dom';
import { useDashboardStore } from '../store/dashboardStore';

const navItems = [
  { path: '/devices', icon: '📱', label: 'Devices' },
  { path: '/commands', icon: '⚡', label: 'Commands Log' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, clearAuth } = useDashboardStore();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const initials = admin?.username?.charAt(0).toUpperCase() ?? 'A';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🛡️</div>
        <div>
          <div className="sidebar-logo-text">MDM Console</div>
          <div className="sidebar-logo-sub">Device Management</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Management</div>
        {navItems.map((item) => (
          <div
            key={item.path}
            className={`sidebar-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={handleLogout} title="Logout">
          <div className="sidebar-user-avatar">{initials}</div>
          <div>
            <div className="sidebar-user-name">{admin?.username ?? 'Admin'}</div>
            <div className="sidebar-user-role">{admin?.role ?? ''} · Logout</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
