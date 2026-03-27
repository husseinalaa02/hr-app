import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  checkin, getTodayCheckins, getTodayAttendance,
  getWeeklyAttendance, getMissedCheckout,
} from '../api/attendance';
import { getPublicHolidays } from '../api/publicHolidays';
import { getAttendanceForExport, buildAttendanceCSV, downloadAttendanceCSV } from '../api/attendanceExport';
import { logAction } from '../api/auditLog';
import { isOffDay as checkIsOffDay } from '../utils/workSchedule';
import { useGeofence } from '../hooks/useGeofence';
import Badge from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { useTranslation } from 'react-i18next';

const baghdadFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' });

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

  const timeStr = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' });
  const weekday = time.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Baghdad' });
  const dateStr = time.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Baghdad' });

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

function GeofenceIndicator({ geo, t }) {
  if (!geo.configured) return null;

  if (geo.loading) {
    return (
      <div className="geo-indicator geo-loading">
        <span className="geo-pulse" />
        <span>{t('attendance.findingLocation')}</span>
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
        <span>{t('attendance.youAreAtOffice')}</span>
        <span className="geo-distance">{geo.distance}m {t('attendance.away')}</span>
      </div>
    );
  }

  return (
    <div className="geo-indicator geo-blocked">
      <GeoIcon />
      <span>{t('attendance.outsideOfficeZone')}</span>
      <span className="geo-distance">{geo.distance}m · {t('attendance.limit')} {geo.radius}m</span>
    </div>
  );
}

