import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getTimesheets, submitTimesheet, getProjects, getTasks } from '../api/timesheets';
import Badge from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekDates(weekStart) {
  const dates = [];
  const start = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getThisWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export default function Timesheets() {
  const { employee, isAdmin } = useAuth();
  const { addToast } = useToast();
  const [timesheets, setTimesheets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weekStart, setWeekStart] = useState(getThisWeekStart());
  const [showGrid, setShowGrid] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [hours, setHours] = useState({});
  const [saving, setSaving] = useState(false);

  const weekDates = getWeekDates(weekStart);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      const [ts, proj] = await Promise.all([
        getTimesheets(employee.name),
        getProjects(),
      ]);
      setTimesheets(ts);
      setProjects(proj);
    } catch (e) {
      setError(e.message || 'Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  }, [employee?.name]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedProject) { setTasks([]); return; }
    getTasks(selectedProject).then(setTasks).catch(() => setTasks([]));
  }, [selectedProject]);

  const handleHourChange = (date, val) => {
    setHours((h) => ({ ...h, [date]: val }));
  };

  const handleSubmitGrid = async () => {
    if (!selectedProject) { addToast('Select a project first', 'error'); return; }
    const details = Object.entries(hours)
      .filter(([, h]) => h && parseFloat(h) > 0)
      .map(([date, h]) => ({
        activity_type: 'Execution',
        from_time: `${date} 09:00:00`,
        to_time: `${date} ${String(9 + parseFloat(h)).padStart(2, '0')}:00:00`,
        hours: parseFloat(h),
        project: selectedProject,
        task: selectedTask || undefined,
        description: '',
      }));

    if (!details.length) { addToast('Enter at least one hour entry', 'error'); return; }

    setSaving(true);
    try {
      await submitTimesheet({
        employee: employee.name,
        employee_name: employee.employee_name,
        company: employee.company,
        start_date: weekStart,
        end_date: weekDates[6],
        time_logs: details,
      });
      addToast('Timesheet submitted', 'success');
      setHours({});
      setShowGrid(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Submit failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalHours = Object.values(hours).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <p className="page-subtitle">Log and review weekly working hours</p>
        </div>
      </div>
      <div className="page-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label className="text-muted">Week of:</label>
          <input
            type="date"
            className="form-input"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            style={{ width: 160 }}
          />
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowGrid(!showGrid)}>
            {showGrid ? 'Cancel' : '+ New Timesheet'}
          </button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {isAdmin && showGrid && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Weekly Timesheet Entry</h3></div>
          <div className="card-body">
            <div className="form-row" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label>Project</label>
                <select className="form-input" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                  <option value="">Select project</option>
                  {projects.map((p) => <option key={p.name} value={p.name}>{p.project_name || p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Task (optional)</label>
                <select className="form-input" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
                  <option value="">Select task</option>
                  {tasks.map((t) => <option key={t.name} value={t.name}>{t.subject}</option>)}
                </select>
              </div>
            </div>

            <div className="timesheet-grid">
              {DAYS.map((day, i) => (
                <div key={day} className="timesheet-day">
                  <div className="timesheet-day-name">{day}</div>
                  <div className="timesheet-day-date">{weekDates[i]}</div>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    className="form-input hours-input"
                    placeholder="0"
                    value={hours[weekDates[i]] || ''}
                    onChange={(e) => handleHourChange(weekDates[i], e.target.value)}
                  />
                  <span className="hours-label">hrs</span>
                </div>
              ))}
            </div>

            <div className="timesheet-footer">
              <span className="total-hours">Total: <strong>{totalHours.toFixed(1)}h</strong></span>
              <button className="btn btn-primary" onClick={handleSubmitGrid} disabled={saving}>
                {saving ? <span className="spinner-sm" /> : 'Submit Timesheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submitted timesheets list */}
      <div className="card">
        <div className="card-header"><h3>Submitted Timesheets</h3></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Total Hours</th>
                <th>Status</th>
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
              ) : timesheets.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted">No timesheets yet</td></tr>
              ) : timesheets.map((ts) => (
                <tr key={ts.name}>
                  <td className="text-muted" style={{ fontSize: 12 }}>{ts.name}</td>
                  <td>{ts.start_date}</td>
                  <td>{ts.end_date}</td>
                  <td>{ts.total_hours ? `${Number(ts.total_hours).toFixed(1)}h` : '—'}</td>
                  <td><Badge status={ts.status || 'Draft'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
