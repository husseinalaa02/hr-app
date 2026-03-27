import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuditLogs } from '../api/auditLog';
import { usePermission } from '../rbac/usePermission';
import { useToast } from '../context/ToastContext';
import ErrorState from '../components/ErrorState';

// ─── Constants ────────────────────────────────────────────────────────────────
const ACTION_STYLE = {
  CREATE:  { color: '#065f46', bg: '#d1fae5' },
  UPDATE:  { color: '#1e40af', bg: '#dbeafe' },
  APPROVE: { color: '#065f46', bg: '#d1fae5' },
  REJECT:  { color: '#991b1b', bg: '#fee2e2' },
  DELETE:  { color: '#991b1b', bg: '#fee2e2' },
  LOGIN:   { color: '#374151', bg: '#f3f4f6' },
  EXPORT:  { color: '#5b21b6', bg: '#ede9fe' },
  VIEW:    { color: '#374151', bg: '#f3f4f6' },
};

const ROLE_STYLE = {
  admin:           { color: '#3730a3', bg: '#e0e7ff' },
  ceo:             { color: '#1e40af', bg: '#dbeafe' },
  hr_manager:      { color: '#065f46', bg: '#d1fae5' },
  finance_manager: { color: '#92400e', bg: '#fef3c7' },
  it_manager:      { color: '#1e3a5f', bg: '#e0f2fe' },
  audit_manager:   { color: '#374151', bg: '#f3f4f6' },
  employee:        { color: '#374151', bg: '#f3f4f6' },
};

function ActionBadge({ action }) {
  const { t } = useTranslation();
  const s = ACTION_STYLE[action] || { color: '#374151', bg: '#f3f4f6' };
  const label = t(`audit.action${action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()}`, { defaultValue: action });
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700,
      padding: '3px 9px', borderRadius: 20,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function RoleBadge({ role }) {
  const { t } = useTranslation();
  const s = ROLE_STYLE[role] || { color: '#374151', bg: '#f3f4f6' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700,
      padding: '3px 9px', borderRadius: 20,
      whiteSpace: 'nowrap',
    }}>
      {t(`roles.${role}`, { defaultValue: role })}
    </span>
  );
}

function formatTimestamp(ts, locale) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    const dateLocale = locale === 'ar' ? 'ar-IQ' : 'en-GB';
    return d.toLocaleString(dateLocale, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Baghdad',
    });
  } catch {
    return ts;
  }
}

