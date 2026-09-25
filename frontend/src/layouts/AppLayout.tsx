import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface SidebarItem {
  to: string;
  icon: string;
  label: string;
  id: string;
}

const navItems: SidebarItem[] = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard', id: 'nav-dashboard' },
  { to: '/interactions', icon: '⚡', label: 'Interactions', id: 'nav-interactions' },
  { to: '/commands', icon: '⌨️', label: 'Commands', id: 'nav-commands' },
  { to: '/settings', icon: '⚙️', label: 'Settings', id: 'nav-settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const userInitial = user?.email?.[0]?.toUpperCase() ?? 'A';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🤖</div>
          <div>
            <div className="brand-name">Bot Dashboard</div>
            <div className="brand-sub">Abstrabit Technologies</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              id={item.id}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{userInitial}</div>
            <div className="user-details">
              <div className="user-email" title={user?.email}>{user?.email}</div>
              <div className="user-role">{user?.role}</div>
            </div>
            <button
              id="logout-btn"
              className="logout-btn"
              onClick={handleLogout}
              title="Sign out"
            >
              ↩
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="page-content animate-in">
          {children}
        </div>
      </main>
    </div>
  );
}
