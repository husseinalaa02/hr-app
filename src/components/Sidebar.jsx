import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../rbac/usePermission';
import Avatar from './Avatar';
import { useTranslation } from 'react-i18next';

const ProfileIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20v-1a8 8 0 0116 0v1"/>
  </svg>
);

export default function Sidebar({ open, onClose }) {
  const { employee, logout, customRoles } = useAuth();
  const { can, canAny, role } = usePermission();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Nav sections defined inside component so t() is available
  const NAV_SECTIONS = [
    {
      label: null,
      items: [
        {
          to: '/', label: t('nav.dashboard'), permission: null,
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
        },
      ],
    },
    {
      label: t('nav.people'),
      items: [
        {
          to: '/employees', label: t('nav.employees'), permission: 'employees:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/></svg>,
        },
        {
          to: '/recruitment', label: t('nav.recruitment'), permission: 'recruitment:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
        },
        {
          to: '/appraisals', label: t('nav.appraisals'), permission: 'appraisals:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
        },
      ],
    },
    {
      label: t('nav.operations'),
      items: [
        {
          to: '/attendance', label: t('nav.attendance'), permission: 'attendance:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
        },
        {
          to: '/timesheets', label: t('nav.timesheets'), permission: 'timesheets:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>,
        },
        {
          to: '/leave', label: t('nav.leaveRequests'), permission: 'leave:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
        },
        {
          to: '/day-requests', label: t('nav.dayRequests'), permission: 'day_requests:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>,
        },
        {
          to: '/expenses', label: t('nav.expenses'), permission: 'expenses:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
        },
      ],
    },
    {
      label: t('nav.finance'),
      items: [
        {
          to: '/payroll', label: t('nav.payroll'), permission: 'payroll:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
        },
        {
          to: '/payslips', label: t('nav.payslips'), permission: 'payslips:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
        },
        {
          to: '/reports', label: t('nav.reports'), permission: '__reports__',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
        },
      ],
    },
    {
      label: t('nav.system'),
      items: [
        {
          to: '/audit', label: t('nav.auditLog'), permission: 'audit:read',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>,
        },
        {
          to: '/admin', label: t('nav.controlPanel'), permission: '__admin__',
          icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>,
        },
      ],
    },
  ];

  const isVisible = (item) => {
    if (item.permission === null) return true;
    if (item.permission === '__reports__') return canAny(['reports:hr', 'reports:finance', 'reports:executive']);
    if (item.permission === '__admin__') return role === 'admin';
    return can(item.permission);
  };

  const goToProfile = () => {
    if (employee?.name) { navigate(`/employees/${employee.name}`); onClose(); }
  };

  const roleLabel = t(`roles.${role}`, { defaultValue: (customRoles || []).find(r => r.name === role)?.label || role });

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>

        {/* Brand */}
        <div className="sidebar-brand">
          <img src="/afaq_logo.png" alt="AFAQ ALFIKER" className="brand-logo-img" />
          <div className="brand-text">
            <span className="brand-name">AFAQ ALFIKER</span>
            <span className="brand-sub">{t('nav.hrSystem')}</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(isVisible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label || 'main'} className="nav-section">
                {section.label && (
                  <div className="nav-section-label">{section.label}</div>
                )}
                {visibleItems.map(({ to, icon, label }) => (
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
              </div>
            );
          })}

          {employee?.name && role !== 'audit_manager' && (
            <div className="nav-section">
              <button className="nav-item nav-item-btn" onClick={goToProfile}>
                <span className="nav-icon"><ProfileIcon /></span>
                <span className="nav-label">{t('nav.myProfile')}</span>
              </button>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {employee && (
            <button className="sidebar-user-btn" onClick={goToProfile}>
              <Avatar name={employee.employee_name} image={employee.image} size={34} />
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{employee.employee_name}</span>
                <span className="sidebar-user-role">{roleLabel}</span>
              </div>
            </button>
          )}
          <button className="btn-logout" onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t('nav.signOut')}
          </button>
        </div>
      </aside>
    </>
  );
}
