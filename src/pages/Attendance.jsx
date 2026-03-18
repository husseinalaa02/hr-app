import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  checkin, getTodayCheckins, getTodayAttendance,
  getWeeklyAttendance, getMissedCheckout, isOffDay,
} from '../api/attendance';
import { useGeofence } from '../hooks/useGeofence';
import Badge from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

// Company work week: Saturday (6) → Thursday (4). Return the most recent Saturday.
function getWeekStart() {
  const now = new Date();
  // Get Baghdad day-of-week by formatting and parsing
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', weekday: 'short' }).format(now);
  const dayIndex = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dayName);
  // Days since last Saturday: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
  const daysSinceSat = (dayIndex + 1) % 7;
  const d = new Date(now);
  d.setDate(d.getDate() - daysSinceSat);
  return baghdadFmt.format(d);
}

// Format a duration in minutes as "Xh Ym" or "Ym"
function fmtMinutes(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const weekday = time.toLocaleDateString([], { weekday: 'long' });
  const dateStr = time.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="clock-block">
      <div className="clock">{timeStr}</div>
      <div className="clock-date">
        <span className="clock-weekday">{weekday}</span>
        <span className="clock-dot">·</span>
        <span>{dateStr}</span>
      </div>
    </div>
  );
}

function GeoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  );
}

function GeofenceIndicator({ geo }) {
  if (!geo.configured) return null;

  if (geo.loading) {
    return (
      <div className="geo-indicator geo-loading">
        <span className="geo-pulse" />
        <span>Finding your location…</span>
      </div>
    );
  }

  if (geo.error) {
    return (
      <div className="geo-indicator geo-error">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>
        </svg>
        <span>{geo.error}</span>
      </div>
    );
  }

  if (geo.allowed) {
    return (
      <div className="geo-indicator geo-ok">
        <GeoIcon />
        <span>You're at the office</span>
        <span className="geo-distance">{geo.distance}m away</span>
      </div>
    );
  }

  return (
    <div className="geo-indicator geo-blocked">
      <GeoIcon />
      <span>Outside office zone</span>
      <span className="geo-distance">{geo.distance}m · limit {geo.radius}m</span>
    </div>
  );
}

