import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getEmployees } from '../api/employees';
import { getSchedules, getMySchedule, getScheduleHistory, assignSchedule, SHIFT_PRESETS } from '../api/schedules';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

// Add 8 hours to a HH:MM time string
function addEightHours(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 480; // 8h = 480 min
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Returns true when end time (start + 8h) crosses midnight
function crossesMidnight(start) {
  if (!start) return false;
  const [h] = start.split(':').map(Number);
  return h >= 16; // start at 16:00+ means end ≥ 00:00 next day
}

function fmt(time) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function ShiftBadge({ shift_type, start_time, end_time }) {
  const { t } = useTranslation();
  if (!shift_type) return <span className="text-muted">—</span>;
  const colors = {
    morning: { bg: '#e8f5e9', color: '#2e7d32' },
    evening: { bg: '#e3f2fd', color: '#0C447C' },
    custom:  { bg: '#f3e5f5', color: '#6a1b9a' },
  };
  const c = colors[shift_type] || colors.custom;
  const labelMap = {
    morning: t('timesheets.morningShift'),
    evening: t('timesheets.eveningShift'),
    custom:  t('timesheets.customShift'),
  };
  const label = labelMap[shift_type] || SHIFT_PRESETS[shift_type]?.label || t('timesheets.customShift');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'inline-block', background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
        {label}
      </span>
      {start_time && end_time && (
        <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
          {fmt(start_time)} – {fmt(end_time)}{crossesMidnight(start_time) && <span style={{ fontSize: 10, marginInlineStart: 4, color: 'var(--gray-400)' }}>{t('timesheets.nextDay')}</span>}
        </span>
      )}
    </div>
  );
}

