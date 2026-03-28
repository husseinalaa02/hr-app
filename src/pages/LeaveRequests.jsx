import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getLeaveApplications, getPendingApprovals, getAllApprovedLeaves,
  submitLeaveApplication, updateLeaveStatus, getLeaveTypes,
  getLeaveBalance, calcHours,
} from '../api/leave';
import { getPublicHolidays } from '../api/publicHolidays';
import { countWorkingDays } from '../utils/workSchedule';
import { useConfirm } from '../hooks/useConfirm';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { useTranslation } from 'react-i18next';

const BALANCE_COLORS = {
  'Annual Leave':  '#0C447C',
  'Sick Leave':    '#2e7d32',
  'Casual Leave':  '#ef6c00',
  'Hourly Leave':  '#6a1b9a',
};

function BalanceBar({ label, remaining, allocated, unit, color, annualMax, monthly }) {
  const { t } = useTranslation();
  const pct = allocated > 0 ? Math.max(0, (remaining / allocated) * 100) : 0;
  const subLabel = monthly
    ? t('leave.monthlyQuotaLabel')
    : annualMax && allocated < annualMax
      ? t('leave.accrued', { allocated, max: annualMax })
      : null;
  return (
    <div className="balance-bar-item">
      <div className="balance-bar-header">
        <span className="balance-bar-label">
          {label}
          {subLabel && <span style={{ fontSize: 10, color: 'var(--gray-400)', marginInlineStart: 5 }}>{subLabel}</span>}
        </span>
        <span className="balance-bar-value" style={{ color }}>
          <strong>{typeof remaining === 'number' ? remaining.toFixed(remaining % 1 ? 1 : 0) : remaining}</strong> / {allocated} {unit} {t('leave.daysLeft')}
        </span>
      </div>
      <div className="balance-bar-track">
        <div className="balance-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const EMPTY_FORM = { leave_type: '', from_date: '', to_date: '', from_time: '09:00', to_time: '10:00', description: '' };

function LeaveForm({ onSubmit, leaveTypes, balance, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isHourly, setIsHourly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState([]);
  const { addToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.all([getPublicHolidays(year), getPublicHolidays(year + 1)])
      .then(([a, b]) => setPublicHolidays([...a, ...b].map(h => h.date)))
      .catch(() => {});
  }, []);

  const overlappingHolidays = useMemo(() => {
    if (isHourly || !form.from_date || !form.to_date || form.to_date < form.from_date) return [];
    const result = [];
    const cur = new Date(form.from_date + 'T12:00:00+03:00');
    const end = new Date(form.to_date + 'T12:00:00+03:00');
    while (cur <= end) {
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(cur);
      if (publicHolidays.includes(dateStr)) result.push(dateStr);
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [isHourly, form.from_date, form.to_date, publicHolidays]);

  const { employee } = useAuth();
  const empOffDays = employee?.off_days || [5, 6];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const hours = isHourly ? calcHours(form.from_time, form.to_time) : 0;
  const days  = !isHourly && form.from_date && form.to_date
    ? countWorkingDays(form.from_date, form.to_date, empOffDays, publicHolidays)
    : 0;

  const hourlyBalance  = balance.find(b => b.is_hourly);
  const selectedBal    = isHourly ? hourlyBalance : balance.find(b => b.leave_type === form.leave_type);
  const requested      = isHourly ? hours : days;
  const insufficient   = selectedBal && requested > 0 && requested > selectedBal.remaining;

  const handle = async (e) => {
    e.preventDefault();
    if (isHourly && hours <= 0) { addToast(t('leave.toTimeError'), 'error'); return; }
    if (!isHourly && form.from_date && form.to_date && form.to_date < form.from_date) {
      addToast(t('leave.endDateError'), 'error'); return;
    }
    if (!isHourly && days === 0) { addToast(t('leave.validDatesError'), 'error'); return; }
    if (insufficient) {
      addToast(
        t('leave.notEnoughBalance', { remaining: selectedBal.remaining, unit: selectedBal.unit }),
        'error'
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...form, is_hourly: isHourly });
      onClose();
    } catch (err) {
      addToast(err.message || t('errors.actionFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handle} className="form-stack">

      {/* Mode toggle */}
      <div className="leave-mode-toggle">
        <button
          type="button"
          className={`mode-btn ${!isHourly ? 'active' : ''}`}
          onClick={() => { setIsHourly(false); setForm(f => ({ ...f, from_date: '', to_date: '', from_time: '09:00', to_time: '10:00' })); }}
        >
          {t('leave.fullDay')}
        </button>
        <button
          type="button"
          className={`mode-btn ${isHourly ? 'active' : ''}`}
          onClick={() => { setIsHourly(true); setForm(f => ({ ...f, from_date: '', to_date: '', from_time: '09:00', to_time: '10:00' })); }}
        >
          {t('leave.hourly')}
        </button>
      </div>

      {/* Leave type — only for daily */}
      {!isHourly && (
        <div className="form-group">
          <label>{t('leave.leaveType')} *</label>
          <select className="form-input" value={form.leave_type} onChange={e => set('leave_type', e.target.value)} required>
            <option value="">{t('leave.selectLeaveType')}</option>
            {leaveTypes.map(lt => {
              const bal = balance.find(b => b.leave_type === lt && !b.is_hourly);
              return (
                <option key={lt} value={lt}>
                  {lt}{bal ? ` (${bal.remaining} ${t('leave.daysLeft')})` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {isHourly && hourlyBalance && (
        <div className="hourly-balance-hint">
          <span>{t('leave.monthlyHourlyLeave')}</span>
          <strong style={{ color: '#6a1b9a' }}>{hourlyBalance.remaining.toFixed(1)}h / {hourlyBalance.allocated}h</strong>
        </div>
      )}

      {/* Date(s) */}
      <div className={isHourly ? 'form-group' : 'form-row'}>
        <div className="form-group">
          <label>{isHourly ? t('leave.date') : t('leave.fromDate')} *</label>
          <input type="date" className="form-input" value={form.from_date}
            onChange={e => set('from_date', e.target.value)} required />
        </div>
        {!isHourly && (
          <div className="form-group">
            <label>{t('leave.toDate')} *</label>
            <input type="date" className="form-input" value={form.to_date}
              min={form.from_date || undefined}
              onChange={e => set('to_date', e.target.value)} required />
          </div>
        )}
      </div>

      {/* Holiday overlap warning */}
      {overlappingHolidays.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span>⚠️</span>
          <span>{t('leave.includesHolidays', { count: overlappingHolidays.length })}</span>
        </div>
      )}

      {/* Time pickers — hourly only */}
      {isHourly && (
        <div className="form-row">
          <div className="form-group">
            <label>{t('leave.fromTime')} *</label>
            <input type="time" className="form-input" value={form.from_time}
              onChange={e => set('from_time', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>{t('leave.toTime')} *</label>
            <input type="time" className="form-input" value={form.to_time}
              onChange={e => set('to_time', e.target.value)} required />
          </div>
        </div>
      )}

      {/* Preview */}
      {(requested > 0) && (
        <div className={`days-preview ${insufficient ? 'days-preview-error' : 'days-preview-ok'}`}>
          {isHourly
            ? t('leave.hoursRequested', { count: hours.toFixed(1) })
            : t('leave.daysRequested', { count: days })}
          {selectedBal && !insufficient && (
            <span> {t('leave.willRemain', { count: (selectedBal.remaining - requested).toFixed(isHourly ? 1 : 0), unit: selectedBal.unit })}</span>
          )}
          {insufficient && (
            <span> {t('leave.exceedsBalance', { count: selectedBal.remaining, unit: selectedBal.unit })}</span>
          )}
        </div>
      )}

      <div className="form-group">
        <label>{t('leave.reason')}</label>
        <textarea className="form-input" rows={2} value={form.description}
          onChange={e => set('description', e.target.value)} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving || insufficient}>
          {saving ? <span className="spinner-sm" /> : t('leave.submitRequest')}
        </button>
      </div>
    </form>
  );
}

export default function LeaveRequests() {
  const { employee, isAdmin, isHR, hasPermission } = useAuth();
  const canApprove = hasPermission('leave:approve');
  const { addToast } = useToast();
  const { t } = useTranslation();
  const { confirm, ConfirmModalComponent } = useConfirm();
  const [tab, setTab] = useState(isAdmin ? 'pending' : 'my');
  const [myLeaves, setMyLeaves] = useState([]);
  const [pending, setPending] = useState([]);
  const [allApproved, setAllApproved] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balance, setBalance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionId, setActionId] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!employee) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [my, types, bal] = await Promise.all([
        getLeaveApplications(employee.name),
        getLeaveTypes(),
        getLeaveBalance(employee.name),
      ]);
      setMyLeaves(my);
      setLeaveTypes(types);
      setBalance(bal);
      try { setPending(await getPendingApprovals({ managerId: employee.name, includeHRQueue: isHR })); } catch {}
      if (isAdmin) {
        try { setAllApproved(await getAllApprovedLeaves()); } catch {}
      }
    } catch (e) {
      setError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [employee?.name, isAdmin, isHR]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form) => {
    await submitLeaveApplication({ employee: employee.name, employee_name: employee.employee_name, ...form });
    addToast(t('leave.submitted'), 'success');
    load();
  };

  const handleAction = async (leaveApp, action) => {
    if (action === 'Rejected') {
      const ok = await confirm({ message: t('common.confirmReject'), danger: true });
      if (!ok) return;
    }
    setActionId(leaveApp.name);
    try {
      // Guard against concurrent approval — re-fetch pending list first
      const fresh = await getPendingApprovals({ managerId: employee.name, includeHRQueue: isHR });
      if (!fresh.some(l => l.name === leaveApp.name)) {
        addToast(t('leave.alreadyProcessed'), 'warning');
        setPending(fresh);
        return;
      }
      const actorRole = isHR && leaveApp.approval_stage === 'Pending HR' ? 'hr' : 'manager';
      await updateLeaveStatus(leaveApp.name, action, actorRole);
      addToast(action === 'Approved' ? t('leave.approvedSuccess') : t('leave.rejectedSuccess'), 'success');
      load(true);
    } catch (err) {
      addToast(err.message || t('errors.actionFailed'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const rows = tab === 'my' ? myLeaves : tab === 'approved' ? allApproved : pending;

  return (
    <div className="page-content">

      <div className="page-header">
        <div>
          <h1 className="page-title">{t('leave.title')}</h1>
          <p className="page-subtitle">{t('leave.subtitle')}</p>
        </div>
        {tab === 'my' && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>{t('leave.newRequest')}</button>
        )}
      </div>

      {/* Balance panel */}
      {!isAdmin && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>{t('leave.leaveBalance')}</h3></div>
          <div className="card-body">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[1,2,3,4].map(i => <Skeleton key={i} height={40} />)}
              </div>
            ) : (
              <div className="balance-bars">
                {balance.map(b => (
                  <BalanceBar
                    key={b.leave_type}
                    label={b.leave_type}
                    remaining={b.remaining}
                    allocated={b.allocated}
                    unit={b.unit}
                    color={BALANCE_COLORS[b.leave_type] || '#607d8b'}
                    annualMax={b.annualMax}
                    monthly={b.monthly}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'my' ? ' active' : ''}`} onClick={() => setTab('my')}>{t('leave.myLeaves')}</button>
          {canApprove && (
            <button className={`tab-btn${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
              {t('leave.teamApprovals')} {pending.length > 0 && <span className="badge-count">{pending.length}</span>}
            </button>
          )}
          {isAdmin && (
            <button className={`tab-btn${tab === 'approved' ? ' active' : ''}`} onClick={() => setTab('approved')}>
              {t('leave.allApproved')} {allApproved.length > 0 && <span className="badge-count">{allApproved.length}</span>}
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="leave-card-list">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="leave-item-card">
              <Skeleton height={14} width="50%" />
              <Skeleton height={12} width="70%" style={{ marginTop: 8 }} />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="card">
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <p className="text-muted" style={{ marginBottom: tab === 'my' ? 12 : 0 }}>
                {tab === 'pending'  ? t('leave.noPending')
                 : tab === 'approved' ? t('leave.noApproved')
                 : t('leave.noLeave')}
              </p>
              {tab === 'my' && (
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowModal(true)}>
                  {t('leave.newRequest')}
                </button>
              )}
            </div>
          </div>
        ) : rows.map(l => {
          const isHourlyLeave = !!l.is_hourly;
          const accentColor =
            l.status === 'Approved' ? '#2e7d32' :
            l.status === 'Rejected' ? '#c62828' :
            BALANCE_COLORS[l.leave_type] || '#ef6c00';
          return (
            <div key={l.name} className="leave-item-card" style={{ borderInlineStart: `4px solid ${accentColor}` }}>
              <div className="leave-item-top">
                <div className="leave-item-info">
                  {(tab === 'pending' || tab === 'approved') && (
                    <div className="leave-item-employee">{l.employee_name}</div>
                  )}
                  {(tab === 'pending' && l.approval_stage) && (
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2,
                      color: l.approval_stage === 'Pending HR' ? '#7c3aed' : '#b45309' }}>
                      {l.approval_stage === 'Pending HR' ? t('leave.awaitingHR') : t('leave.awaitingManager')}
                    </div>
                  )}
                  <div className="leave-item-type">
                    {l.leave_type}
                    {isHourlyLeave && <span className="hourly-tag">{t('leave.hourlyTag')}</span>}
                  </div>
                  <div className="leave-item-dates">
                    {l.from_date}
                    {isHourlyLeave && l.from_time
                      ? <span> · {l.from_time}–{l.to_time}</span>
                      : l.to_date && l.to_date !== l.from_date
                        ? <span> → {l.to_date}</span>
                        : null}
                  </div>
                </div>
                <div className="leave-item-right">
                  <span className={`duration-badge ${isHourlyLeave ? 'hourly' : 'daily'}`}>
                    {isHourlyLeave ? `${l.total_hours}h` : `${l.total_leave_days}d`}
                  </span>
                  <Badge status={l.status} />
                </div>
              </div>
              {tab === 'pending' && canApprove && (() => {
                const stage = l.approval_stage || 'Pending Manager';
                const canActNow = (stage === 'Pending HR' && isHR) ||
                  (stage === 'Pending Manager' && !isHR) ||
                  (stage === 'Pending Manager' && isAdmin);
                return canActNow ? (
                  <div className="leave-item-actions">
                    <button className="btn btn-sm btn-success" onClick={() => handleAction(l, 'Approved')} disabled={actionId === l.name}>
                      {actionId === l.name ? <span className="spinner-sm" /> : t('leave.approve')}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleAction(l, 'Rejected')} disabled={actionId === l.name}>
                      {t('leave.reject')}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title={t('leave.newLeaveRequest')} onClose={() => setShowModal(false)}>
          <LeaveForm leaveTypes={leaveTypes} balance={balance} onSubmit={handleSubmit} onClose={() => setShowModal(false)} />
        </Modal>
      )}
      {ConfirmModalComponent}
    </div>
  );
}