function csvEscape(v) {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

function exportToCSV(logs, headers) {
  const rows = logs.map(l => [
    l.timestamp,
    l.user_name,
    l.role,
    l.action,
    l.resource,
    l.resource_label || '',
    l.details || '',
    l.ip_address || '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => csvEscape(v)).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditView() {
  const { t, i18n } = useTranslation();

  const RESOURCE_OPTIONS_T = [
    { value: '', label: t('audit.allResources') },
    { value: 'system',            label: t('audit.resourceSystem') },
    { value: 'employee',          label: t('audit.resourceEmployee') },
    { value: 'leave_application', label: t('audit.resourceLeave') },
    { value: 'payroll',           label: t('audit.resourcePayroll') },
    { value: 'expense',           label: t('audit.resourceExpense') },
    { value: 'recruitment',       label: t('audit.resourceRecruitment') },
    { value: 'appraisal',         label: t('audit.resourceAppraisal') },
  ];

  const ACTION_OPTIONS_T = [
    { value: '',        label: t('audit.allActions') },
    { value: 'LOGIN',   label: t('audit.actionLogin') },
    { value: 'VIEW',    label: t('audit.actionView') },
    { value: 'CREATE',  label: t('audit.actionCreate') },
    { value: 'UPDATE',  label: t('audit.actionUpdate') },
    { value: 'APPROVE', label: t('audit.actionApprove') },
    { value: 'REJECT',  label: t('audit.actionReject') },
    { value: 'EXPORT',  label: t('audit.actionExport') },
    { value: 'DELETE',  label: t('audit.actionDelete') },
  ];
  const { can, role } = usePermission();
  const canExport = can('payroll:export') || role === 'admin' || role === 'ceo';
  const { addToast } = useToast();

  const csvHeaders = [
    t('audit.csv.timestamp'),
    t('audit.csv.user'),
    t('audit.csv.role'),
    t('audit.csv.action'),
    t('audit.csv.resource'),
    t('audit.csv.resourceLabel'),
    t('audit.csv.details'),
    t('audit.csv.ipAddress'),
  ];

  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [filterResource, setFilterResource] = useState('');
  const [filterAction,   setFilterAction]   = useState('');
  const [filterUser,     setFilterUser]     = useState('');
  const [filterFrom,     setFilterFrom]     = useState('');
  const [filterTo,       setFilterTo]       = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await getAuditLogs({
        resource:  filterResource  || undefined,
        action:    filterAction    || undefined,
        userName:  filterUser      || undefined,
        fromDate:  filterFrom ? filterFrom + 'T00:00:00+03:00' : undefined,
        toDate:    filterTo   ? filterTo   + 'T23:59:59+03:00' : undefined,
        limit:     1000,
      });
      setLogs(result);
    } catch (e) {
      setFetchError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [filterResource, filterAction, filterUser, filterFrom, filterTo, t]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);


  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('audit.title')}</h1>
          <p className="page-subtitle">{t('audit.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            fontSize: 12, fontWeight: 700, padding: '6px 14px',
            borderRadius: 20, border: '1px solid rgba(255,255,255,0.35)',
          }}>
            {t('audit.readOnly')}
          </span>
          {canExport && (
            <button
              onClick={() => {
                if (logs.length === 0) { addToast(t('audit.noLogsToExport'), 'error'); return; }
                exportToCSV(logs, csvHeaders);
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {t('reports.export')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select
          className="filter-select"
          value={filterResource}
          onChange={e => setFilterResource(e.target.value)}
          style={{ minWidth: 160 }}
        >
          {RESOURCE_OPTIONS_T.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{ minWidth: 140 }}
        >
          {ACTION_OPTIONS_T.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="text"
          className="filter-select"
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          placeholder={t('audit.filterByName')}
          style={{ minWidth: 160 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('common.from')}</label>
          <input
            type="date"
            className="filter-select"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('common.to')}</label>
          <input
            type="date"
            className="filter-select"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
          />
        </div>

        {(filterResource || filterAction || filterUser || filterFrom || filterTo) && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: '5px 14px' }}
            onClick={() => {
              setFilterResource('');
              setFilterAction('');
              setFilterUser('');
              setFilterFrom('');
              setFilterTo('');
            }}
          >
            {t('audit.clearFilters')}
          </button>
        )}
      </div>

      {fetchError && <ErrorState message={fetchError} onRetry={fetchLogs} />}

      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : fetchError ? null : (
        <>
          <div className="audit-count-bar" style={{ marginBottom: 8 }}>
            {t('audit.logsFound', { count: logs.length })}
          </div>
          {logs.length === 1000 && (
            <div role="alert" aria-live="polite" style={{ marginBottom: 12, padding: '8px 14px', background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 13 }}>
              {t('audit.truncationWarning')}
            </div>
          )}

          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              {t('audit.noEntries')}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('audit.timestamp')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('audit.role')}</th>
                    <th>{t('audit.action')}</th>
                    <th>{t('audit.resource')}</th>
                    <th>{t('audit.details')}</th>
                    <th>{t('audit.ipAddress')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {formatTimestamp(log.timestamp, i18n.language)}
                      </td>
                      <td>
                        <div className="table-emp-name" style={{ fontSize: 13 }}>{log.user_name}</div>
                        <div className="table-emp-id">{log.user_id}</div>
                      </td>
                      <td><RoleBadge role={log.role} /></td>
                      <td><ActionBadge action={log.action} /></td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                          {(log.resource || '').replace(/_/g, ' ')}
                        </div>
                        {log.resource_label && (
                          <div className="table-emp-id">{log.resource_label}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 260 }}>
                        {log.details || '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.ip_address || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