function MissedPunchBanner({ record }) {
  if (!record) return null;
  const date = new Date(record.attendance_date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const inTime = new Date(record.in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="missed-punch-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
      </svg>
      <span>
        You forgot to check out on <strong>{date}</strong> (checked in at {inTime}).
        Please submit a regularization request.
      </span>
    </div>
  );
}

const baghdadFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' });

// Build a week array (Sat → Fri, company work week) merged with attendance records.
// Days after today are excluded. Friday is always "Off".
function buildWeekRows(weekStart, records) {
  const todayStr = baghdadFmt.format(new Date());
  const recMap   = {};
  for (const r of records) recMap[r.attendance_date] = r;

  const rows  = [];
  const start = new Date(`${weekStart}T00:00:00+03:00`);

  for (let i = 0; i < 7; i++) {
    const d   = new Date(start);
    d.setDate(start.getDate() + i);
    const key = baghdadFmt.format(d);  // Baghdad date — matches attendance_date values
    if (key > todayStr) break; // don't show future days

    if (recMap[key]) {
      rows.push(recMap[key]);
    } else {
      const dow = d.getDay(); // 5 = Fri
      const off = dow === 5;
      rows.push({
        name: `SYNTH-${key}`,
        attendance_date: key,
        in_time: null, out_time: null, working_hours: null,
        status: off ? 'Off' : (key < todayStr ? 'Absent' : null),
        late_minutes: 0,
        _synthetic: true,
      });
    }
  }
  return rows;

}

// Week end = Friday (weekStart + 6 days)
function getWeekEnd(weekStart) {
  const d = new Date(`${weekStart}T00:00:00+03:00`);
  d.setDate(d.getDate() + 6);
  return baghdadFmt.format(d);
}

export default function Attendance() {
  const { employee } = useAuth();
  const { addToast } = useToast();
  const geo = useGeofence();

  const [checkins, setCheckins]         = useState([]);
  const [todayAtt, setTodayAtt]         = useState(null);
  const [weekly, setWeekly]             = useState([]);
  const [missedRecord, setMissedRecord] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]               = useState(null);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      const weekStart = getWeekStart();
      const weekEnd   = getWeekEnd(weekStart);
      const [ci, att, w, missed] = await Promise.all([
        getTodayCheckins(employee.name),
        getTodayAttendance(employee.name),
        getWeeklyAttendance(employee.name, weekStart, weekEnd),
        getMissedCheckout(employee.name),
      ]);
      setCheckins(ci);
      setTodayAtt(att);
      setWeekly(buildWeekRows(weekStart, w));
      setMissedRecord(missed);
    } catch (e) {
      setError(e.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [employee?.name]);

  useEffect(() => { load(); }, [load]);

  // ── Button state ────────────────────────────────────────────────────────────
  const lastCheckin = checkins[checkins.length - 1];
  const isCheckedIn = lastCheckin?.log_type === 'IN';
  const nextAction  = isCheckedIn ? 'OUT' : 'IN';
  const offDay      = isOffDay();
  const geoBlocked  = geo.configured && (!geo.allowed || geo.loading || !!geo.error);

  const handleCheckin = async () => {
    if (geoBlocked) {
      addToast('You must be at the office to check in.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const result = await checkin(employee.name, nextAction);

      if (nextAction === 'IN') {
        if (result.late) {
          addToast(`Checked in — ${fmtMinutes(result.minutes)} late`, result.minutes <= 15 ? 'warning' : 'error');
        } else {
          addToast('Checked in', 'success');
        }
      } else {
        if (result.earlyLeaveMinutes > 0) {
          addToast(`Checked out — ${fmtMinutes(result.earlyLeaveMinutes)} before shift end`, 'warning');
        } else if (result.overtimeMinutes > 0) {
          addToast(`Checked out — ${fmtMinutes(result.overtimeMinutes)} overtime`, 'info');
        } else {
          addToast('Checked out successfully', 'success');
        }
      }

      await load();
    } catch (err) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (dt) => dt
    ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // CHECK IN card: first punch-in today
  const firstIn = checkins.find(c => c.log_type === 'IN');
  const inTime  = formatTime(firstIn?.time ?? todayAtt?.in_time);

  // CHECK OUT card: last completed checkout (todayAtt.out_time is null while currently checked in)
  const outTime = isCheckedIn ? null : formatTime(todayAtt?.out_time);

  return (
    <div className="page-content">
      <div className="checkin-card">

        {/* Missed checkout banner */}
        <MissedPunchBanner record={missedRecord} />

        {/* Off-day notice */}
        {offDay && (
          <div className="offday-notice">
            <span>Today is a non-working day — you can still check in if assigned a shift.</span>
          </div>
        )}

        {/* Clock */}
        <Clock />

        {/* Geofence status */}
        <GeofenceIndicator geo={geo} />

        {/* Check-in button */}
        <button
          className={`btn-checkin ${isCheckedIn ? 'btn-out' : 'btn-in'}${actionLoading ? ' loading' : ''}${geoBlocked ? ' geo-disabled' : ''}`}
          onClick={handleCheckin}
          disabled={actionLoading || geoBlocked}
        >
          {actionLoading ? (
            <span className="spinner-sm" />
          ) : geoBlocked && !geo.loading ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              Outside Zone
            </>
          ) : geo.loading && geo.configured ? (
            <><span className="spinner-sm" style={{ borderTopColor: 'var(--primary)', borderColor: 'rgba(12,68,124,0.15)' }} /> Locating…</>
          ) : isCheckedIn ? 'Check Out' : 'Check In'}
        </button>

        {/* Today's log */}
        <div className="today-log">
          <div className="log-item">
            <span className="log-label">Check In</span>
            {inTime
              ? <span className="log-value">{inTime}</span>
              : <span className="log-value log-empty">—</span>
            }
          </div>
          <div className="log-divider" />
          <div className="log-item">
            <span className="log-label">Check Out</span>
            {outTime
              ? <span className="log-value">{outTime}</span>
              : <span className="log-value log-empty">—</span>
            }
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Weekly table */}
      <div className="card">
        <div className="card-header"><h3>This Week</h3></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Hours</th>
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
              ) : weekly.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted">No records this week</td></tr>
              ) : weekly.map((a) => (
                <tr key={a.name} style={a._synthetic ? { opacity: 0.6 } : undefined}>
                  <td>{a.attendance_date}</td>
                  <td>{formatTime(a.in_time) || '—'}</td>
                  <td>{formatTime(a.out_time) || (isCheckedIn && a.attendance_date === baghdadFmt.format(new Date()) ? <em style={{color:'var(--gray-400)'}}>open</em> : '—')}</td>
                  <td>{a.working_hours ? `${Number(a.working_hours).toFixed(1)}h` : '—'}</td>
                  <td>
                    {a.status && <Badge status={a.status} />}
                    {a.status === 'Late' && a.late_minutes > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginLeft: 5 }}>
                        +{fmtMinutes(a.late_minutes)}
                      </span>
                    )}
                    {a.early_leave_minutes > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginLeft: 5 }}>
                        -{fmtMinutes(a.early_leave_minutes)}
                      </span>
                    )}
                    {a.status === 'Overtime' && a.overtime_minutes > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginLeft: 5 }}>
                        +{fmtMinutes(a.overtime_minutes)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
