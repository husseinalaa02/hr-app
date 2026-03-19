import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getPayrollRecords, createPayroll, updatePayroll, deletePayroll,
  submitPayroll, markAsPaid, getPayrollLog,
  calcDailySalary, calcFinalSalary, exportPayrollCSV,
} from '../api/payroll';
import { getEmployees } from '../api/employees';
import { formatIQD } from '../utils/format';
import ErrorState from '../components/ErrorState';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  Draft:     { color: '#92400e', bg: '#fef3c7', label: 'Draft'     },
  Submitted: { color: '#1e40af', bg: '#dbeafe', label: 'Awaiting Payment' },
  Paid:      { color: '#065f46', bg: '#d1fae5', label: 'Paid'      },
};
function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || { color: '#374151', bg: '#f3f4f6', label: status };
  return <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{s.label}</span>;
}

// ─── Process Log entry ────────────────────────────────────────────────────────
const LOG_ICONS = { 'Created': '📝', 'Submitted to Finance': '📤', 'Marked as Paid': '✅' };
function LogTimeline({ entries }) {
  if (!entries.length) return <p className="text-muted" style={{ fontSize: 13 }}>No log entries yet.</p>;
  return (
    <div className="process-log">
      {entries.map((e, i) => (
        <div key={e.id ?? i} className="log-entry">
          <div className="log-dot" />
          <div className="log-body">
            <div className="log-action">{LOG_ICONS[e.action] || '•'} {e.action}</div>
            <div className="log-by">{e.performed_by_name}</div>
            <div className="log-time">{new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            {e.notes && <div className="log-notes">{e.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Payroll() {
  const { employee, isAdmin, isHR, isFinance, isAudit } = useAuth();
  const { addToast } = useToast();

  const canCreate = (isAdmin || isHR) && !isAudit;
  const canPay    = isFinance || isAdmin;

  const [records, setRecords]       = useState([]);
  const [employees, setEmployees]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(null);
  const [filter, setFilter]         = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail]         = useState(null);
  const [logEntries, setLogEntries] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [actionId, setActionId]     = useState(null);

  const [form, setForm] = useState({
    employee_id: '', employee_name: '',
    base_salary: '', additional_salary: '',
    working_days: '30', friday_bonus: '0', extra_day_bonus: '0',
    period_start: '', period_end: '',
  });

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [recs, emps] = await Promise.all([getPayrollRecords(), getEmployees()]);
      setRecords(recs);
      setEmployees(emps);
    } catch (e) {
      setLoadError(e.message || 'Failed to load payroll data');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (r) => {
    setDetail(r);
    setLogLoading(true);
    setLogEntries([]);
    try { setLogEntries(await getPayrollLog(r.id)); }
    finally { setLogLoading(false); }
  };

  const handleEmpChange = (empId) => {
    const emp = employees.find(e => e.name === empId);
    setForm(f => ({
      ...f,
      employee_id:   empId,
      employee_name: emp?.employee_name || '',
      // Salary fields are not stored on the employee record — HR enters them manually
    }));
  };

  const previewSalary = () => {
    const base  = Number(form.base_salary) || 0;
    const add   = Number(form.additional_salary) || 0;
    const days  = Number(form.working_days) || 0;
    const fri   = Number(form.friday_bonus) || 0;
    const extra = Number(form.extra_day_bonus) || 0;
    return calcFinalSalary(base, add, days) + fri + extra;
  };

  const handleCreate = async () => {
    if (!form.employee_id || !form.period_start || !form.period_end) {
      addToast('Please fill all required fields', 'error'); return;
    }
    setSaving(true);
    try {
      await createPayroll(form, employee);
      addToast('Payroll record created as Draft', 'success');
      setShowCreate(false);
      setForm({ employee_id:'', employee_name:'', base_salary:'', additional_salary:'', working_days:'30', friday_bonus:'0', extra_day_bonus:'0', period_start:'', period_end:'' });
      load();
    } catch (e) { addToast(e.message || 'Failed to create payroll', 'error'); }
    finally { setSaving(false); }
  };

  const handleSubmit = async (r) => {
    setActionId(r.id);
    try {
      await submitPayroll(r.id, employee);
      addToast(`${r.employee_name}'s payroll submitted to Finance`, 'success');
      load();
      if (detail?.id === r.id) openDetail({ ...r, status: 'Submitted' });
    } catch (e) { addToast(e.message || 'Failed to submit', 'error'); }
    finally { setActionId(null); }
  };

  const handlePay = async (r) => {
    if (!window.confirm(
      `Mark ${r.employee_name}'s salary of ${formatIQD(r.calculated_salary)} as Paid?\n\nThis cannot be undone.`
    )) return;
    setActionId(r.id);
    try {
      await markAsPaid(r.id, employee);
      addToast(`${r.employee_name}'s salary marked as Paid`, 'success');
      load();
      if (detail?.id === r.id) openDetail({ ...r, status: 'Paid' });
    } catch (e) { addToast(e.message || 'Failed to mark as paid', 'error'); }
    finally { setActionId(null); }
  };

  const handleDelete = async (r) => {
    if (r.status !== 'Draft') { addToast('Only Draft records can be deleted', 'error'); return; }
    setActionId(r.id);
    try {
      await deletePayroll(r.id);
      addToast('Deleted', 'success');
      load();
    } catch (e) { addToast('Failed to delete', 'error'); }
    finally { setActionId(null); }
  };

  // Finance defaults to showing Submitted (pending payment)
  useEffect(() => { if (isFinance) setFilter('Submitted'); }, [isFinance]);

  const filtered = filter === 'All' ? records : records.filter(r => r.status === filter);

  const counts = {
    All:       records.length,
    Draft:     records.filter(r => r.status === 'Draft').length,
    Submitted: records.filter(r => r.status === 'Submitted').length,
    Paid:      records.filter(r => r.status === 'Paid').length,
  };
  const totalPayroll = filtered.reduce((s, r) => s + r.calculated_salary, 0);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">
            {isFinance ? 'Finance — review submitted payrolls and process payments' : 'HR — manage payroll records and submit to Finance'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isFinance || isAdmin) && (
            <button className="btn btn-secondary" onClick={() => exportPayrollCSV(filtered)}>Export CSV</button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Payroll</button>
          )}
        </div>
      </div>

      {/* Finance alert banner */}
      {isFinance && counts.Submitted > 0 && (
        <div className="workflow-alert">
          <span>💰 {counts.Submitted} payroll record{counts.Submitted > 1 ? 's' : ''} pending payment</span>
        </div>
      )}

      {/* HR info banner */}
      {canCreate && counts.Draft > 0 && (
        <div className="workflow-info">
          <span>📋 {counts.Draft} Draft record{counts.Draft > 1 ? 's' : ''} — review and submit to Finance when ready</span>
        </div>
      )}

      {/* Workflow diagram */}
      <div className="workflow-steps">
        <div className={`wf-step ${counts.Draft > 0 ? 'wf-active' : 'wf-done'}`}>
          <div className="wf-icon">📝</div>
          <div className="wf-label">HR Creates</div>
          <div className="wf-sub">Draft</div>
        </div>
        <div className="wf-arrow">→</div>
        <div className={`wf-step ${counts.Submitted > 0 ? 'wf-active' : counts.Draft > 0 ? '' : 'wf-done'}`}>
          <div className="wf-icon">📤</div>
          <div className="wf-label">HR Submits</div>
          <div className="wf-sub">to Finance</div>
        </div>
        <div className="wf-arrow">→</div>
        <div className={`wf-step ${counts.Paid > 0 ? 'wf-done' : ''}`}>
          <div className="wf-icon">✅</div>
          <div className="wf-label">Finance Pays</div>
          <div className="wf-sub">Salary</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs">
        {['All','Draft','Submitted','Paid'].map(f => (
          <button key={f} className={`filter-tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'Submitted' ? 'Pending Payment' : f}
            <span className="filter-tab-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="info-box" style={{ marginBottom: 12 }}>
          Total: <strong>{formatIQD(totalPayroll)}</strong> across {filtered.length} records
        </div>
      )}

      {loadError && <ErrorState message={loadError} onRetry={load} />}

      {/* Table */}
      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No {filter !== 'All' ? filter.toLowerCase() : ''} payroll records</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Base Salary</th>
                <th>Days</th>
                <th>Bonuses</th>
                <th>Total Salary</th>
                <th>Status</th>
                <th>Process Info</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="table-row-hover" style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                  <td>
                    <div className="table-emp-name">{r.employee_name}</div>
                    <div className="table-emp-id">{r.employee_id}</div>
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{r.period_start}<br />{r.period_end}</td>
                  <td>
                    <div>{formatIQD(r.base_salary)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{formatIQD(r.additional_salary)}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.working_days}</td>
                  <td style={{ fontSize: 12 }}>
                    {r.friday_bonus > 0      && <div style={{ color: 'var(--primary)' }}>+{formatIQD(r.friday_bonus)} Fri</div>}
                    {r.extra_day_bonus > 0   && <div style={{ color: '#7c3aed' }}>+{formatIQD(r.extra_day_bonus)} Extra</div>}
                    {r.late_deductions > 0   && <div style={{ color: '#dc2626' }}>−{formatIQD(r.late_deductions)} Late</div>}
                    {r.absence_deductions > 0 && <div style={{ color: '#dc2626' }}>−{formatIQD(r.absence_deductions)} Absent</div>}
                    {!r.friday_bonus && !r.extra_day_bonus && !r.late_deductions && !r.absence_deductions && <span className="text-muted">—</span>}
                  </td>
                  <td><strong style={{ color: 'var(--primary)' }}>{formatIQD(r.calculated_salary)}</strong></td>
                  <td onClick={e => e.stopPropagation()}><StatusBadge status={r.status} /></td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }} onClick={e => e.stopPropagation()}>
                    {r.submitted_by_name && <div>📤 {r.submitted_by_name}</div>}
                    {r.paid_by_name      && <div>✅ {r.paid_by_name}</div>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* HR: Submit Draft to Finance */}
                      {canCreate && r.status === 'Draft' && (
                        <button className="btn btn-sm btn-primary" onClick={() => handleSubmit(r)} disabled={actionId === r.id}>
                          {actionId === r.id ? <span className="spinner-sm" /> : 'Submit to Finance'}
                        </button>
                      )}
                      {/* Finance: Mark Submitted as Paid */}
                      {canPay && r.status === 'Submitted' && (
                        <button className="btn btn-sm btn-success" onClick={() => handlePay(r)} disabled={actionId === r.id}>
                          {actionId === r.id ? <span className="spinner-sm" /> : '✓ Mark as Paid'}
                        </button>
                      )}
                      {/* HR: Delete Draft */}
                      {canCreate && r.status === 'Draft' && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r)} disabled={actionId === r.id}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => !saving && setShowCreate(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Payroll Record</span>
              <button className="modal-close" onClick={() => setShowCreate(false)} disabled={saving}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group form-group-full">
                  <label className="form-label">Employee *</label>
                  <select className="form-input" value={form.employee_id} onChange={e => handleEmpChange(e.target.value)}>
                    <option value="">— Select Employee —</option>
                    {employees.map(e => <option key={e.name} value={e.name}>{e.employee_name} — {e.designation}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Period Start *</label>
                  <input type="date" className="form-input" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Period End *</label>
                  <input type="date" className="form-input" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Base Salary (IQD)</label>
                  <input type="number" className="form-input" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Additional Salary (IQD)</label>
                  <input type="number" className="form-input" value={form.additional_salary} onChange={e => setForm(f => ({ ...f, additional_salary: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Working Days</label>
                  <input type="number" className="form-input" min="1" max="31" value={form.working_days} onChange={e => setForm(f => ({ ...f, working_days: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Friday Bonus (IQD)</label>
                  <input type="number" className="form-input" value={form.friday_bonus} onChange={e => setForm(f => ({ ...f, friday_bonus: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Extra Day Bonus (IQD)</label>
                  <input type="number" className="form-input" value={form.extra_day_bonus} onChange={e => setForm(f => ({ ...f, extra_day_bonus: e.target.value }))} />
                </div>

                {form.base_salary && (
                  <div className="form-group form-group-full">
                    <div className="salary-preview">
                      <div className="salary-preview-title">Salary Preview</div>
                      <div className="salary-preview-row">
                        <span>Daily Rate ((Base+Additional)÷30)</span>
                        <span>{formatIQD(calcDailySalary(Number(form.base_salary), Number(form.additional_salary)))}</span>
                      </div>
                      <div className="salary-preview-row">
                        <span>Base × {form.working_days} days</span>
                        <span>{formatIQD(calcFinalSalary(Number(form.base_salary), Number(form.additional_salary), Number(form.working_days)))}</span>
                      </div>
                      {Number(form.friday_bonus) > 0 && (
                        <div className="salary-preview-row"><span>Friday Bonus</span><span style={{ color: 'var(--primary)' }}>+{formatIQD(Number(form.friday_bonus))}</span></div>
                      )}
                      {Number(form.extra_day_bonus) > 0 && (
                        <div className="salary-preview-row"><span>Extra Day Bonus</span><span style={{ color: '#7c3aed' }}>+{formatIQD(Number(form.extra_day_bonus))}</span></div>
                      )}
                      <div className="salary-preview-row salary-preview-total">
                        <span>Total</span><span>{formatIQD(previewSalary())}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                  {saving ? <span className="spinner-sm" /> : 'Create Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail + Log Modal ── */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Payroll Detail — {detail.employee_name}</span>
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Left: Salary breakdown */}
                <div>
                  <div className="detail-section-label">Salary Breakdown</div>
                  <div className="salary-preview">
                    <div className="salary-preview-row"><span>Period</span><span style={{ fontSize: 12 }}>{detail.period_start} — {detail.period_end}</span></div>
                    <div className="salary-preview-row"><span>Base Salary</span><span>{formatIQD(detail.base_salary)}</span></div>
                    <div className="salary-preview-row"><span>Additional Salary</span><span>{formatIQD(detail.additional_salary)}</span></div>
                    <div className="salary-preview-row"><span>Daily Rate</span><span>{formatIQD(calcDailySalary(detail.base_salary, detail.additional_salary))}</span></div>
                    <div className="salary-preview-row"><span>Working Days</span><span>{detail.working_days}</span></div>
                    {detail.friday_bonus > 0    && <div className="salary-preview-row"><span>Friday Bonus</span><span style={{ color: 'var(--primary)' }}>+{formatIQD(detail.friday_bonus)}</span></div>}
                    {detail.extra_day_bonus > 0 && <div className="salary-preview-row"><span>Extra Day Bonus</span><span style={{ color: '#7c3aed' }}>+{formatIQD(detail.extra_day_bonus)}</span></div>}
                    {(detail.late_deductions > 0) && <div className="salary-preview-row"><span>Late Deductions</span><span style={{ color: '#dc2626' }}>−{formatIQD(detail.late_deductions)}</span></div>}
                    {(detail.absence_deductions > 0) && <div className="salary-preview-row"><span>Absence Deductions</span><span style={{ color: '#dc2626' }}>−{formatIQD(detail.absence_deductions)}</span></div>}
                    <div className="salary-preview-row salary-preview-total"><span>Final Salary</span><span>{formatIQD(detail.calculated_salary)}</span></div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                    <StatusBadge status={detail.status} />
                  </div>
                </div>

                {/* Right: Process log */}
                <div>
                  <div className="detail-section-label">Process Log</div>
                  {logLoading ? <div className="loading-center"><span className="spinner" /></div> : <LogTimeline entries={logEntries} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
