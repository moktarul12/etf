import { NavLink, Outlet } from 'react-router-dom';
import { BarChart2, Wallet, Briefcase, History, Settings, Zap } from 'lucide-react';

const nav = [
  { to: '/', label: 'ETF Market', icon: BarChart2 },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/history', label: 'History', icon: History },
  { to: '/auto-trade', label: 'Auto Trade', icon: Zap },
  { to: '/manage', label: 'Manage ETFs', icon: Settings },
];

export default function Layout() {
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
          <p>Demo Mode · Data: Yahoo Finance</p>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
