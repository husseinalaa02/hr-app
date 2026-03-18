import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getLeaveApplications, getPendingApprovals, getAllApprovedLeaves,
  submitLeaveApplication, updateLeaveStatus, getLeaveTypes,
  getLeaveBalance, calcHours, calcDays,
} from '../api/leave';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

const BALANCE_COLORS = {
  'Annual Leave':  '#0C447C',
  'Sick Leave':    '#2e7d32',
  'Casual Leave':  '#ef6c00',
  'Hourly Leave':  '#6a1b9a',
};

function BalanceBar({ label, remaining, allocated, unit, color }) {
  const pct = allocated > 0 ? Math.max(0, (remaining / allocated) * 100) : 0;
  return (
    <div className="balance-bar-item">
      <div className="balance-bar-header">
        <span className="balance-bar-label">{label}</span>
        <span className="balance-bar-value" style={{ color }}>
          <strong>{remaining}</strong> / {allocated} {unit} left
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
  const { addToast } = useToast();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const hours = isHourly ? calcHours(form.from_time, form.to_time) : 0;
  const days  = !isHourly && form.from_date && form.to_date
    ? calcDays(form.from_date, form.to_date)
    : 0;

  const hourlyBalance  = balance.find(b => b.is_hourly);
  const selectedBal    = isHourly ? hourlyBalance : balance.find(b => b.leave_type === form.leave_type);
  const requested      = isHourly ? hours : days;
  const insufficient   = selectedBal && requested > 0 && requested > selectedBal.remaining;

  const handle = async (e) => {
    e.preventDefault();
    if (isHourly && hours <= 0) { addToast('To time must be after from time.', 'error'); return; }
    if (insufficient) {
      addToast(
        `Not enough balance. Only ${selectedBal.remaining} ${selectedBal.unit} remaining.`,
        'error'
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...form, is_hourly: isHourly });
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to submit leave', 'error');
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
          onClick={() => setIsHourly(false)}
        >
          📅 Full / Multi Day
        </button>
        <button
          type="button"
          className={`mode-btn ${isHourly ? 'active' : ''}`}
          onClick={() => setIsHourly(true)}
        >
          ⏱ Hourly
        </button>
      </div>

      {/* Leave type — only for daily */}
      {!isHourly && (
        <div className="form-group">
          <label>Leave Type *</label>
          <select className="form-input" value={form.leave_type} onChange={e => set('leave_type', e.target.value)} required>
            <option value="">Select leave type</option>
            {leaveTypes.map(t => {
              const bal = balance.find(b => b.leave_type === t && !b.is_hourly);
              return (
                <option key={t} value={t}>
                  {t}{bal ? ` (${bal.remaining} days left)` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {isHourly && hourlyBalance && (
        <div className="hourly-balance-hint">
          <span>⏱ Hourly Leave balance:</span>
          <strong style={{ color: '#6a1b9a' }}>{hourlyBalance.remaining}h / {hourlyBalance.allocated}h</strong>
        </div>
      )}

      {/* Date(s) */}
      <div className={isHourly ? 'form-group' : 'form-row'}>
        <div className="form-group">
          <label>{isHourly ? 'Date *' : 'From Date *'}</label>
          <input type="date" className="form-input" value={form.from_date}
            onChange={e => set('from_date', e.target.value)} required />
        </div>
        {!isHourly && (
          <div className="form-group">
            <label>To Date *</label>
            <input type="date" className="form-input" value={form.to_date}
              onChange={e => set('to_date', e.target.value)} required />
          </div>
        )}
      </div>

      {/* Time pickers — hourly only */}
      {isHourly && (
        <div className="form-row">
          <div className="form-group">
            <label>From Time *</label>
            <input type="time" className="form-input" value={form.from_time}
              onChange={e => set('from_time', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>To Time *</label>
            <input type="time" className="form-input" value={form.to_time}
              onChange={e => set('to_time', e.target.value)} required />
          </div>
        </div>
      )}

      {/* Preview */}
      {(requested > 0) && (
        <div className={`days-preview ${insufficient ? 'days-preview-error' : 'days-preview-ok'}`}>
          {isHourly
            ? `${hours.toFixed(1)} hour(s) requested`
            : `${days} day(s) requested`}
          {selectedBal && !insufficient && (
            <span> — {(selectedBal.remaining - requested).toFixed(isHourly ? 1 : 0)} {selectedBal.unit} will remain after</span>
          )}
          {insufficient && (
            <span> — exceeds balance ({selectedBal.remaining} {selectedBal.unit} left)</span>
          )}
        </div>
      )}

      <div className="form-group">
        <label>Reason</label>
        <textarea className="form-input" rows={2} value={form.description}
          onChange={e => set('description', e.target.value)} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving || insufficient}>
          {saving ? <span className="spinner-sm" /> : 'Submit Request'}
        </button>
      </div>
    </form>
  );
}

export default function LeaveRequests() {
  const { employee, isAdmin, isHR, hasPermission } = useAuth();
  const canApprove = hasPermission('leave:approve');
  const { addToast } = useToast();
  const [tab, setTab] = useState(isAdmin ? 'pending' : 'my');
  const [myLeaves, setMyLeaves] = useState([]);
  const [pending, setPending] = useState([]);
  const [allApproved, setAllApproved] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balance, setBalance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
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
      setError(e.message || 'Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [employee?.name, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form) => {
    await submitLeaveApplication({ employee: employee.name, employee_name: employee.employee_name, ...form });
    addToast('Leave request submitted', 'success');
    load();
  };

  const handleAction = async (leaveApp, action) => {
    try {
      const actorRole = isHR && leaveApp.approval_stage === 'Pending HR' ? 'hr' : 'manager';
      await updateLeaveStatus(leaveApp.name, action, actorRole);
      addToast(`Leave ${action.toLowerCase()}`, 'success');
      load();
    } catch (err) {
      addToast(err.message || 'Action failed', 'error');
    }
  };

  const rows = tab === 'my' ? myLeaves : tab === 'approved' ? allApproved : pending;

  return (
    <div className="page-content">

      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Requests</h1>
          <p className="page-subtitle">Manage time off, approvals, and leave balances</p>
        </div>
        {tab === 'my' && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Request</button>
        )}
      </div>

      {/* Balance panel */}
      {!isAdmin && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Leave Balance</h3></div>
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'my' ? ' active' : ''}`} onClick={() => setTab('my')}>My Leaves</button>
          {canApprove && (
            <button className={`tab-btn${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
              Team Approvals {pending.length > 0 && <span className="badge-count">{pending.length}</span>}
            </button>
          )}
          {isAdmin && (
            <button className={`tab-btn${tab === 'approved' ? ' active' : ''}`} onClick={() => setTab('approved')}>
              All Approved {allApproved.length > 0 && <span className="badge-count">{allApproved.length}</span>}
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
            <p className="text-center text-muted" style={{ padding: '32px 16px' }}>
              {tab === 'pending'  ? 'No pending requests from your team'
               : tab === 'approved' ? 'No approved leave records found'
               : 'No leave records found'}
            </p>
          </div>
        ) : rows.map(l => {
          const isHourly = !!l.total_hours;
          return (
            <div key={l.name} className="leave-item-card">
              <div className="leave-item-top">
                <div className="leave-item-info">
                  {(tab === 'pending' || tab === 'approved') && (
                    <div className="leave-item-employee">{l.employee_name}</div>
                  )}
                  {(tab === 'pending' && l.approval_stage) && (
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2,
                      color: l.approval_stage === 'Pending HR' ? '#7c3aed' : '#b45309' }}>
                      {l.approval_stage === 'Pending HR' ? '⏳ Awaiting HR Approval' : '⏳ Awaiting Manager Approval'}
                    </div>
                  )}
                  <div className="leave-item-type">
                    {l.leave_type}
                    {isHourly && <span className="hourly-tag">Hourly</span>}
                  </div>
                  <div className="leave-item-dates">
                    {l.from_date}
                    {isHourly && l.from_time
                      ? <span> · {l.from_time}–{l.to_time}</span>
                      : l.to_date && l.to_date !== l.from_date
                        ? <span> → {l.to_date}</span>
                        : null}
                  </div>
                </div>
                <div className="leave-item-right">
                  <span className={`duration-badge ${isHourly ? 'hourly' : 'daily'}`}>
                    {isHourly ? `${l.total_hours}h` : `${l.total_leave_days}d`}
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
                    <button className="btn btn-sm btn-success" onClick={() => handleAction(l, 'Approved')}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleAction(l, 'Rejected')}>
                      ✕ Reject
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title="New Leave Request" onClose={() => setShowModal(false)}>
          <LeaveForm leaveTypes={leaveTypes} balance={balance} onSubmit={handleSubmit} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}
