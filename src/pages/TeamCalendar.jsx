import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getDirectAndIndirectReports, getEmployees } from '../api/employees';
import { getTeamLeaveCalendar, buildCalendarMap } from '../api/teamCalendar';
import { getPublicHolidays } from '../api/publicHolidays';
import { getDepartments } from '../api/employees';
import ErrorState from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

const LEAVE_COLORS = {
  'Annual Leave': '#0C447C',
  'Sick Leave':   '#2e7d32',
  'Casual Leave': '#ef6c00',
  'Hourly Leave': '#6a1b9a',
};
const DEFAULT_LEAVE_COLOR = '#607d8b';

function LeaveChip({ leave }) {
  const initials = (leave.employee_name || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const color = LEAVE_COLORS[leave.leave_type] || DEFAULT_LEAVE_COLOR;
  return (
    <span
      title={`${leave.employee_name} — ${leave.leave_type}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '50%',
        background: color, color: '#fff',
        fontSize: 9, fontWeight: 700,
        cursor: 'default',
      }}
    >
      {initials}
    </span>
  );
}

function DayCell({ date, leaves, holidays, today, isOffDay }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const dateStr  = date.toISOString().split('T')[0];
  const dayLeaves = leaves[dateStr] || [];
  const isHoliday = holidays.includes(dateStr);
  const isToday   = dateStr === today;
  const dayNum    = date.getDate();
  const visible   = dayLeaves.slice(0, 3);
  const overflow  = dayLeaves.length - visible.length;

  return (
    <div
      className={`cal-day${isToday ? ' cal-day-today' : ''}${isOffDay ? ' cal-day-off' : ''}${isHoliday ? ' cal-day-holiday' : ''}`}
      style={{ minHeight: 72, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--gray-200)', background: isOffDay ? 'var(--gray-50)' : '#fff', position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--primary)' : 'var(--gray-700)' }}>
          {dayNum}
        </span>
        {isHoliday && <span style={{ fontSize: 9, color: '#d97706' }}>★</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {visible.map((l, i) => <LeaveChip key={i} leave={l} />)}
        {overflow > 0 && (
          <span
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 9, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, alignSelf: 'center' }}
          >
            +{overflow}
          </span>
        )}
      </div>
      {expanded && dayLeaves.length > 3 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 10,
          background: '#fff', border: '1px solid var(--gray-200)',
          borderRadius: 8, padding: 8, minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {dayLeaves.map((l, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
              <LeaveChip leave={l} />
              <span>{l.employee_name} — {l.leave_type}</span>
            </div>
          ))}
          <button onClick={() => setExpanded(false)} style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TeamCalendar() {
  const { t, i18n }  = useTranslation();
  const { employee, isAdmin, isHR } = useAuth();
  const { addToast } = useToast();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [leaves, setLeaves]     = useState({});
  const [holidays, setHolidays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepartments] = useState([]);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      let teamEmps;
      if (isAdmin || isHR) {
        teamEmps = await getEmployees({ department: deptFilter });
      } else {
        teamEmps = await getDirectAndIndirectReports(employee.name);
      }
      setEmployees(teamEmps);

      const empIds = teamEmps.map(e => e.name);
      const [leaveData, holData, depts] = await Promise.all([
        empIds.length ? getTeamLeaveCalendar(year, month, empIds) : Promise.resolve([]),
        getPublicHolidays(year),
        (isAdmin || isHR) ? getDepartments() : Promise.resolve([]),
      ]);

      setLeaves(buildCalendarMap(leaveData, year, month));
      setHolidays(holData.map(h => h.date));
      if (depts.length) setDepartments(depts);
    } catch (e) {
      setError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [employee?.name, isAdmin, isHR, year, month, deptFilter, t]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));

  const monthLabel = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-IQ' : 'en-US', {
    month: 'long', year: 'numeric',
  }).format(new Date(year, month - 1, 1));

  const DAY_HEADERS = i18n.language === 'ar'
    ? ['أحد','اثن','ثلا','أرب','خمي','جمع','سبت']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('calendar.title')}</h1>
          <p className="page-subtitle">{t('calendar.subtitle', { count: employees.length })}</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* L1: flip arrows for RTL — ‹ visually means "back" so swap handlers in Arabic */}
          <button className="btn btn-secondary" onClick={i18n.dir() === 'rtl' ? nextMonth : prevMonth}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center' }}>{monthLabel}</span>
          <button className="btn btn-secondary" onClick={i18n.dir() === 'rtl' ? prevMonth : nextMonth}>›</button>
        </div>
        <button className="btn btn-secondary" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}>
          {t('calendar.today')}
        </button>
        {(isAdmin || isHR) && departments.length > 0 && (
          <select className="form-input select-input" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">{t('calendar.filterDept')}</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {Object.entries(LEAVE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {type}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ fontSize: 9, color: '#d97706' }}>★</span>
          {t('common.holiday')}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} height={72} />)}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(80px,1fr))', gap: 4, minWidth: 560 }}>
            {DAY_HEADERS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', padding: '4px 0' }}>
                {d}
              </div>
            ))}
            {cells.map((date, i) => date ? (
              <DayCell
                key={i}
                date={date}
                leaves={leaves}
                holidays={holidays}
                today={today}
                // M3: off-days are hardcoded as Fri/Sat (Iraq default) because the calendar
                // aggregates many employees who may have different schedules; per-employee
                // off-day highlighting would require fetching all employee off_days arrays.
                isOffDay={date.getDay() === 5 || date.getDay() === 6}
              />
            ) : <div key={i} />)}
          </div>
        </div>
      )}

      {!loading && employees.length === 0 && (
        <div className="empty-state" style={{ textAlign: 'center', padding: 32 }}>
          <p className="text-muted">{t('calendar.noTeam')}</p>
        </div>
      )}
    </div>
  );
}
