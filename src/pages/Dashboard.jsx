import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getTodayCheckins, getTodayAttendance } from '../api/attendance';
import { getLeaveBalance, getLeaveApplications, getPendingApprovals } from '../api/leave';
import { getEmployees } from '../api/employees';
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from '../api/dashboard';
import { getPayrollRecords } from '../api/payroll';
import { getExpenses } from '../api/expenses';
import { getJobs } from '../api/recruitment';
import { Skeleton } from '../components/Skeleton';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import ErrorState from '../components/ErrorState';
import { useConfirm } from '../hooks/useConfirm';

function getGreeting(t) {
  const h = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', hour: 'numeric', hour12: false }).format(new Date()),
    10
  );
  if (h < 12) return t('dashboard.goodMorning');
  if (h < 17) return t('dashboard.goodAfternoon');
  return t('dashboard.goodEvening');
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Baghdad' });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color, bg, to }) {
  const content = (
    <div className="kpi-card" style={{ '--kpi-color': color, '--kpi-bg': bg }}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-body">
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link> : content;
}

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title, to, linkLabel }) {
  const { t } = useTranslation();
  return (
    <div className="dash-section-header">
      <h3 className="dash-section-title">{title}</h3>
      {to && <Link to={to} className="dash-section-link">{linkLabel || t('common.viewAll')} <span className="link-arrow">→</span></Link>}
    </div>
  );
}

