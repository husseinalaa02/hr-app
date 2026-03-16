import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { NetworkProvider, useNetwork } from './context/NetworkContext';
import { ROUTE_PERMISSIONS } from './rbac/permissions';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import AccessDenied from './components/AccessDenied';

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

const PAGE_TITLES = {
  '/':             'Dashboard',
  '/employees':    'Employee Directory',
  '/leave':        'Leave Requests',
  '/attendance':   'Attendance',
  '/timesheets':   'Timesheets',
  '/payslips':     'Payslips',
  '/day-requests': 'Day Requests',
  '/payroll':      'Payroll',
  '/audit':        'Audit View',
  '/appraisals':   'Appraisals',
  '/recruitment':  'Recruitment',
  '/expenses':     'Expenses',
  '/reports':      'Reports',
};

function NetworkBanner() {
  const { isOnline, pendingCount, syncing, runSync } = useNetwork();

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="net-banner net-banner-offline">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
        </svg>
        <span>You're offline — data loads from local cache</span>
        {pendingCount > 0 && <span className="net-badge">{pendingCount} pending</span>}
      </div>
    );
  }

  // Online but has pending ops
  return (
    <div className="net-banner net-banner-pending">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
      </svg>
      <span>{syncing ? 'Syncing…' : `${pendingCount} action${pendingCount > 1 ? 's' : ''} waiting to sync`}</span>
      {!syncing && (
        <button className="net-sync-btn" onClick={runSync}>Sync now</button>
      )}
    </div>
  );
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

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] || 'HR';

  if (loading) return <div className="app-loading"><span className="spinner" /></div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*"      element={<Navigate to="/login" replace />} />
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
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <BottomNav />
        </div>
      </div>
    </NetworkProvider>
  );
}
