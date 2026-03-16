import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { checkin, getTodayCheckins, getWeeklyAttendance } from '../api/attendance';
import { useGeofence } from '../hooks/useGeofence';
import Badge from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
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

export default function Attendance() {
  const { employee } = useAuth();
  const { addToast } = useToast();
  const geo = useGeofence();

  const [checkins, setCheckins] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      const weekStart = getWeekStart();
      const [ci, w] = await Promise.all([
        getTodayCheckins(employee.name),
        getWeeklyAttendance(employee.name, weekStart),
      ]);
      setCheckins(ci);
      setWeekly(w);
    } catch (e) {
      setError(e.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [employee?.name]);

  useEffect(() => { load(); }, [load]);

  const lastCheckin = checkins[checkins.length - 1];
  const isCheckedIn = lastCheckin?.log_type === 'IN';
  const nextAction  = isCheckedIn ? 'OUT' : 'IN';
  const geoBlocked  = geo.configured && (!geo.allowed || geo.loading || !!geo.error);

  const handleCheckin = async () => {
    if (geoBlocked) {
      addToast('You must be at the office to check in.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      await checkin(employee.name, nextAction);
      addToast(`${nextAction === 'IN' ? 'Checked in' : 'Checked out'} successfully`, 'success');
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Check-in failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const lastIn  = checkins.find(c => c.log_type === 'IN');
  const lastOut = checkins.find(c => c.log_type === 'OUT');
  const formatTime = (dt) => dt
    ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const inTime  = formatTime(lastIn?.time);
  const outTime = formatTime(lastOut?.time);

  return (
    <div className="page-content">
      <div className="checkin-card">

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
                <tr key={a.name}>
                  <td>{a.attendance_date}</td>
                  <td>{formatTime(a.in_time) || '—'}</td>
                  <td>{formatTime(a.out_time) || '—'}</td>
                  <td>{a.working_hours ? `${Number(a.working_hours).toFixed(1)}h` : '—'}</td>
                  <td><Badge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