// ─── Leave Balance Bar ─────────────────────────────────────────────────────────
function LeaveBar({ type, remaining, allocated, color }) {
  const { t } = useTranslation();
  const used = allocated - remaining;
  const pct = allocated > 0 ? Math.round((used / allocated) * 100) : 0;
  return (
    <div className="leave-bar-item">
      <div className="leave-bar-top">
        <span className="leave-bar-type">{type}</span>
        <span className="leave-bar-count" style={{ color }}>
          <strong>{remaining}</strong> / {allocated} {t('leave.daysLeft')}
        </span>
      </div>
      <div className="leave-bar-track">
        <div className="leave-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Dept Bar ──────────────────────────────────────────────────────────────────
const DEPT_COLORS = ['#0C447C','#059669','#d97706','#7c3aed','#0284c7','#dc2626','#ec4899'];
function DeptBreakdown({ employees }) {
  const counts = {};
  employees.forEach(e => { counts[e.department] = (counts[e.department] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  return (
    <div className="dept-breakdown">
      {entries.map(([dept, count], i) => (
        <div key={dept} className="dept-bar-item">
          <div className="dept-bar-label">
            <span>{dept}</span>
            <span className="dept-bar-count">{count}</span>
          </div>
          <div className="dept-bar-track">
            <div
              className="dept-bar-fill"
              style={{ width: `${(count / max) * 100}%`, background: DEPT_COLORS[i % DEPT_COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Pending Item ──────────────────────────────────────────────────────────────
function PendingItem({ icon, name, detail, meta, status }) {
  return (
    <div className="pending-item">
      <div className="pending-item-icon">{icon}</div>
      <div className="pending-item-body">
        <div className="pending-item-name">{name}</div>
        <div className="pending-item-detail">{detail}</div>
      </div>
      <div className="pending-item-right">
        {meta && <span className="pending-item-meta">{meta}</span>}
        <Badge status={status || 'Open'} />
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icons = {
  employees: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/></svg>,
  attendance: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  leave: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  payroll: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  jobs: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  expense: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  checkin: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  payslip: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  timesheet: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>,
  expense_quick: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
};

function AnnouncementModal({ onClose, onSave }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ title: '', content: '', notice_date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError(t('dashboard.titleRequired')); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message || t('errors.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('dashboard.newAnnouncement')}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="form-error" style={{ marginBottom: 12, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">{t('dashboard.announcementTitle')} *</label>
            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t('dashboard.announcementTitlePlaceholder')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dashboard.announcementDate')}</label>
            <input className="form-input" type="date" value={form.notice_date} onChange={e => setForm(f => ({ ...f, notice_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dashboard.announcementContent')}</label>
            <textarea className="form-input" rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder={t('dashboard.announcementContentPlaceholder')} style={{ resize: 'vertical' }} />
          </div>
          <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('dashboard.saving') : t('dashboard.postAnnouncement')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { employee, isAdmin, isCEO, isFinance, isHR, isAudit, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const canWriteAnnouncements = hasPermission('announcements:write');
  const { confirm, ConfirmModalComponent } = useConfirm();

  const role = employee?.role;
  const isManager = isAdmin || isCEO || isHR || role === 'it_manager';

  const handleCreateAnnouncement = async (form) => {
    const newAnn = await createAnnouncement(form);
    setData(prev => ({ ...prev, announcements: [newAnn, ...(prev?.announcements || [])] }));
  };

  const handleDeleteAnnouncement = async (ann) => {
    const ok = await confirm({ message: t('dashboard.confirmDeleteAnnouncement'), danger: true });
    if (!ok) return;
    await deleteAnnouncement(ann.name);
    setData(prev => ({ ...prev, announcements: (prev?.announcements || []).filter(a => a.name !== ann.name) }));
  };

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (isManager || isFinance) {
        const [allEmployees, pendingLeaves, announcements, payrollRecords, pendingExpenses, jobs, checkins] = await Promise.all([
          getEmployees(),
          getPendingApprovals({ managerId: employee.name, includeHRQueue: isHR }),
          getAnnouncements(),
          getPayrollRecords(),
          getExpenses({ status: 'Submitted' }),
          getJobs({ status: 'Open' }),
          getTodayCheckins(employee.name),
        ]);
        setData({ allEmployees, pendingLeaves, announcements, payrollRecords, pendingExpenses, jobs, checkins });
      } else {
        const [checkins, balance, leaves, announcements] = await Promise.all([
          getTodayCheckins(employee.name),
          getLeaveBalance(employee.name),
          getLeaveApplications(employee.name),
          getAnnouncements(),
        ]);
        setData({ checkins, allocations: balance, leaves, announcements });
      }
    } catch (e) {
      setLoadError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.name, isManager, isFinance, isHR, t]);

  useEffect(() => { load(); }, [load]);

  const lastCheckinLog = data?.checkins?.[data.checkins.length - 1];
  const checkedIn  = lastCheckinLog?.log_type === 'IN';
  const checkedOut = lastCheckinLog?.log_type === 'OUT';
  const attendanceStatus = checkedOut ? t('dashboard.checkedOut') : checkedIn ? t('dashboard.checkedIn') : t('dashboard.notCheckedIn');
  const attendanceColor  = checkedOut ? '#d97706' : checkedIn ? '#059669' : '#dc2626';

  // ── ADMIN / HR MANAGER VIEW ──────────────────────────────────────────────────
  if (isManager || isFinance) {
    const employees       = data?.allEmployees   || [];
    const pendingLeaves   = data?.pendingLeaves  || [];
    const announcements   = data?.announcements  || [];
    const payroll         = data?.payrollRecords || [];
    const pendingExpenses = data?.pendingExpenses || [];
    const openJobs        = data?.jobs           || [];

    const payrollPending = payroll.filter(p => p.status === 'Submitted').length;
    const pendingCount   = pendingLeaves.length + pendingExpenses.length;

    return (
      <div className="page-content dash-pro">

        {loadError && <ErrorState message={loadError} onRetry={load} />}

        {/* ── Page Header ── */}
        <div className="dash-emp-header">
          <div className="dash-emp-hero">
            <button className="dash-emp-profile-btn" onClick={() => navigate(`/employees/${employee?.name}`)}>
              <Avatar name={employee?.employee_name} image={employee?.image} size={52} />
            </button>
            <div className="dash-emp-info">
              <div className="dash-greeting">{getGreeting(t)}, <strong>{employee?.employee_name?.split(' ')[0]}</strong> 👋</div>
              <div className="dash-emp-role">{employee?.designation} · {employee?.department}</div>
              <div className="dash-date">{formatDate()}</div>
            </div>
          </div>
          <div className="dash-emp-status-pill" style={{ background: '#e8f2fb', color: '#0C447C', borderColor: '#0C447C40' }}>
            <span className="dash-status-dot" style={{ background: '#0C447C' }} />
            {t(`roles.${role}`) || t('roles.admin')}
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="dash-card dash-card-wide">
          <SectionHeader title={t('dashboard.quickActions')} />
          <div className="dash-card-body">
            <div className="qa-grid">
              {[
                { to: '/employees',   label: t('nav.employees'),   icon: Icons.employees,     bg: '#e8f2fb', color: '#0C447C' },
                { to: '/payroll',     label: t('nav.payroll'),     icon: Icons.payroll,       bg: '#fef3c7', color: '#d97706' },
                { to: '/leave',       label: t('dashboard.leave'), icon: Icons.leave,         bg: '#fee2e2', color: '#dc2626' },
                { to: '/reports',     label: t('nav.reports'),     icon: Icons.attendance,    bg: '#d1fae5', color: '#059669' },
                { to: '/recruitment', label: t('nav.recruitment'), icon: Icons.jobs,          bg: '#ede9fe', color: '#7c3aed' },
                { to: '/expenses',    label: t('nav.expenses'),    icon: Icons.expense_quick, bg: '#e0f2fe', color: '#0284c7' },
              ].map(({ to, label, icon, bg, color }) => (
                <Link key={to} to={to} className="qa-item">
                  <div className="qa-icon" style={{ background: bg, color }}>{icon}</div>
                  <span className="qa-label">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── KPI Row ── */}
        <div className="kpi-grid">
          <KpiCard
            label={t('dashboard.totalEmployees')} value={loading ? '—' : employees.length}
            sub={t('dashboard.activeHeadcount')}
            icon={Icons.employees} color="#0C447C" bg="#e8f2fb"
            to="/employees"
          />
          <KpiCard
            label={t('dashboard.pendingApprovals')} value={loading ? '—' : pendingCount}
            sub={`${pendingLeaves.length} ${t('dashboard.leave')} · ${pendingExpenses.length} ${t('nav.expenses')}`}
            icon={Icons.leave} color="#dc2626" bg="#fee2e2"
            to="/leave"
          />
          <KpiCard
            label={t('dashboard.payrollPending')} value={loading ? '—' : payrollPending}
            sub={t('dashboard.awaitingPayment')}
            icon={Icons.payroll} color="#d97706" bg="#fef3c7"
            to="/payroll"
          />
          <KpiCard
            label={t('dashboard.openPositions')} value={loading ? '—' : openJobs.length}
            sub={t('dashboard.activeJobPostings')}
            icon={Icons.jobs} color="#7c3aed" bg="#ede9fe"
            to="/recruitment"
          />
          <KpiCard
            label={t('dashboard.departments')} value={loading ? '—' : [...new Set(employees.map(e => e.department))].length}
            sub={t('dashboard.acrossCompany')}
            icon={Icons.attendance} color="#059669" bg="#d1fae5"
          />
        </div>

        {/* ── Main Grid ── */}
        <div className="dash-main-grid">

          {/* Pending Approvals */}
          <div className="dash-card">
            <SectionHeader title={t('dashboard.pendingApprovals')} to="/leave" linkLabel={t('dashboard.leavePage')} />
            <div className="dash-card-body">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="pending-item-skeleton"><Skeleton height={14} width="60%" /><Skeleton height={11} width="40%" style={{marginTop:4}}/></div>)
              ) : pendingLeaves.length === 0 && pendingExpenses.length === 0 ? (
                <div className="dash-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p>{t('dashboard.allCaughtUp')}</p>
                </div>
              ) : (
                <>
                  {pendingLeaves.slice(0, 4).map(l => (
                    <PendingItem
                      key={l.name}
                      icon={<div className="pending-type-icon" style={{background:'#fee2e2',color:'#dc2626'}}>{Icons.leave}</div>}
                      name={l.employee_name}
                      detail={`${l.leave_type} · ${l.from_date}${l.to_date && l.to_date !== l.from_date ? ` → ${l.to_date}` : ''}`}
                      meta={`${l.total_leave_days}d`}
                      status={l.status}
                    />
                  ))}
                  {pendingExpenses.slice(0, 3).map(e => (
                    <PendingItem
                      key={e.id}
                      icon={<div className="pending-type-icon" style={{background:'#fef3c7',color:'#d97706'}}>{Icons.expense}</div>}
                      name={e.employee_name}
                      detail={`${e.expense_type} · ${e.expense_date}`}
                      meta={`${(e.amount/1000).toFixed(0)}K IQD`}
                      status={e.status}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Department Breakdown */}
          <div className="dash-card">
            <SectionHeader title={t('dashboard.departmentOverview')} />
            <div className="dash-card-body">
              {loading ? (
                [1,2,3].map(i => <div key={i} style={{marginBottom:14}}><Skeleton height={12} width="50%" /><Skeleton height={8} width="100%" style={{marginTop:6,borderRadius:4}}/></div>)
              ) : (
                <DeptBreakdown employees={employees} />
              )}
              {!loading && (
                <div className="dept-total-row">
                  <span className="dept-total-label">{t('dashboard.totalWorkforce')}</span>
                  <span className="dept-total-value">{employees.length + ' ' + t('nav.employees')}</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Announcements + Quick Actions side by side ── */}
        <div className="dash-main-grid">

          {/* Announcements */}
          <div className="dash-card">
            <div className="dash-section-header">
              <h3 className="dash-section-title">{t('dashboard.announcements')}</h3>
              {canWriteAnnouncements && (
                <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setShowAnnModal(true)}>+ {t('dashboard.newAnnouncement')}</button>
              )}
            </div>
            <div className="dash-card-body">
              {loading ? <Skeleton height={14} width="70%" /> :
               !announcements.length ? <p className="text-muted">{t('dashboard.noAnnouncements')}</p> : (
                announcements.map((a, i) => (
                  <div key={a.id || a.name} className="ann-card" style={{ '--ann-color': DEPT_COLORS[i % DEPT_COLORS.length] }}>
                    <div className="ann-card-bar" />
                    <div className="ann-card-body" style={{ flex: 1 }}>
                      <div className="ann-card-title">{a.title}</div>
                      <div className="ann-card-date">{a.notice_date || a.creation?.split('T')[0]}</div>
                      {a.content && <p className="ann-card-text">{a.content}</p>}
                    </div>
                    {canWriteAnnouncements && (
                      <button onClick={() => handleDeleteAnnouncement(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0 4px', alignSelf: 'flex-start' }} title="Delete">✕</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      {showAnnModal && <AnnouncementModal onClose={() => setShowAnnModal(false)} onSave={handleCreateAnnouncement} />}
      </div>
    );
  }

  // ── EMPLOYEE VIEW ────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="page-content">
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  const leaveMap = {};
  (data?.allocations || []).forEach(a => {
    leaveMap[a.leave_type] = { remaining: a.remaining ?? 0, allocated: a.allocated ?? 0 };
  });
  const myLeaves      = data?.leaves       || [];
  const announcements = data?.announcements || [];

  const leaveTypes = [
    { type: 'Annual Leave',  labelKey: 'leave.annualLeave',  color: '#0C447C' },
    { type: 'Sick Leave',    labelKey: 'leave.sickLeave',    color: '#059669' },
    { type: 'Casual Leave',  labelKey: 'leave.casualLeave',  color: '#d97706' },
  ];

  return (
    <div className="page-content dash-pro">

      {/* ── Employee Header ── */}
      <div className="dash-emp-header">
        <div className="dash-emp-hero">
          <button className="dash-emp-profile-btn" onClick={() => navigate(`/employees/${employee?.name}`)}>
            <Avatar name={employee?.employee_name} image={employee?.image} size={56} />
          </button>
          <div className="dash-emp-info">
            <div className="dash-greeting">{getGreeting(t)}, <strong>{employee?.employee_name?.split(' ')[0]}</strong> 👋</div>
            <div className="dash-emp-role">{employee?.designation} · {employee?.department}</div>
            <div className="dash-date">{formatDate()}</div>
          </div>
        </div>
        <div className="dash-emp-status-pill" style={{ background: attendanceColor + '18', color: attendanceColor, borderColor: attendanceColor + '40' }}>
          <span className="dash-status-dot" style={{ background: attendanceColor }} />
          {attendanceStatus}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="dash-card dash-card-wide">
        <SectionHeader title={t('dashboard.quickActions')} />
        <div className="dash-card-body">
          <div className="qa-grid">
            {[
              { to: '/attendance', label: t('dashboard.checkIn'),    icon: Icons.checkin,       bg: '#e8f2fb', color: '#0C447C' },
              { to: '/leave',      label: t('dashboard.leave'),      icon: Icons.leave,         bg: '#d1fae5', color: '#059669' },
              { to: '/timesheets', label: t('dashboard.timesheet'),  icon: Icons.timesheet,     bg: '#fef3c7', color: '#d97706' },
              { to: '/payslips',   label: t('dashboard.payslips'),   icon: Icons.payslip,       bg: '#ede9fe', color: '#7c3aed' },
              { to: '/expenses',   label: t('dashboard.expenses'),   icon: Icons.expense_quick, bg: '#e0f2fe', color: '#0284c7' },
              { to: '/appraisals', label: t('dashboard.appraisals'), icon: Icons.attendance,    bg: '#fee2e2', color: '#dc2626' },
            ].map(({ to, label, icon, bg, color }) => (
              <Link key={to} to={to} className="qa-item">
                <div className="qa-icon" style={{ background: bg, color }}>{icon}</div>
                <span className="qa-label">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Leave Balance ── */}
      <div className="dash-card dash-card-wide">
        <SectionHeader title={t('dashboard.myLeaveBalance')} to="/leave" linkLabel={t('dashboard.manageLeaves')} />
        <div className="dash-card-body">
          {loading ? (
            [1,2,3].map(i => <div key={i} style={{marginBottom:16}}><Skeleton height={12} width="40%"/><Skeleton height={8} width="100%" style={{marginTop:8,borderRadius:4}}/></div>)
          ) : (
            <div className="leave-balance-grid">
              {leaveTypes.map(({ type, labelKey, color }) => {
                const info = leaveMap[type] || { remaining: 0, allocated: 0 };
                return (
                  <div key={type} className="leave-balance-card" style={{ '--lb-color': color }}>
                    <div className="leave-balance-type">{t(labelKey)}</div>
                    <div className="leave-balance-value" style={{ color }}>{info.remaining}</div>
                    <div className="leave-balance-sub">{t('dashboard.daysRemaining', { allocated: info.allocated })}</div>
                    <div className="leave-balance-bar-track">
                      <div className="leave-balance-bar-fill" style={{
                        width: info.allocated > 0 ? `${Math.round(((info.allocated - info.remaining) / info.allocated) * 100)}%` : '0%',
                        background: color
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="dash-main-grid">

        {/* My Leave Requests */}
        <div className="dash-card">
          <SectionHeader title={t('dashboard.myLeaveRequests')} to="/leave" />
          <div className="dash-card-body">
            {loading ? <Skeleton height={14} width="70%" /> :
             myLeaves.length === 0 ? (
              <div className="dash-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <p>{t('dashboard.noLeaveRequests')}</p>
              </div>
            ) : (
              myLeaves.slice(0, 5).map(l => (
                <div key={l.name} className="my-leave-item">
                  <div className="my-leave-type">{l.leave_type}</div>
                  <div className="my-leave-dates">{l.from_date}{l.to_date && l.to_date !== l.from_date ? ` → ${l.to_date}` : ''} · {l.total_leave_days}d</div>
                  <Badge status={l.status} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Announcements */}
        <div className="dash-card">
          <SectionHeader title={t('dashboard.announcements')} />
          <div className="dash-card-body">
            {loading ? <Skeleton height={14} width="80%" /> :
             !announcements.length ? <p className="text-muted" style={{fontSize:13}}>{t('dashboard.noAnnouncements')}</p> : (
              announcements.map((a, i) => (
                <div key={a.id || a.name} className="ann-card" style={{ '--ann-color': DEPT_COLORS[i % DEPT_COLORS.length] }}>
                  <div className="ann-card-bar" />
                  <div className="ann-card-body">
                    <div className="ann-card-title">{a.title}</div>
                    <div className="ann-card-date">{a.notice_date || a.creation?.split('T')[0]}</div>
                    {a.content && <p className="ann-card-text">{a.content}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {ConfirmModalComponent}
    </div>
  );
}
