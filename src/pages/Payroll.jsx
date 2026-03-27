import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useConfirm } from '../hooks/useConfirm';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  Draft:     { color: '#92400e', bg: '#fef3c7', key: 'payroll.draft'          },
  Submitted: { color: '#1e40af', bg: '#dbeafe', key: 'payroll.awaitingPayment' },
  Paid:      { color: '#065f46', bg: '#d1fae5', key: 'payroll.paid'           },
};
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const s = STATUS_CFG[status] || { color: '#374151', bg: '#f3f4f6', key: null };
  const label = s.key ? t(s.key) : status;
  return <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{label}</span>;
}

// ─── Process Log entry ────────────────────────────────────────────────────────
const LOG_ICONS = {
  'Created':              { emoji: '📝', labelKey: 'payroll.logIcon.draft' },
  'Submitted to Finance': { emoji: '📤', labelKey: 'payroll.logIcon.submitted' },
  'Marked as Paid':       { emoji: '✅', labelKey: 'payroll.logIcon.paid' },
};
function LogTimeline({ entries }) {
  const { t, i18n } = useTranslation();
  const tsLocale = i18n.language === 'ar' ? 'ar-IQ' : 'en-GB';
  if (!entries.length) return <p className="text-muted" style={{ fontSize: 13 }}>{t('payroll.noLog')}</p>;
  return (
    <div className="process-log">
      {entries.map((e, i) => {
        const icon = LOG_ICONS[e.action];
        return (
        <div key={e.id ?? i} className="log-entry">
          <div className="log-dot" />
          <div className="log-body">
            <div className="log-action">
              {icon ? <span role="img" aria-label={t(icon.labelKey)}>{icon.emoji}</span> : '•'} {e.action}
            </div>
            <div className="log-by">{e.performed_by_name}</div>
            <div className="log-time">{new Date(e.timestamp).toLocaleString(tsLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' })}</div>
            {e.notes && <div className="log-notes">{e.notes}</div>}
          </div>
        </div>
        );
      })}
    </div>
  );
}

export default function Payroll() {
  const { t } = useTranslation();
  const { employee, isAdmin, isHR, isFinance, isAudit } = useAuth();
  const { addToast } = useToast();
  const { confirm, ConfirmModalComponent } = useConfirm();

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [recs, emps] = await Promise.all([getPayrollRecords(), getEmployees()]);
      setRecords(recs);
      setEmployees(emps);
    } catch (e) {
      setLoadError(e.message || t('payroll.failedLoad'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (r) => {
    setDetail(r);
    setLogLoading(true);
    setLogEntries([]);
    try { setLogEntries(await getPayrollLog(r.id)); }
    catch { setLogEntries([]); }
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

  // Preview uses 0 deductions — actual late/absence deductions are auto-computed
  // from attendance when the record is created. The preview intentionally shows
  // the gross before deductions; a disclaimer is rendered below the total row.
  const previewSalary = () => {
    const base  = Number(form.base_salary) || 0;
    const add   = Number(form.additional_salary) || 0;
    const days  = Number(form.working_days) || 0;
    const fri   = Number(form.friday_bonus) || 0;
    const extra = Number(form.extra_day_bonus) || 0;
    return Math.max(0, calcFinalSalary(base, add, days) + fri + extra);
  };

  const handleCreate = async () => {
    if (!form.employee_id || !form.period_start || !form.period_end) {
      addToast(t('errors.fillRequired'), 'error'); return;
    }
    if (Number(form.base_salary) <= 0) {
      addToast(t('payroll.baseSalaryRequired'), 'error'); return;
    }
    if (form.period_start > form.period_end) {
      addToast(t('payroll.dateOrderError'), 'error'); return;
    }
    setSaving(true);
    try {
      await createPayroll(form, employee);
      addToast(t('payroll.createSuccess'), 'success');
      setShowCreate(false);
      setForm({ employee_id:'', employee_name:'', base_salary:'', additional_salary:'', working_days:'30', friday_bonus:'0', extra_day_bonus:'0', period_start:'', period_end:'' });
      load();
    } catch (e) { addToast(e.message || t('errors.actionFailed'), 'error'); }
    finally { setSaving(false); }
  };

  const handleSubmit = async (r) => {
    setActionId(r.id);
    try {
      await submitPayroll(r.id, employee);
      addToast(t('payroll.submitSuccess', { name: r.employee_name }), 'success');
      setDetail(null);
      load();
    } catch (e) { addToast(e.message || t('errors.actionFailed'), 'error'); }
    finally { setActionId(null); }
  };

  const handlePay = async (r) => {
    const ok = await confirm({ message: t('payroll.confirmPay', { name: r.employee_name, amount: formatIQD(r.calculated_salary) }) });
    if (!ok) return;
    setActionId(r.id);
    try {
      await markAsPaid(r.id, employee);
      addToast(t('payroll.paySuccess', { name: r.employee_name }), 'success');
      setDetail(null);
      load();
    } catch (e) { addToast(e.message || t('errors.actionFailed'), 'error'); }
    finally { setActionId(null); }
  };

  const handleDelete = async (r) => {
    if (r.status !== 'Draft') { addToast(t('payroll.onlyDraftDelete'), 'error'); return; }
    const ok2 = await confirm({ message: t('payroll.confirmDelete', { name: r.employee_name }), danger: true });
    if (!ok2) return;
    setActionId(r.id);
    try {
      await deletePayroll(r.id);
      addToast(t('payroll.deleteSuccess'), 'success');
      load();
    } catch (e) { addToast(e.message || t('errors.actionFailed'), 'error'); }
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

  // Tab definitions: internal key → display label
  const FILTER_TABS = [
    { key: 'All',       label: t('payroll.all')           },
    { key: 'Draft',     label: t('payroll.draft')         },
    { key: 'Submitted', label: t('payroll.awaitingPayment') },
    { key: 'Paid',      label: t('payroll.paid')          },
  ];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('payroll.title')}</h1>
          <p className="page-subtitle">
            {isFinance ? t('payroll.subtitleFinance') : t('payroll.subtitleHR')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isFinance || isAdmin) && (
            <button className="btn btn-secondary" onClick={() => exportPayrollCSV(filtered, t)}>{t('payroll.exportCSV')}</button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('payroll.newPayroll')}</button>
          )}
        </div>
      </div>

      {/* Finance alert banner */}
      {isFinance && counts.Submitted > 0 && (
        <div className="workflow-alert">
          <span>💰 {t('payroll.pendingPayment', { count: counts.Submitted })}</span>
        </div>
      )}

      {/* HR info banner */}
      {canCreate && counts.Draft > 0 && (
        <div className="workflow-info">
          <span>📋 {t('payroll.draftPending', { count: counts.Draft })}</span>
        </div>
      )}

      {/* Workflow diagram */}
      <div className="workflow-steps">
        <div className={`wf-step ${counts.Draft > 0 ? 'wf-active' : 'wf-done'}`}>
          <div className="wf-icon">📝</div>
          <div className="wf-label">{t('payroll.hrCreates')}</div>
          <div className="wf-sub">{t('payroll.draft')}</div>
        </div>
        <div className="wf-arrow">→</div>
        <div className={`wf-step ${counts.Submitted > 0 ? 'wf-active' : counts.Draft > 0 ? '' : 'wf-done'}`}>
          <div className="wf-icon">📤</div>
          <div className="wf-label">{t('payroll.hrSubmits')}</div>
          <div className="wf-sub">{t('payroll.toFinance')}</div>
        </div>
        <div className="wf-arrow">→</div>
        <div className={`wf-step ${counts.Paid > 0 ? 'wf-done' : ''}`}>
          <div className="wf-icon">✅</div>
          <div className="wf-label">{t('payroll.financePays')}</div>
          <div className="wf-sub">{t('payroll.salary')}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs">
        {FILTER_TABS.map(({ key, label }) => (
          <button key={key} className={`filter-tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
            {label}
            <span className="filter-tab-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="info-box" style={{ marginBottom: 12 }}>
          {t('payroll.totalAcross', { amount: formatIQD(totalPayroll), count: filtered.length })}
        </div>
      )}

      {loadError && <ErrorState message={loadError} onRetry={load} />}

      {/* Table */}
      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>{t('payroll.noRecords')}</p>
          {canCreate && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>{t('payroll.newPayroll')}</button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('payroll.employee')}</th>
                <th>{t('payroll.period')}</th>
                <th>{t('payroll.baseSalary')}</th>
                <th>{t('payroll.workingDays')}</th>
                <th>{t('payroll.bonuses')}</th>
                <th>{t('payroll.grossPay')}</th>
                <th>{t('common.status')}</th>
                <th>{t('payroll.processLog')}</th>
                <th>{t('common.actions')}</th>
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
                    {r.friday_bonus > 0      && <div style={{ color: 'var(--primary)' }}>+{formatIQD(r.friday_bonus)} {t('payroll.fri')}</div>}
                    {r.extra_day_bonus > 0   && <div style={{ color: '#7c3aed' }}>+{formatIQD(r.extra_day_bonus)} {t('payroll.extra')}</div>}
                    {r.late_deductions > 0   && <div style={{ color: '#dc2626' }}>−{formatIQD(r.late_deductions)} {t('payroll.late')}</div>}
                    {r.absence_deductions > 0 && <div style={{ color: '#dc2626' }}>−{formatIQD(r.absence_deductions)} {t('payroll.absent')}</div>}
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
                          {actionId === r.id ? <span className="spinner-sm" /> : t('payroll.submitToFinance')}
                        </button>
                      )}
                      {/* Finance: Mark Submitted as Paid */}
                      {canPay && r.status === 'Submitted' && (
                        <button className="btn btn-sm btn-success" onClick={() => handlePay(r)} disabled={actionId === r.id}>
                          {actionId === r.id ? <span className="spinner-sm" /> : `✓ ${t('payroll.markAsPaid')}`}
                        </button>
                      )}
                      {/* HR: Delete Draft */}
                      {canCreate && r.status === 'Draft' && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r)} disabled={actionId === r.id}>
                          {t('payroll.deletePayroll')}
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
              <span className="modal-title">{t('payroll.createPayroll')}</span>
              <button className="modal-close" onClick={() => setShowCreate(false)} disabled={saving}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group form-group-full">
                  <label className="form-label">{t('payroll.employee')} *</label>
                  <select className="form-input" value={form.employee_id} onChange={e => handleEmpChange(e.target.value)}>
                    <option value="">— {t('common.select')} —</option>
                    {employees.map(e => <option key={e.name} value={e.name}>{e.employee_name} — {e.designation}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.periodStart')} *</label>
                  <input type="date" className="form-input" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.periodEnd')} *</label>
                  <input type="date" className="form-input" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.baseSalary')} (IQD)</label>
                  <input type="number" className="form-input" min="0" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.additionalSalary')} (IQD)</label>
                  <input type="number" className="form-input" min="0" value={form.additional_salary} onChange={e => setForm(f => ({ ...f, additional_salary: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.workingDays')}</label>
                  <input type="number" className="form-input" min="1" max="31" value={form.working_days} onChange={e => setForm(f => ({ ...f, working_days: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.fridayBonus')} (IQD)</label>
                  <input type="number" className="form-input" min="0" value={form.friday_bonus} onChange={e => setForm(f => ({ ...f, friday_bonus: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.extraDayBonus')} (IQD)</label>
                  <input type="number" className="form-input" min="0" value={form.extra_day_bonus} onChange={e => setForm(f => ({ ...f, extra_day_bonus: e.target.value }))} />
                </div>

                {form.base_salary && (
                  <div className="form-group form-group-full">
                    <div className="salary-preview">
                      <div className="salary-preview-title">{t('payroll.salaryPreview')}</div>
                      <div className="salary-preview-row">
                        <span>{t('payroll.dailySalary')} ((Base+Additional)÷30)</span>
                        <span>{formatIQD(calcDailySalary(Number(form.base_salary), Number(form.additional_salary)))}</span>
                      </div>
                      <div className="salary-preview-row">
                        <span>{t('payroll.baseXDays', { days: form.working_days })}</span>
                        <span>{formatIQD(calcFinalSalary(Number(form.base_salary), Number(form.additional_salary), Number(form.working_days)))}</span>
                      </div>
                      {Number(form.friday_bonus) > 0 && (
                        <div className="salary-preview-row"><span>{t('payroll.fridayBonus')}</span><span style={{ color: 'var(--primary)' }}>+{formatIQD(Number(form.friday_bonus))}</span></div>
                      )}
                      {Number(form.extra_day_bonus) > 0 && (
                        <div className="salary-preview-row"><span>{t('payroll.extraDayBonus')}</span><span style={{ color: '#7c3aed' }}>+{formatIQD(Number(form.extra_day_bonus))}</span></div>
                      )}
                      <div className="salary-preview-row salary-preview-total">
                        <span>{t('payroll.total')}</span><span>{formatIQD(previewSalary())}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'end' }}>
                        * {t('payroll.previewNote')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={saving}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                  {saving ? <span className="spinner-sm" /> : t('payroll.createPayroll')}
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
              <span className="modal-title">{t('payroll.title')} — {detail.employee_name}</span>
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Left: Salary breakdown */}
                <div>
                  <div className="detail-section-label">{t('payroll.salaryBreakdown')}</div>
                  <div className="salary-preview">
                    <div className="salary-preview-row"><span>{t('payroll.period')}</span><span style={{ fontSize: 12 }}>{detail.period_start} — {detail.period_end}</span></div>
                    <div className="salary-preview-row"><span>{t('payroll.baseSalary')}</span><span>{formatIQD(detail.base_salary)}</span></div>
                    <div className="salary-preview-row"><span>{t('payroll.additionalSalary')}</span><span>{formatIQD(detail.additional_salary)}</span></div>
                    <div className="salary-preview-row"><span>{t('payroll.dailySalary')}</span><span>{formatIQD(calcDailySalary(detail.base_salary, detail.additional_salary))}</span></div>
                    <div className="salary-preview-row"><span>{t('payroll.workingDays')}</span><span>{detail.working_days}</span></div>
                    {detail.friday_bonus > 0    && <div className="salary-preview-row"><span>{t('payroll.fridayBonus')}</span><span style={{ color: 'var(--primary)' }}>+{formatIQD(detail.friday_bonus)}</span></div>}
                    {detail.extra_day_bonus > 0 && <div className="salary-preview-row"><span>{t('payroll.extraDayBonus')}</span><span style={{ color: '#7c3aed' }}>+{formatIQD(detail.extra_day_bonus)}</span></div>}
                    {(detail.late_deductions > 0) && <div className="salary-preview-row"><span>{t('payroll.lateDeductions')}</span><span style={{ color: '#dc2626' }}>−{formatIQD(detail.late_deductions)}</span></div>}
                    {(detail.absence_deductions > 0) && <div className="salary-preview-row"><span>{t('payroll.absenceDeductions')}</span><span style={{ color: '#dc2626' }}>−{formatIQD(detail.absence_deductions)}</span></div>}
                    <div className="salary-preview-row salary-preview-total"><span>{t('payroll.netPay')}</span><span>{formatIQD(detail.calculated_salary)}</span></div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                    <StatusBadge status={detail.status} />
                  </div>
                </div>

                {/* Right: Process log */}
                <div>
                  <div className="detail-section-label">{t('payroll.processLog')}</div>
                  {logLoading ? <div className="loading-center"><span className="spinner" /></div> : <LogTimeline entries={logEntries} />}
                </div>
              </div>
              {/* Modal footer actions */}
              {(canCreate && detail.status === 'Draft') || (canPay && detail.status === 'Submitted') ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  {canCreate && detail.status === 'Draft' && (
                    <button className="btn btn-primary btn-sm" disabled={actionId === detail.id} onClick={() => handleSubmit(detail)}>
                      {t('payroll.submitToFinance')}
                    </button>
                  )}
                  {canPay && detail.status === 'Submitted' && (
                    <button className="btn btn-sm btn-success" disabled={actionId === detail.id} onClick={() => handlePay(detail)}>
                      {`✓ ${t('payroll.markAsPaid')}`}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {ConfirmModalComponent}
    </div>
  );
}