function AssignScheduleModal({ employees, onClose, onAssigned, preselectedEmployee }) {
  const { t } = useTranslation();
  const { employee: me } = useAuth();
  const { addToast } = useToast();
  const [empId, setEmpId] = useState(preselectedEmployee?.name || '');
  const [shiftType, setShiftType] = useState('morning');
  const [customStart, setCustomStart] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' })
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const customEnd = customStart ? addEightHours(customStart) : '';
  const preset = SHIFT_PRESETS[shiftType];
  const startTime = shiftType === 'custom' ? customStart : preset.start;
  const endTime   = shiftType === 'custom' ? customEnd   : preset.end;

  const shiftLabelMap = {
    morning: t('timesheets.morningShift'),
    evening: t('timesheets.eveningShift'),
    custom:  t('timesheets.customShift'),
  };

  const handle = async (e) => {
    e.preventDefault();
    if (!empId) { addToast(t('timesheets.selectAnEmployee'), 'error'); return; }
    if (shiftType === 'custom' && !customStart) { addToast(t('timesheets.enterStartTime'), 'error'); return; }
    setSaving(true);
    try {
      const emp = employees.find(e => e.name === empId);
      await assignSchedule({
        employee: empId,
        employee_name: emp?.employee_name || empId,
        shift_type: shiftType,
        start_time: startTime,
        end_time: endTime,
        effective_date: effectiveDate,
        assigned_by: me?.name,
        assigned_by_name: me?.employee_name,
        notes,
      });
      addToast(t('timesheets.scheduleAssigned'), 'success');
      onAssigned();
      onClose();
    } catch (err) {
      addToast(err.message || t('timesheets.failedAssign'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('timesheets.assignScheduleTitle')} onClose={onClose}>
      <form onSubmit={handle} className="form-stack" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="form-group">
          <label>{t('employees.employee')} *</label>
          <select className="form-input" value={empId} onChange={e => setEmpId(e.target.value)} required disabled={!!preselectedEmployee}>
            <option value="">{t('timesheets.selectEmployee')}</option>
            {employees.map(e => (
              <option key={e.name} value={e.name}>{e.employee_name} — {e.designation}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{t('timesheets.shiftType')} *</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(SHIFT_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setShiftType(key)}
                style={{
                  flex: 1, minWidth: 100, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${shiftType === key ? 'var(--primary)' : 'var(--gray-200)'}`,
                  background: shiftType === key ? 'var(--primary)' : 'var(--gray-50)',
                  color: shiftType === key ? '#fff' : 'var(--gray-700)',
                  fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
                }}
              >
                <div>{shiftLabelMap[key] || preset.label}</div>
                {key !== 'custom' && (
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    {fmt(preset.start)} – {fmt(preset.end)}
                  </div>
                )}
                {key === 'custom' && (
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{t('timesheets.customShiftHint')}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {shiftType === 'custom' && (
          <div className="form-row">
            <div className="form-group">
              <label>{t('timesheets.startTime')} *</label>
              <input type="time" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('timesheets.endTime')}</label>
              <input type="time" className="form-input" value={customEnd} readOnly style={{ background: 'var(--gray-50)', color: 'var(--gray-500)' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>{t('timesheets.autoEndTime')}</span>
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>{t('timesheets.effectiveFrom')} *</label>
            <input type="date" className="form-input" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} required />
          </div>
        </div>

        <div className="form-group">
          <label>{t('timesheets.notes')}</label>
          <textarea className="form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('timesheets.optionalNote')} style={{ resize: 'vertical' }} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner-sm" /> : t('timesheets.assignScheduleBtn')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduleHistoryModal({ employee, onClose }) {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    getScheduleHistory(employee.name)
      .then(setHistory)
      .catch(() => setLoadError(t('errors.failedLoad')))
      .finally(() => setLoading(false));
  }, [employee.name]);

  return (
    <Modal title={`${t('timesheets.scheduleHistoryTitle')} — ${employee.employee_name}`} onClose={onClose} size="lg">
      {loading ? (
        <div style={{ padding: 16 }}><Skeleton height={14} /><Skeleton height={14} style={{ marginTop: 8 }} /></div>
      ) : loadError ? (
        <p className="text-muted" style={{ padding: 16, color: '#c62828' }}>{loadError}</p>
      ) : history.length === 0 ? (
        <p className="text-muted" style={{ padding: 16 }}>{t('timesheets.noEntries')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('timesheets.effectiveDate')}</th>
                <th>{t('timesheets.shift')}</th>
                <th>{t('timesheets.hours')}</th>
                <th>{t('timesheets.assignedBy')}</th>
                <th>{t('timesheets.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id}>
                  <td>{row.effective_date}</td>
                  <td><ShiftBadge shift_type={row.shift_type} start_time={row.start_time} end_time={row.end_time} /></td>
                  <td style={{ fontSize: 13 }}>{fmt(row.start_time)} – {fmt(row.end_time)}</td>
                  <td style={{ fontSize: 13 }}>{row.assigned_by_name || '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Timesheets() {
  const { t } = useTranslation();
  const { employee, isAdmin, isHR } = useAuth();
  const { addToast } = useToast();

  const canManage = isAdmin || isHR;

  const [mySchedule, setMySchedule]   = useState(null);
  const [employees, setEmployees]     = useState([]);
  const [schedules, setSchedules]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState(null);
  const [showAssign, setShowAssign]   = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setLoadError(null);
    try {
      const myS = await getMySchedule(employee.name);
      setMySchedule(myS);

      if (canManage) {
        const emps = await getEmployees({});
        setEmployees(emps);
        const sched = await getSchedules(emps.map(e => e.name));
        setSchedules(sched);
      }
    } catch (e) {
      setLoadError(e.message || t('timesheets.failedLoadSchedules'));
    } finally {
      setLoading(false);
    }
  }, [employee?.name, canManage]);

  useEffect(() => { load(); }, [load]);

  const currentScheduleFor = (empId) => schedules.find(s => s.employee === empId) || null;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('timesheets.title')}</h1>
          <p className="page-subtitle">{t('timesheets.subtitle')}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => { setEditTarget(null); setShowAssign(true); }}>
            {t('timesheets.newEntry')}
          </button>
        )}
      </div>

      {loadError && <ErrorState message={loadError} onRetry={load} />}

      {/* My Schedule Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>{t('timesheets.mySchedule')}</h3></div>
        <div className="card-body">
          {loading ? (
            <Skeleton height={50} />
          ) : mySchedule ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <ShiftBadge shift_type={mySchedule.shift_type} start_time={mySchedule.start_time} end_time={mySchedule.end_time} />
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                <span>{t('timesheets.effectiveLabel')} <strong style={{ color: 'var(--gray-700)' }}>{mySchedule.effective_date}</strong></span>
                {mySchedule.assigned_by_name && (
                  <span style={{ marginInlineStart: 16 }}>{t('timesheets.assignedByLabel')} <strong style={{ color: 'var(--gray-700)' }}>{mySchedule.assigned_by_name}</strong></span>
                )}
                {mySchedule.notes && (
                  <span style={{ marginInlineStart: 16, fontStyle: 'italic' }}>{mySchedule.notes}</span>
                )}
              </div>
              <button className="btn btn-secondary" style={{ marginInlineStart: 'auto', fontSize: 12 }}
                onClick={() => setHistoryTarget({ name: employee.name, employee_name: employee.employee_name })}>
                {t('timesheets.viewHistory')}
              </button>
            </div>
          ) : (
            <p className="text-muted">{t('timesheets.noSchedule')}</p>
          )}
        </div>
      </div>

      {/* Manage Schedules Table (admin / HR) */}
      {canManage && (
        <div className="card">
          <div className="card-header">
            <h3>{t('timesheets.allEmployees')}</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('timesheets.currentShift')}</th>
                  <th>{t('timesheets.effectiveDate')}</th>
                  <th>{t('timesheets.assignedBy')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j}><Skeleton height={14} /></td>
                      ))}
                    </tr>
                  ))
                ) : employees.map(emp => {
                  const sched = currentScheduleFor(emp.name);
                  return (
                    <tr key={emp.name}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={emp.employee_name} image={emp.image} size={32} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.employee_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{emp.designation}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {sched
                          ? <ShiftBadge shift_type={sched.shift_type} start_time={sched.start_time} end_time={sched.end_time} />
                          : <span className="text-muted" style={{ fontSize: 13 }}>{t('timesheets.notAssigned')}</span>
                        }
                      </td>
                      <td style={{ fontSize: 13 }}>{sched?.effective_date || '—'}</td>
                      <td style={{ fontSize: 13 }}>{sched?.assigned_by_name || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => { setEditTarget(emp); setShowAssign(true); }}>
                            {sched ? t('timesheets.change') : t('timesheets.assign')}
                          </button>
                          {sched && (
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => setHistoryTarget(emp)}>
                              {t('timesheets.history')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAssign && (
        <AssignScheduleModal
          employees={employees}
          preselectedEmployee={editTarget}
          onClose={() => { setShowAssign(false); setEditTarget(null); }}
          onAssigned={load}
        />
      )}

      {historyTarget && (
        <ScheduleHistoryModal
          employee={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
