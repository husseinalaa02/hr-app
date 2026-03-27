import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getReportData } from '../api/reports';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

function StatCard({ label, value, sub, color = '#1565c0' }) {
  return (
    <div className="stat-card" style={{ borderInlineStartColor: color }}>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setData(null);
    try {
      const { employees, leaves, payroll, appraisals, expenses } = await getReportData({ year });

      const deptMap = {};
      employees.forEach(e => { deptMap[e.department] = (deptMap[e.department] || 0) + 1; });

      const leaveByType = {};
      leaves.filter(l => l.status === 'Approved').forEach(l => {
        leaveByType[l.leave_type] = (leaveByType[l.leave_type] || 0) + 1;
      });

      const payrollTotal = payroll.reduce((s, r) => s + (r.calculated_salary || 0), 0);
      const paidPayroll  = payroll.filter(r => r.status === 'Paid');
      const paidTotal    = paidPayroll.reduce((s, r) => s + (r.calculated_salary || 0), 0);

      const appraisalByStatus = {};
      appraisals.forEach(a => { appraisalByStatus[a.status] = (appraisalByStatus[a.status] || 0) + 1; });

      const expenseTotal    = expenses.filter(e => e.status === 'Approved').reduce((s, e) => s + (e.amount || 0), 0);
      const pendingExpenses = expenses.filter(e => e.status === 'Submitted').length;

      setData({
        employees, deptMap, leaves, leaveByType,
        payroll, payrollTotal, paidTotal,
        appraisals, appraisalByStatus,
        expenses, expenseTotal, pendingExpenses,
      });
    } catch (e) {
      setLoadError(e.message || t('reports.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [t, year]);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <div className="page-content"><ErrorState message={loadError} onRetry={load} /></div>;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('reports.title')}</h1>
          <p className="page-subtitle">{t('reports.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <label className="filter-label" htmlFor="report-year">{t('reports.year')}</label>
          <select
            id="report-year"
            className="form-input"
            style={{ width: 'auto' }}
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          {[1,2,3,4].map(i => <div key={i} className="stat-card"><Skeleton height={28} width="60%" /><Skeleton height={12} width="40%" style={{ marginTop: 8 }} /></div>)}
        </div>
      )}

      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>{t('reports.headcount')}</button>
          <button className={`tab-btn${tab === 'leave' ? ' active' : ''}`} onClick={() => setTab('leave')}>{t('reports.leave')}</button>
          <button className={`tab-btn${tab === 'payroll' ? ' active' : ''}`} onClick={() => setTab('payroll')}>{t('reports.payroll')}</button>
          <button className={`tab-btn${tab === 'appraisals' ? ' active' : ''}`} onClick={() => setTab('appraisals')}>{t('reports.appraisals')}</button>
        </div>
      </div>

      {loading && data === null && (
        <div className="stats-row" style={{ marginTop: 16 }}>
          {[1,2,3,4].map(i => <div key={i} className="stat-card"><Skeleton height={28} width="60%" /><Skeleton height={12} width="40%" style={{ marginTop: 8 }} /></div>)}
        </div>
      )}

      {tab === 'overview' && data && (
        <>
          <div className="stats-row">
            <StatCard label={t('reports.headcount')} value={data.employees.length} color="#1565c0" />
            <StatCard label={t('nav.leaveRequests')} value={data.leaves.filter(l => l.status !== 'Approved' && l.status !== 'Rejected').length} color="#ef6c00" />
            <StatCard label={t('reports.payroll')} value={(data.payrollTotal / 1_000_000).toFixed(2) + 'M IQD'} color="#2e7d32" />
            <StatCard label={t('reports.pendingExpenses')} value={data.pendingExpenses} color="#6a1b9a" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>{t('employees.department')}</h3></div>
            <div className="card-body">
              <div className="dept-grid">
                {Object.entries(data.deptMap).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                  <div key={dept} className="dept-cell">
                    <div className="dept-count">{count}</div>
                    <div className="dept-name">{dept}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'leave' && data && (
        <>
          <div className="stats-row">
            <StatCard label={t('reports.totalApplications')} value={data.leaves.length} color="#1565c0" />
            <StatCard label={t('reports.approved')} value={data.leaves.filter(l => l.status === 'Approved').length} color="#2e7d32" />
            <StatCard label={t('reports.pending')} value={data.leaves.filter(l => l.status !== 'Approved' && l.status !== 'Rejected').length} color="#ef6c00" />
            <StatCard label={t('reports.rejected')} value={data.leaves.filter(l => l.status === 'Rejected').length} color="#c62828" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>{t('reports.approvedLeaveByType')}</h3></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>{t('reports.leave')}</th><th>{t('reports.applications')}</th></tr></thead>
                <tbody>
                  {Object.entries(data.leaveByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <tr key={type}><td>{type}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'payroll' && data && (
        <>
          <div className="stats-row">
            <StatCard label={t('reports.totalRecords')} value={data.payroll.length} color="#1565c0" />
            <StatCard label={t('reports.draft')} value={data.payroll.filter(r => r.status === 'Draft').length} color="#9e9e9e" />
            <StatCard label={t('reports.submitted')} value={data.payroll.filter(r => r.status === 'Submitted').length} color="#ef6c00" />
            <StatCard label={t('reports.paid')} value={data.payroll.filter(r => r.status === 'Paid').length} color="#2e7d32" />
            <StatCard label={t('reports.totalPaid')} value={(data.paidTotal / 1_000_000).toFixed(2) + 'M IQD'} color="#2e7d32" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>{t('reports.payroll')}</h3></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>{t('common.name')}</th><th>{t('reports.period')}</th><th>{t('reports.salaryIQD')}</th><th>{t('common.status')}</th></tr></thead>
                <tbody>
                  {data.payroll.map(r => (
                    <tr key={r.id}>
                      <td>{r.employee_name}</td>
                      <td>{r.period_start?.slice(0, 7)}</td>
                      <td>{Number(r.calculated_salary).toLocaleString()}</td>
                      <td>{t(`status.${r.status}`, { defaultValue: r.status })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'appraisals' && data && (
        <>
          <div className="stats-row">
            <StatCard label={t('reports.totalAppraisals')} value={data.appraisals.length} color="#1565c0" />
            <StatCard label={t('reports.completed')} value={data.appraisalByStatus['Completed'] || 0} color="#2e7d32" />
            <StatCard label={t('reports.inProgress')} value={(data.appraisalByStatus['In Progress'] || 0) + (data.appraisalByStatus['Self-Assessment Submitted'] || 0) + (data.appraisalByStatus['Manager Review'] || 0)} color="#ef6c00" />
            <StatCard label={t('reports.notStarted')} value={data.appraisalByStatus['Not Started'] || 0} color="#9e9e9e" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>{t('reports.appraisalBreakdown')}</h3></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>{t('common.name')}</th><th>{t('reports.period')}</th><th>{t('common.status')}</th><th>{t('reports.score')}</th></tr></thead>
                <tbody>
                  {data.appraisals.map(a => (
                    <tr key={a.id}>
                      <td>{a.employee_name}</td>
                      <td>{a.period}</td>
                      <td>{a.status}</td>
                      <td>{a.final_score != null ? `${a.final_score}/5` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
