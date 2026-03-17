import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getEmployees } from '../api/employees';
import { getSchedules, getMySchedule, getScheduleHistory, assignSchedule, SHIFT_PRESETS } from '../api/schedules';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import Badge from '../components/Badge';

// Add 8 hours to a HH:MM time string
function addEightHours(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 480; // 8h = 480 min
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fmt(time) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function ShiftBadge({ shift_type, start_time, end_time }) {
  if (!shift_type) return <span className="text-muted">—</span>;
  const colors = {
    morning: { bg: '#e8f5e9', color: '#2e7d32' },
    evening: { bg: '#e3f2fd', color: '#0C447C' },
    custom:  { bg: '#f3e5f5', color: '#6a1b9a' },
  };
  const c = colors[shift_type] || colors.custom;
  const label = SHIFT_PRESETS[shift_type]?.label || 'Custom Shift';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'inline-block', background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
        {label}
      </span>
      {start_time && end_time && (
        <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{fmt(start_time)} – {fmt(end_time)}</span>
      )}
    </div>
  );
}

function AssignScheduleModal({ employees, onClose, onAssigned, preselectedEmployee }) {
  const { employee: me } = useAuth();
  const { addToast } = useToast();
  const [empId, setEmpId] = useState(preselectedEmployee?.name || '');
  const [shiftType, setShiftType] = useState('morning');
  const [customStart, setCustomStart] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const customEnd = customStart ? addEightHours(customStart) : '';
  const preset = SHIFT_PRESETS[shiftType];
  const startTime = shiftType === 'custom' ? customStart : preset.start;
  const endTime   = shiftType === 'custom' ? customEnd   : preset.end;

  const handle = async (e) => {
    e.preventDefault();
    if (!empId) { addToast('Select an employee', 'error'); return; }
    if (shiftType === 'custom' && !customStart) { addToast('Enter a start time for the custom shift', 'error'); return; }
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
      addToast('Schedule assigned successfully', 'success');
      onAssigned();
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to assign schedule', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Assign Work Schedule" onClose={onClose}>
      <form onSubmit={handle} className="form-stack">
        <div className="form-group">
          <label>Employee *</label>
          <select className="form-input" value={empId} onChange={e => setEmpId(e.target.value)} required disabled={!!preselectedEmployee}>
            <option value="">Select employee</option>
            {employees.map(e => (
              <option key={e.name} value={e.name}>{e.employee_name} — {e.designation}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Shift Type *</label>
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
                <div>{preset.label}</div>
                {key !== 'custom' && (
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    {fmt(preset.start)} – {fmt(preset.end)}
                  </div>
                )}
                {key === 'custom' && (
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>8 hrs · you set time</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {shiftType === 'custom' && (
          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input type="time" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>End Time (auto)</label>
              <input type="time" className="form-input" value={customEnd} readOnly style={{ background: 'var(--gray-50)', color: 'var(--gray-500)' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Automatically 8 hours after start</span>
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Effective From *</label>
            <input type="date" className="form-input" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} required />
          </div>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner-sm" /> : 'Assign Schedule'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduleHistoryModal({ employee, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getScheduleHistory(employee.name)
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [employee.name]);

  return (
    <Modal title={`Schedule History — ${employee.employee_name}`} onClose={onClose} size="lg">
      {loading ? (
        <div style={{ padding: 16 }}><Skeleton height={14} /><Skeleton height={14} style={{ marginTop: 8 }} /></div>
      ) : history.length === 0 ? (
        <p className="text-muted" style={{ padding: 16 }}>No schedule history.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Effective Date</th>
                <th>Shift</th>
                <th>Hours</th>
                <th>Assigned By</th>
                <th>Notes</th>
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
  const { employee, isAdmin, isHR } = useAuth();
  const { addToast } = useToast();

  const canManage = isAdmin || isHR;

  const [mySchedule, setMySchedule]   = useState(null);
  const [employees, setEmployees]     = useState([]);
  const [schedules, setSchedules]     = useState([]);  // current schedule per employee
  const [loading, setLoading]         = useState(true);
  const [showAssign, setShowAssign]   = useState(false);
  const [editTarget, setEditTarget]   = useState(null);  // employee to assign/edit
  const [historyTarget, setHistoryTarget] = useState(null);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    try {
      const myS = await getMySchedule(employee.name);
      setMySchedule(myS);

      if (canManage) {
        const emps = await getEmployees({});
        setEmployees(emps);
        const ids = emps.map(e => e.name);
        const sched = await getSchedules(ids);
        setSchedules(sched);
      } else {
        // Manager: load direct reports
        const directReports = await getEmployees({}).then(all =>
          all.filter(e => e.reports_to === employee.name)
        );
        if (directReports.length) {
          setEmployees(directReports);
          const sched = await getSchedules(directReports.map(e => e.name));
          setSchedules(sched);
        }
      }
    } catch (e) {
      addToast(e.message || 'Failed to load schedules', 'error');
    } finally {
      setLoading(false);
    }
  }, [employee?.name, canManage]);

  useEffect(() => { load(); }, [load]);

  const currentScheduleFor = (empId) => schedules.find(s => s.employee === empId) || null;
  const canManageEmployee = (emp) => canManage || emp.reports_to === employee?.name;
  const manageableEmployees = employees.filter(canManageEmployee);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Work Schedules</h1>
          <p className="page-subtitle">View and manage employee shift assignments</p>
        </div>
        {(canManage) && (
          <button className="btn btn-primary" onClick={() => { setEditTarget(null); setShowAssign(true); }}>
            + Assign Schedule
          </button>
        )}
      </div>

      {/* My Schedule Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>My Schedule</h3></div>
        <div className="card-body">
          {loading ? (
            <Skeleton height={50} />
          ) : mySchedule ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <ShiftBadge shift_type={mySchedule.shift_type} start_time={mySchedule.start_time} end_time={mySchedule.end_time} />
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                <span>Effective: <strong style={{ color: 'var(--gray-700)' }}>{mySchedule.effective_date}</strong></span>
                {mySchedule.assigned_by_name && (
                  <span style={{ marginLeft: 16 }}>Assigned by: <strong style={{ color: 'var(--gray-700)' }}>{mySchedule.assigned_by_name}</strong></span>
                )}
                {mySchedule.notes && (
                  <span style={{ marginLeft: 16, fontStyle: 'italic' }}>{mySchedule.notes}</span>
                )}
              </div>
              <button className="btn btn-secondary" style={{ marginLeft: 'auto', fontSize: 12 }}
                onClick={() => setHistoryTarget({ name: employee.name, employee_name: employee.employee_name })}>
                View History
              </button>
            </div>
          ) : (
            <p className="text-muted">No schedule assigned yet. Contact your HR manager.</p>
          )}
        </div>
      </div>

      {/* Manage Schedules Table (admin / HR / direct managers) */}
      {manageableEmployees.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>{canManage ? 'All Employees' : 'Your Direct Reports'}</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Current Shift</th>
                  <th>Effective Date</th>
                  <th>Assigned By</th>
                  <th></th>
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
                ) : manageableEmployees.map(emp => {
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
                          : <span className="text-muted" style={{ fontSize: 13 }}>Not assigned</span>
                        }
                      </td>
                      <td style={{ fontSize: 13 }}>{sched?.effective_date || '—'}</td>
                      <td style={{ fontSize: 13 }}>{sched?.assigned_by_name || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => { setEditTarget(emp); setShowAssign(true); }}>
                            {sched ? 'Change' : 'Assign'}
                          </button>
                          {sched && (
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => setHistoryTarget(emp)}>
                              History
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
          employees={manageableEmployees}
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