function MissedPunchBanner({ record, t }) {
  if (!record) return null;
  // attendance_date is a plain YYYY-MM-DD string — parse at noon to avoid UTC midnight boundary crossing
  const date = new Date(record.attendance_date + 'T12:00:00+03:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  // in_time is a UTC timestamptz — display in Baghdad timezone
  const inTime = new Date(record.in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' });
  return (
    <div className="missed-punch-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
      </svg>
      <span>{t('attendance.missedCheckout', { date, time: inTime })}</span>
    </div>
  );
}

// Build a week array (Sat → Fri, company work week) merged with attendance records.
// Days after today are excluded. Uses per-employee off_days + public holidays for off-day detection.
function buildWeekRows(weekStart, records, offDays, holidays) {
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
      const off = checkIsOffDay(new Date(key + 'T12:00:00+03:00'), offDays, holidays);
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
  const { employee, isHR, isAdmin } = useAuth();
  const { addToast } = useToast();
  const geo = useGeofence();
  const { t } = useTranslation();

  const [checkins, setCheckins]         = useState([]);
  const [todayAtt, setTodayAtt]         = useState(null);
  const [weekly, setWeekly]             = useState([]);
  const [missedRecord, setMissedRecord] = useState(null);
  const [holidays, setHolidays]         = useState([]);
  const [todayHolidayName, setTodayHolidayName] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]               = useState(null);

  // Export state (HR/Admin only)
  const today = baghdadFmt.format(new Date());
  const [exportFrom, setExportFrom] = useState(today);
  const [exportTo, setExportTo]     = useState(today);
  const [exporting, setExporting]   = useState(false);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      const year = parseInt(today.slice(0, 4), 10);
      const weekStart = getWeekStart();
      const weekEnd   = getWeekEnd(weekStart);
      const [ci, att, w, missed, publicHols] = await Promise.all([
        getTodayCheckins(employee.name),
        getTodayAttendance(employee.name),
        getWeeklyAttendance(employee.name, weekStart, weekEnd),
        getMissedCheckout(employee.name),
        getPublicHolidays(year).catch(() => []),
      ]);
      setCheckins(ci);
      setTodayAtt(att);
      setMissedRecord(missed);
      const holDates = publicHols.map(h => h.date);
      setHolidays(holDates);
      const todayHol = publicHols.find(h => h.date === today);
      setTodayHolidayName(todayHol?.name || null);
      setWeekly(buildWeekRows(weekStart, w, employee?.off_days ?? [5, 6], holDates));
    } catch (e) {
      setError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [employee?.name]);

  useEffect(() => { load(); }, [load]);

  // ── Off-day detection (per-employee schedule + public holidays) ──────────────
  const empOffDays = employee?.off_days || [5, 6];
  const offDay     = checkIsOffDay(new Date(), empOffDays, holidays);

  // ── Export handler ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!exportFrom || !exportTo) return;
    if (exportFrom > exportTo) {
      addToast(t('attendance.export.invalidRange'), 'error');
      return;
    }
    const daysDiff = Math.round(
      (new Date(exportTo + 'T12:00:00+03:00') - new Date(exportFrom + 'T12:00:00+03:00'))
      / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 90) {
      addToast(t('attendance.export.largeRangeWarning'), 'warning');
    }
    setExporting(true);
    try {
      const data = await getAttendanceForExport({ dateFrom: exportFrom, dateTo: exportTo });
      const csv  = buildAttendanceCSV({ ...data, dateFrom: exportFrom, dateTo: exportTo, t });
      downloadAttendanceCSV(csv, exportFrom, exportTo);
      addToast(t('attendance.export.success'), 'success');
      await logAction({
        action: 'EXPORT',
        resource: 'Attendance',
        resourceLabel: `Attendance ${exportFrom} to ${exportTo}`,
        details: JSON.stringify({ dateFrom: exportFrom, dateTo: exportTo }),
      });
    } catch (e) {
      addToast(e.message || t('attendance.export.error'), 'error');
    } finally {
      setExporting(false);
    }
  };

  // ── Button state ────────────────────────────────────────────────────────────
  const lastCheckin = checkins[checkins.length - 1];
  const isCheckedIn = lastCheckin?.log_type === 'IN';
  const nextAction  = isCheckedIn ? 'OUT' : 'IN';
  // Only block on a confirmed "outside zone" result — GPS errors (permission denied,
  // hardware timeout, etc.) must not permanently lock the employee out. Loading state
  // still blocks to avoid a race before the first position fix arrives.
  const geoBlocked = geo.configured && (geo.loading || (geo.allowed === false && !geo.error));

  const handleCheckin = async () => {
    if (geoBlocked) {
      addToast(t('attendance.mustBeAtOffice'), 'error');
      return;
    }
    // GPS error: location could not be verified — warn but allow the check-in
    if (geo.configured && geo.error) {
      addToast(t('attendance.locationUnavailable'), 'warning');
    }
    setActionLoading(true);
    try {
      const result = await checkin(employee.name, nextAction);

      if (nextAction === 'IN') {
        if (result.late) {
          addToast(t('attendance.lateToast', { duration: fmtMinutes(result.minutes) }), result.minutes <= 15 ? 'warning' : 'error');
        } else {
          addToast(t('attendance.checkedInToast'), 'success');
        }
      } else {
        if (result.earlyLeaveMinutes > 0) {
          addToast(t('attendance.earlyLeaveToast', { duration: fmtMinutes(result.earlyLeaveMinutes) }), 'warning');
        } else if (result.overtimeMinutes > 0) {
          addToast(t('attendance.overtimeToast', { duration: fmtMinutes(result.overtimeMinutes) }), 'info');
        } else {
          addToast(t('attendance.checkedOutToast'), 'success');
        }
      }

      await load();
    } catch (err) {
      addToast(err.message || t('errors.actionFailed'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Always format in Baghdad timezone — timestamps are stored as UTC but must
  // display in Asia/Baghdad (UTC+3) regardless of the device's local timezone.
  const formatTime = (dt) => dt
    ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })
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
        <MissedPunchBanner record={missedRecord} t={t} />

        {/* Off-day notice */}
        {offDay && (
          <div className="offday-notice">
            <span>
              {todayHolidayName
                ? t('attendance.publicHoliday', { name: todayHolidayName })
                : t('attendance.weeklyOffDay')}
            </span>
          </div>
        )}

        {/* Clock */}
        <Clock />

        {/* Geofence status */}
        <GeofenceIndicator geo={geo} t={t} />

        {/* Check-in button */}
        <button
          className={`btn-checkin ${isCheckedIn ? 'btn-out' : 'btn-in'}${actionLoading ? ' loading' : ''}${geoBlocked ? ' geo-disabled' : ''}`}
          onClick={handleCheckin}
          disabled={actionLoading || geoBlocked || offDay}
        >
          {actionLoading ? (
            <span className="spinner-sm" />
          ) : geoBlocked && !geo.loading ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              {t('attendance.outsideZone')}
            </>
          ) : geo.loading && geo.configured ? (
            <><span className="spinner-sm" style={{ borderTopColor: 'var(--primary)', borderColor: 'rgba(12,68,124,0.15)' }} /> {t('attendance.locating')}</>
          ) : isCheckedIn ? t('attendance.checkOut') : t('attendance.checkIn')}
        </button>

        {/* Today's log */}
        <div className="today-log">
          <div className="log-item">
            <span className="log-label">{t('attendance.checkIn')}</span>
            {inTime
              ? <span className="log-value">{inTime}</span>
              : <span className="log-value log-empty">—</span>
            }
          </div>
          <div className="log-divider" />
          <div className="log-item">
            <span className="log-label">{t('attendance.checkOut')}</span>
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
        <div className="card-header"><h3>{t('attendance.thisWeek')}</h3></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('attendance.date')}</th>
                <th>{t('attendance.checkIn')}</th>
                <th>{t('attendance.checkOut')}</th>
                <th>{t('attendance.hours')}</th>
                <th>{t('attendance.status')}</th>
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
                <tr><td colSpan={5} className="text-center text-muted">{t('attendance.noRecordsThisWeek')}</td></tr>
              ) : weekly.map((a) => (
                <tr key={a.name} style={a._synthetic ? { opacity: 0.6 } : undefined}>
                  <td>{a.attendance_date}</td>
                  <td>{formatTime(a.in_time) || '—'}</td>
                  <td>{formatTime(a.out_time) || (isCheckedIn && a.attendance_date === baghdadFmt.format(new Date()) ? <em style={{color:'var(--gray-400)'}}>{t('attendance.open')}</em> : '—')}</td>
                  <td>{a.working_hours ? `${Number(a.working_hours).toFixed(1)}h` : '—'}</td>
                  <td>
                    {a.status && <Badge status={a.status} />}
                    {a.status === 'Late' && a.late_minutes > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginInlineStart: 5 }}>
                        +{fmtMinutes(a.late_minutes)}
                      </span>
                    )}
                    {a.early_leave_minutes > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginInlineStart: 5 }}>
                        -{fmtMinutes(a.early_leave_minutes)}
                      </span>
                    )}
                    {a.status === 'Overtime' && a.overtime_minutes > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-500)', marginInlineStart: 5 }}>
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

      {/* ── Attendance Export (HR / Admin only) ────────────────────────────── */}
      {(isHR || isAdmin) && (
        <div className="card">
          <div className="card-header"><h3>{t('attendance.export.title')}</h3></div>
          <div className="card-body">
            <div className="export-controls">
              <div className="form-group">
                <label className="form-label">{t('attendance.export.from')}</label>
                <input
                  type="date"
                  className="form-input"
                  value={exportFrom}
                  max={today}
                  onChange={e => {
                    const newFrom = e.target.value;
                    setExportFrom(newFrom);
                    if (exportTo && exportTo < newFrom) setExportTo(newFrom);
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('attendance.export.to')}</label>
                <input
                  type="date"
                  className="form-input"
                  value={exportTo}
                  max={today}
                  min={exportFrom}
                  onChange={e => setExportTo(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={!exportFrom || !exportTo || exporting}
                style={{ alignSelf: 'flex-end' }}
              >
                {exporting
                  ? <><span className="spinner-sm" /> {t('common.loading')}</>
                  : t('attendance.export.exportBtn')}
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: 8 }}>{t('attendance.export.hint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
