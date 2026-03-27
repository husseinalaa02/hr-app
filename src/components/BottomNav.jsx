import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import { useTranslation } from 'react-i18next';

const HomeIcon  = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
const ClockIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>;
const LeaveIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
const ExpenseIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const StarIcon  = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const TeamIcon  = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/></svg>;
const PayrollIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
const ReportsIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const PayslipIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
const AuditIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/></svg>;

export default function BottomNav() {
  const { employee, isAdmin, isFinance, isAudit } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { t } = useTranslation();

  const NAV_EMPLOYEE = [
    { to: '/',           label: t('nav.dashboard'), icon: HomeIcon },
    { to: '/attendance', label: t('nav.attendance'), icon: ClockIcon },
    { to: '/leave',      label: t('nav.leaveRequests'), icon: LeaveIcon },
    { to: '/expenses',   label: t('nav.expenses'), icon: ExpenseIcon },
    { to: '/appraisals', label: t('nav.appraisals'), icon: StarIcon },
  ];

  const NAV_ADMIN = [
    { to: '/',           label: t('nav.dashboard'), icon: HomeIcon },
    { to: '/employees',  label: t('nav.employees'), icon: TeamIcon },
    { to: '/payroll',    label: t('nav.payroll'), icon: PayrollIcon },
    { to: '/appraisals', label: t('nav.appraisals'), icon: StarIcon },
    { to: '/reports',    label: t('nav.reports'), icon: ReportsIcon },
  ];

  const NAV_FINANCE = [
    { to: '/',         label: t('nav.dashboard'), icon: HomeIcon },
    { to: '/payroll',  label: t('nav.payroll'), icon: PayrollIcon },
    { to: '/payslips', label: t('nav.payslips'), icon: PayslipIcon },
  ];

  const NAV_AUDIT = [
    { to: '/',        label: t('nav.dashboard'), icon: HomeIcon },
    { to: '/audit',   label: t('nav.auditLog'), icon: AuditIcon },
    { to: '/payroll', label: t('nav.payroll'), icon: PayrollIcon },
  ];

  const role = employee?.role || 'employee';
  let NAV;
  if (isAudit)   NAV = NAV_AUDIT;
  else if (isAdmin)   NAV = NAV_ADMIN;
  else if (isFinance) NAV = NAV_FINANCE;
  else                NAV = NAV_EMPLOYEE;

  const profilePath   = employee?.name ? `/employees/${employee.name}` : null;
  const profileActive = profilePath ? location.pathname === profilePath : false;

  return (
    <nav className="bottom-nav">
      {NAV.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `bnav-item${isActive ? ' active' : ''}`}
        >
          <span className="bnav-icon-wrap" aria-hidden="true"><span className="bnav-icon">{icon}</span></span>
          <span className="bnav-label">{label}</span>
        </NavLink>
      ))}

      {employee && role !== 'audit' && (
        <button
          className={`bnav-item bnav-item-btn${profileActive ? ' active' : ''}`}
          onClick={() => profilePath && navigate(profilePath)}
          aria-label={t('nav.myProfile')}
        >
          <span className="bnav-icon-wrap" aria-hidden="true">
            <span className="bnav-icon bnav-avatar">
              <Avatar name={employee.employee_name} image={employee.image} size={26} />
            </span>
          </span>
          <span className="bnav-label">{t('nav.myProfile')}</span>
        </button>
      )}
    </nav>
  );
}
