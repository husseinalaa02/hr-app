import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getDayRequests, createDayRequest, managerApproveDayRequest, hrApproveDayRequest, rejectDayRequest, REQUEST_TYPES } from '../api/dayRequests';
import { getEmployees } from '../api/employees';

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
  const s = STATUS_COLORS[status] || { color: '#374151', bg: '#f3f4f6' };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
      {status}
    </span>
  );
}

function TypeBadge({ type }) {
  const t = TYPE_COLORS[type] || { color: '#374151', bg: '#f3f4f6' };
  return (
    <span style={{ background: t.bg, color: t.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
      {type}
    </span>
  );
}

export default function DayRequests() {
  const { employee, isAdmin, isAudit, isHR, hasPermission } = useAuth();
  const canApprove = hasPermission('day_requests:approve');
  const { addToast } = useToast();

  const [requests, setRequests]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter]       = useState('All');
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId]   = useState(null);

  const [form, setForm] = useState({
    employee_id: '', employee_name: '', request_type: 'Friday Day', request_date: '', notes: '',
  });

  const load = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
      addToast('Please fill all required fields', 'error'); return;
    }
    setSubmitting(true);
    try {
      await createDayRequest(form);
      addToast('Request submitted successfully', 'success');
      setShowModal(false);
      load();
    } catch (e) {
      addToast(e.message || 'Failed to submit request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerApprove = async (id) => {
    setActionId(id);
    try {
      await managerApproveDayRequest(id);
      addToast('Forwarded to HR for final approval', 'success');
      load();
    } catch (e) {
      addToast(e.message || 'Failed to approve request', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleHRApprove = async (id) => {
    setActionId(id);
    try {
      await hrApproveDayRequest(id);
      addToast('Request approved — payroll updated', 'success');
      load();
    } catch (e) {
      addToast(e.message || 'Failed to approve request', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id) => {
    setActionId(id);
    try {
      await rejectDayRequest(id);
      addToast('Request rejected', 'success');
      load();
    } catch (e) {
      addToast(e.message || 'Failed to reject request', 'error');
    } finally {
      setActionId(null);
    }
  };

  const filtered = filter === 'All'
    ? requests
    : filter === 'Pending Manager'
      ? requests.filter(r => r.approval_status === 'Pending Manager' || r.approval_status === 'Pending')
      : requests.filter(r => r.approval_status === filter);

  const counts = {
    All:              requests.length,
    'Pending Manager': requests.filter(r => r.approval_status === 'Pending Manager' || r.approval_status === 'Pending').length,
    'Pending HR':     requests.filter(r => r.approval_status === 'Pending HR').length,
    Approved:         requests.filter(r => r.approval_status === 'Approved').length,
    Rejected:         requests.filter(r => r.approval_status === 'Rejected').length,
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Day Requests</h1>
          <p className="page-subtitle">Friday & Extra Day work requests</p>
        </div>
        {!isAudit && (
          <button className="btn btn-primary" onClick={openModal}>+ New Request</button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {['All', 'Pending Manager', 'Pending HR', 'Approved', 'Rejected'].map(f => (
          <button
            key={f}
            className={`filter-tab${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
            <span className="filter-tab-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Request List */}
      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No {filter !== 'All' ? filter.toLowerCase() : ''} requests found</p>
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
                      ? '+25,000 IQD'
                      : '+Base ÷ 30 IQD'
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
                    {actionId === req.id ? <span className="spinner-sm" /> : '→ Send to HR'}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleReject(req.id)}
                    disabled={actionId === req.id}
                  >
                    Reject
                  </button>
                </div>
              )}
              {isHR && req.approval_status === 'Pending HR' && (
                <div className="request-actions">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleHRApprove(req.id)}
                    disabled={actionId === req.id}
                  >
                    {actionId === req.id ? <span className="spinner-sm" /> : '✓ Final Approve'}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleReject(req.id)}
                    disabled={actionId === req.id}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => !submitting && setShowModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Day Request</span>
              <button className="modal-close" onClick={() => setShowModal(false)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {isAdmin && (
                  <div className="form-group">
                    <label className="form-label">Employee *</label>
                    <select
                      className="form-input"
                      value={form.employee_id}
                      onChange={e => handleEmpChange(e.target.value)}
                    >
                      <option value="">— Select Employee —</option>
                      {employees.map(e => (
                        <option key={e.name} value={e.name}>{e.employee_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Request Type *</label>
                  <select
                    className="form-input"
                    value={form.request_type}
                    onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}
                  >
                    {REQUEST_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.request_date}
                    onChange={e => setForm(f => ({ ...f, request_date: e.target.value }))}
                  />
                </div>

                <div className="form-group form-group-full">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Reason for working this day…"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="form-group form-group-full">
                  <div className="info-box">
                    {form.request_type === 'Friday Day'
                      ? 'Friday Day: Fixed payment of 25,000 IQD will be added to payroll upon approval.'
                      : 'Extra Day: Base Salary ÷ 30 will be added to payroll upon approval.'
                    }
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <span className="spinner-sm" /> : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
