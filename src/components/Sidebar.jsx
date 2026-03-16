import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../rbac/usePermission';
import Avatar from './Avatar';

// ─── Nav Items ─────────────────────────────────────────────────────────────────
// permission: null means always visible; 'reports' uses canAny logic (see below)
const NAV_ALL = [
  {
    to: '/',
    label: 'Dashboard',
    permission: null,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>
      </svg>
    ),
  },
  {
    to: '/employees',
    label: 'Employees',
    permission: 'employees:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/>
      </svg>
    ),
  },
  {
    to: '/leave',
    label: 'Leave Requests',
    permission: 'leave:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>
    ),
  },
  {
    to: '/attendance',
    label: 'Attendance',
    permission: 'attendance:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
      </svg>
    ),
  },
  {
    to: '/timesheets',
    label: 'Timesheets',
    permission: 'timesheets:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>
      </svg>
    ),
  },
  {
    to: '/day-requests',
    label: 'Day Requests',
    permission: 'day_requests:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/>
      </svg>
    ),
  },
  {
    to: '/payslips',
    label: 'Payslips',
    permission: 'payslips:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
      </svg>
    ),
  },
  {
    to: '/payroll',
    label: 'Payroll',
    permission: 'payroll:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    ),
  },
  {
    to: '/audit',
    label: 'Audit View',
    permission: 'audit:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>
      </svg>
    ),
  },
  {
    to: '/appraisals',
    label: 'Appraisals',
    permission: 'appraisals:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
  {
    to: '/recruitment',
    label: 'Recruitment',
    permission: 'recruitment:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    to: '/expenses',
    label: 'Expenses',
    permission: 'expenses:read',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    to: '/reports',
    label: 'Reports',
    permission: '__reports__',  // special: handled below with canAny
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
];

const ProfileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20v-1a8 8 0 0116 0v1"/>
  </svg>
);

const ROLE_BADGE = {
  admin:           { label: 'Admin',           cls: 'role-badge-admin' },
  ceo:             { label: 'CEO',             cls: 'role-badge-admin' },
  hr_manager:      { label: 'HR Manager',      cls: 'role-badge-admin' },
  finance_manager: { label: 'Finance Manager', cls: 'role-badge-finance' },
  it_manager:      { label: 'IT Manager',      cls: 'role-badge-admin' },
  audit_manager:   { label: 'Audit Manager',   cls: 'role-badge-audit' },
  employee:        { label: 'Employee',        cls: 'role-badge-employee' },
};

export default function Sidebar({ open, onClose }) {
  const { employee, logout } = useAuth();
  const { can, canAny, role } = usePermission();
  const navigate = useNavigate();

  const visibleNav = NAV_ALL.filter((item) => {
    if (item.permission === null) return true;
    if (item.permission === '__reports__') {
      return canAny(['reports:hr', 'reports:finance', 'reports:executive']);
    }
    return can(item.permission);
  });

  const goToProfile = () => {
    if (employee?.name) {
      navigate(`/employees/${employee.name}`);
      onClose();
    }
  };

  const badge = ROLE_BADGE[role];

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/afaq_logo.png" alt="Afaq Al-Fiker" className="brand-logo-img" />
          <span className="brand-name">AFAQ ALFIKER</span>
        </div>

        {/* Role Badge */}
        {badge && (
          <div className="sidebar-role-badge">
            <span className={`role-badge ${badge.cls}`}>{badge.label}</span>
          </div>
        )}

        <nav className="sidebar-nav">
          {visibleNav.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}

          {employee?.name && role !== 'audit_manager' && (
            <button className="nav-item nav-item-btn" onClick={goToProfile}>
              <span className="nav-icon"><ProfileIcon /></span>
              <span className="nav-label">My Profile</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          {employee && (
            <button className="sidebar-user sidebar-user-btn" onClick={goToProfile} title="Edit my profile">
              <Avatar name={employee.employee_name} image={employee.image} size={36} />
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{employee.employee_name}</span>
                <span className="sidebar-user-dept">{employee.department}</span>
              </div>
              <span className="profile-edit-hint">✏️</span>
            </button>
          )}
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </aside>
    </>
  );
}
