import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getDayRequests, createDayRequest, managerApproveDayRequest, hrApproveDayRequest, rejectDayRequest, REQUEST_TYPES } from '../api/dayRequests';
import { getEmployees } from '../api/employees';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { useConfirm } from '../hooks/useConfirm';

const STATUS_COLORS = {
  Pending:  { color: '#b45309', bg: '#fef3c7' },
  Approved: { color: '#065f46', bg: '#d1fae5' },
  Rejected: { color: '#991b1b', bg: '#fee2e2' },
};

const TYPE_COLORS = {
  'Friday Day': { color: '#1e40af', bg: '#dbeafe' },
  'Extra Day':  { color: '#6b21a8', bg: '#f3e8ff' },
};

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const s = STATUS_COLORS[status] || { color: '#374151', bg: '#f3f4f6' };
  const STATUS_KEYS = {
    Pending: 'dayRequests.statusPending',
    'Pending Manager': 'dayRequests.pendingManager',
    'Pending HR': 'dayRequests.pendingHR',
    Approved: 'dayRequests.approved',
    Rejected: 'dayRequests.rejected',
  };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
      {STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}
    </span>
  );
}

function TypeBadge({ type }) {
  const { t } = useTranslation();
  const c = TYPE_COLORS[type] || { color: '#374151', bg: '#f3f4f6' };
  const TYPE_KEYS = {
    'Friday Day': 'dayRequests.fridayDay',
    'Extra Day': 'dayRequests.extraDay',
  };
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
      {TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : type}
    </span>
  );
}

