import { useState, useMemo, lazy, Suspense, Component } from 'react';
import { logAction } from './api/auditLog';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { NetworkProvider, useNetwork } from './context/NetworkContext';
import { ROUTE_PERMISSIONS } from './rbac/permissions';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import AccessDenied from './components/AccessDenied';
import { useTranslation } from 'react-i18next';

const ResetPassword  = lazy(() => import('./pages/ResetPassword'));
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Employees      = lazy(() => import('./pages/Employees'));
const EmployeeDetail = lazy(() => import('./pages/EmployeeDetail'));
const LeaveRequests  = lazy(() => import('./pages/LeaveRequests'));
const Attendance     = lazy(() => import('./pages/Attendance'));
const Timesheets     = lazy(() => import('./pages/Timesheets'));
const Payslips       = lazy(() => import('./pages/Payslips'));
const DayRequests    = lazy(() => import('./pages/DayRequests'));
const Payroll        = lazy(() => import('./pages/Payroll'));
const AuditView      = lazy(() => import('./pages/AuditView'));
const Appraisals     = lazy(() => import('./pages/Appraisals'));
const Recruitment    = lazy(() => import('./pages/Recruitment'));
const Expenses       = lazy(() => import('./pages/Expenses'));
const Reports        = lazy(() => import('./pages/Reports'));
const Admin          = lazy(() => import('./pages/Admin'));


function NetworkBanner() {
  const { isOnline } = useNetwork();
  const { t } = useTranslation();
  if (isOnline) return null;
  return (
    <div className="net-banner net-banner-offline">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
      </svg>
      <span>{t('errors.offline')}</span>
    </div>
  );
}

function ErrorFallback({ error, onRetry }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <h2 style={{ color: 'var(--danger, #c62828)', marginBottom: 8 }}>{t('errors.somethingWentWrong')}</h2>
      <p style={{ color: 'var(--gray-600)', marginBottom: 16 }}>{error.message}</p>
      <button className="btn btn-secondary" onClick={onRetry}>{t('common.retry')}</button>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info);
    // Use action='ERROR' only — the audit_error_insert RLS policy allows any
    // authenticated user to log errors without requiring a matching user_id/role.
    // No userId/role override: logAction will use the authenticated session token.
    try {
      logAction({
        action: 'ERROR',
        resource: 'app',
        resourceLabel: error.message?.slice(0, 100) || 'Unknown error',
        details: JSON.stringify({
          message: error.message,
          componentStack: info?.componentStack?.slice(0, 500),
        }),
      });
    } catch {
      // Never throw from an error boundary
    }
  }
  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading"><span className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireRole({ permission, children }) {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading"><span className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (permission && !hasPermission(permission)) {
    return <AccessDenied permission={permission} />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading"><span className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdmin) return <AccessDenied />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();

  const PAGE_TITLES = useMemo(() => ({
    '/':             t('nav.dashboard'),
    '/employees':    t('employees.title'),
    '/leave':        t('leave.title'),
    '/attendance':   t('attendance.title'),
    '/timesheets':   t('timesheets.title'),
    '/payslips':     t('payslips.title'),
    '/day-requests': t('dayRequests.title'),
    '/payroll':      t('payroll.title'),
    '/audit':        t('audit.title'),
    '/appraisals':   t('appraisals.title'),
    '/recruitment':  t('recruitment.title'),
    '/expenses':     t('expenses.title'),
    '/reports':      t('reports.title'),
    '/admin':        t('admin.title'),
  }), [t]);

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] || 'HR';

  if (loading) return <div className="app-loading"><span className="spinner" /></div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/reset-password" element={<Suspense fallback={<div className="app-loading"><span className="spinner" /></div>}><ResetPassword /></Suspense>} />
        <Route path="*"               element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <NetworkProvider>
      <div className="app-layout">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main-area">
          <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
          <NetworkBanner />
          <ErrorBoundary>
          <Suspense fallback={<div className="app-loading"><span className="spinner" /></div>}>
            <Routes>
              <Route path="/"             element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/employees"    element={<RequireRole permission={ROUTE_PERMISSIONS['/employees']}><Employees /></RequireRole>} />
              <Route path="/employees/:id" element={<RequireRole permission={ROUTE_PERMISSIONS['/employees']}><EmployeeDetail /></RequireRole>} />
              <Route path="/leave"        element={<RequireRole permission={ROUTE_PERMISSIONS['/leave']}><LeaveRequests /></RequireRole>} />
              <Route path="/attendance"   element={<RequireRole permission={ROUTE_PERMISSIONS['/attendance']}><Attendance /></RequireRole>} />
              <Route path="/timesheets"   element={<RequireRole permission={ROUTE_PERMISSIONS['/timesheets']}><Timesheets /></RequireRole>} />
              <Route path="/payslips"     element={<RequireRole permission={ROUTE_PERMISSIONS['/payslips']}><Payslips /></RequireRole>} />
              <Route path="/day-requests" element={<RequireRole permission={ROUTE_PERMISSIONS['/day-requests']}><DayRequests /></RequireRole>} />
              <Route path="/payroll"      element={<RequireRole permission={ROUTE_PERMISSIONS['/payroll']}><Payroll /></RequireRole>} />
              <Route path="/audit"        element={<RequireRole permission={ROUTE_PERMISSIONS['/audit']}><AuditView /></RequireRole>} />
              <Route path="/appraisals"   element={<RequireRole permission={ROUTE_PERMISSIONS['/appraisals']}><Appraisals /></RequireRole>} />
              <Route path="/recruitment"  element={<RequireRole permission={ROUTE_PERMISSIONS['/recruitment']}><Recruitment /></RequireRole>} />
              <Route path="/expenses"     element={<RequireRole permission={ROUTE_PERMISSIONS['/expenses']}><Expenses /></RequireRole>} />
              <Route path="/reports"      element={<RequireRole permission={ROUTE_PERMISSIONS['/reports']}><Reports /></RequireRole>} />
              <Route path="/admin"        element={<RequireAdmin><Admin /></RequireAdmin>} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
          <BottomNav />
        </div>
      </div>
    </NetworkProvider>
  );
}
