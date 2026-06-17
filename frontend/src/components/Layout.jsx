import { NavLink, Outlet } from 'react-router-dom';
import { BarChart2, Wallet, Briefcase, History, Settings, Zap, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const nav = [
  { to: '/', label: 'ETF Market', icon: BarChart2 },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/history', label: 'History', icon: History },
  { to: '/auto-trade', label: 'Auto Trade', icon: Zap },
  { to: '/manage', label: 'Manage ETFs', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <BarChart2 size={18} color="#fff" />
          </div>
          <div className="sidebar-logo-text">
            <p>Mahesh Kaushik</p>
            <p>ETF Ki Dukan</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user">
              {user.avatar
                ? <img src={user.avatar} alt={user.name} className="sidebar-avatar" referrerPolicy="no-referrer" />
                : <div className="sidebar-avatar-placeholder">{user.name?.[0]?.toUpperCase()}</div>
              }
              <div className="sidebar-user-info">
                <p className="sidebar-user-name">{user.name}</p>
                <p className="sidebar-user-email">{user.email}</p>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94a3b8', borderRadius: 6, outline: 'none', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
          <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>Demo · Yahoo Finance</p>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