export default function DayRequests() {
  const { t } = useTranslation();
  const { employee, isAdmin, isAudit, isHR, hasPermission } = useAuth();
  const canApprove = hasPermission('day_requests:approve');
  const { addToast } = useToast();
  const { confirm, ConfirmModalComponent } = useConfirm();

  const [requests, setRequests]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter]       = useState('All');
  const [listTab, setListTab]     = useState('mine');
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId]   = useState(null);

  const [form, setForm] = useState({
    employee_id: '', employee_name: '', request_type: 'Friday Day', request_date: '', notes: '',
  });

  const load = useCallback(async (silent = false) => {
    if (!employee) return;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [reqs, emps] = await Promise.all([
        getDayRequests(
          isAdmin
            ? {}
            : canApprove
              ? { employeeId: employee?.name, managerId: employee?.name }
              : { employeeId: employee?.name }
        ),
        getEmployees(),
      ]);
      setRequests(reqs);
      setEmployees(emps);
    } catch (e) {
      setLoadError(e.message || t('dayRequests.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [employee?.name, isAdmin, isHR, canApprove]);

  useEffect(() => { load(); }, [load]);

  // Pre-fill employee for non-admins
  const openModal = () => {
    setForm({
      employee_id:   isAdmin ? '' : (employee?.name || ''),
      employee_name: isAdmin ? '' : (employee?.employee_name || ''),
      request_type:  'Friday Day',
      request_date:  '',
      notes:         '',
    });
    setShowModal(true);
  };

  const handleEmpChange = (empId) => {
    const emp = employees.find(e => e.name === empId);
    setForm(f => ({ ...f, employee_id: empId, employee_name: emp?.employee_name || '' }));
  };

  const handleSubmit = async () => {
    if (!form.employee_id || !form.request_date) {
      addToast(t('dayRequests.fillRequired'), 'error'); return;
    }
    // M3: client-side duplicate guard before API call
    const duplicate = requests.some(r =>
      r.employee_id === form.employee_id &&
      r.request_date === form.request_date &&
      r.request_type === form.request_type &&
      r.approval_status !== 'Rejected'
    );
    if (duplicate) {
      addToast(t('dayRequests.duplicateRequest'), 'error'); return;
    }
    setSubmitting(true);
    try {
      await createDayRequest(form);
      addToast(t('dayRequests.requestSubmitted'), 'success');
      setShowModal(false);
      load();
    } catch (e) {
      addToast(e.message || t('dayRequests.failedSubmit'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerApprove = async (id) => {
    setActionId(id);
    try {
      await managerApproveDayRequest(id);
      addToast(t('dayRequests.forwardedToHR'), 'success');
      load(true);
    } catch (e) {
      addToast(e.message || t('errors.actionFailed'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleHRApprove = async (id) => {
    setActionId(id);
    try {
      await hrApproveDayRequest(id);
      addToast(t('dayRequests.requestApproved'), 'success');
      load(true);
    } catch (e) {
      addToast(e.message || t('errors.actionFailed'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id) => {
    const ok = await confirm({ message: t('common.confirmReject'), danger: true });
    if (!ok) return;
    setActionId(id);
    try {
      await rejectDayRequest(id);
      addToast(t('dayRequests.requestRejected'), 'success');
      load(true);
    } catch (e) {
      addToast(e.message || t('errors.actionFailed'), 'error');
    } finally {
      setActionId(null);
    }
  };

  // For canApprove non-admin users, split requests by ownership
  const baseRequests = isAdmin
    ? requests
    : canApprove
      ? (listTab === 'mine'
          ? requests.filter(r => r.employee_id === employee?.name)
          : requests.filter(r => r.employee_id !== employee?.name))
      : requests;

  const filtered = filter === 'All'
    ? baseRequests
    : filter === 'Pending Manager'
      ? baseRequests.filter(r => r.approval_status === 'Pending Manager' || r.approval_status === 'Pending')
      : baseRequests.filter(r => r.approval_status === filter);

  const counts = {
    All:              baseRequests.length,
    'Pending Manager': baseRequests.filter(r => r.approval_status === 'Pending Manager' || r.approval_status === 'Pending').length,
    'Pending HR':     baseRequests.filter(r => r.approval_status === 'Pending HR').length,
    Approved:         baseRequests.filter(r => r.approval_status === 'Approved').length,
    Rejected:         baseRequests.filter(r => r.approval_status === 'Rejected').length,
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dayRequests.title')}</h1>
          <p className="page-subtitle">{t('dayRequests.subtitle')}</p>
        </div>
        {!isAudit && !isAdmin && !isHR && (
          <button className="btn btn-primary" onClick={openModal}>{t('dayRequests.newRequest')}</button>
        )}
      </div>

      {/* List Tabs — shown for canApprove non-admin users */}
      {canApprove && !isAdmin && (
        <div className="tab-group" style={{ marginBottom: 16 }}>
          <button className={`tab-btn${listTab === 'mine' ? ' active' : ''}`} onClick={() => setListTab('mine')}>
            {t('dayRequests.myRequests')}
          </button>
          <button className={`tab-btn${listTab === 'pending' ? ' active' : ''}`} onClick={() => setListTab('pending')}>
            {t('dayRequests.pendingApproval')}
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {[
          { key: 'All',             label: t('dayRequests.all') },
          { key: 'Pending Manager', label: t('dayRequests.pendingManager') },
          { key: 'Pending HR',      label: t('dayRequests.pendingHR') },
          { key: 'Approved',        label: t('dayRequests.approved') },
          { key: 'Rejected',        label: t('dayRequests.rejected') },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`filter-tab${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="filter-tab-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {loadError && <ErrorState message={loadError} onRetry={load} />}

      {/* Request List */}
      {loading ? (
        <div className="request-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="request-card">
              <div className="request-card-header">
                <div className="request-card-info">
                  <Skeleton height={14} width="40%" />
                  <div className="request-card-meta" style={{ marginTop: 8 }}>
                    <Skeleton height={12} width={80} />
                    <Skeleton height={12} width={90} />
                  </div>
                </div>
                <Skeleton height={22} width={70} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>{t('dayRequests.noRequests')}</p>
        </div>
      ) : (
        <div className="request-list">
          {filtered.map(req => (
            <div key={req.id} className="request-card">
              <div className="request-card-header">
                <div className="request-card-info">
                  <div className="request-card-name">{req.employee_name}</div>
                  <div className="request-card-meta">
                    <TypeBadge type={req.request_type} />
                    <span className="request-date">{req.request_date}</span>
                  </div>
                  {req.notes && <div className="request-notes">{req.notes}</div>}
                </div>
                <div className="request-card-right">
                  <StatusBadge status={req.approval_status} />
                  <div className="request-payment-hint">
                    {req.request_type === 'Friday Day'
                      ? t('dayRequests.dailyRate')
                      : t('dayRequests.baseRate')
                    }
                  </div>
                </div>
              </div>
              {canApprove && (req.approval_status === 'Pending Manager' || req.approval_status === 'Pending') && (
                <div className="request-actions">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleManagerApprove(req.id)}
                    disabled={actionId === req.id}
                  >
                    {actionId === req.id ? <span className="spinner-sm" /> : t('dayRequests.sendToHR')}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleReject(req.id)}
                    disabled={actionId === req.id}
                  >
                    {t('dayRequests.reject')}
                  </button>
                </div>
              )}
              {(isHR || isAdmin) && req.approval_status === 'Pending HR' && (
                <div className="request-actions">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleHRApprove(req.id)}
                    disabled={actionId === req.id}
                  >
                    {actionId === req.id ? <span className="spinner-sm" /> : t('dayRequests.finalApprove')}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleReject(req.id)}
                    disabled={actionId === req.id}
                  >
                    {t('dayRequests.reject')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      {ConfirmModalComponent}

      {showModal && (
        <div className="modal-backdrop" onClick={() => !submitting && setShowModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('dayRequests.newDayRequest')}</span>
              <button className="modal-close" onClick={() => setShowModal(false)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {isAdmin && (
                  <div className="form-group">
                    <label className="form-label">{t('dayRequests.employee')} *</label>
                    <select
                      className="form-input"
                      value={form.employee_id}
                      onChange={e => handleEmpChange(e.target.value)}
                    >
                      <option value="">{t('dayRequests.selectEmployee')}</option>
                      {employees.map(e => (
                        <option key={e.name} value={e.name}>{e.employee_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{t('dayRequests.requestType')} *</label>
                  <select
                    className="form-input"
                    value={form.request_type}
                    onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}
                  >
                    {REQUEST_TYPES.map(rt => (
                      <option key={rt} value={rt}>{t(`dayRequests.types.${rt.toLowerCase().replace(' ', '_')}`, { defaultValue: rt })}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('dayRequests.date')} *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.request_date}
                    onChange={e => setForm(f => ({ ...f, request_date: e.target.value }))}
                  />
                </div>

                <div className="form-group form-group-full">
                  <label className="form-label">{t('dayRequests.reason')}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('dayRequests.notesPlaceholder')}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="form-group form-group-full">
                  <div className="info-box">
                    {form.request_type === 'Friday Day'
                      ? t('dayRequests.fridayDayInfo')
                      : t('dayRequests.extraDayInfo')
                    }
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={submitting}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <span className="spinner-sm" /> : t('dayRequests.submitRequest')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
