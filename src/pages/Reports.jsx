import { useEffect, useState } from 'react';
import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { Skeleton } from '../components/Skeleton';

function StatCard({ label, value, sub, color = '#1565c0' }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let employees, leaves, payroll, appraisals, expenses;

      if (SUPABASE_MODE) {
        [employees, leaves, payroll, appraisals, expenses] = await Promise.all([
          supabase.from('employees_public').select('name,department').then(r => r.data || []),
          supabase.from('leave_apps').select('*').then(r => r.data || []),
          supabase.from('payroll').select('*').then(r => r.data || []),
          supabase.from('appraisals').select('*').then(r => r.data || []),
          supabase.from('expenses').select('*').then(r => r.data || []),
        ]);
      } else {
        [employees, leaves, payroll, appraisals, expenses] = await Promise.all([
          db.employees.toArray(),
          db.leave_apps.toArray(),
          db.payroll.toArray(),
          db.appraisals.toArray(),
          db.expenses.toArray(),
        ]);
      }

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
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="page-content"><div className="loading-center"><span className="spinner" /></div></div>;
  if (!data) return null;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Company analytics, trends, and workforce insights</p>
        </div>
      </div>
      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`tab-btn${tab === 'leave' ? ' active' : ''}`} onClick={() => setTab('leave')}>Leave</button>
          <button className={`tab-btn${tab === 'payroll' ? ' active' : ''}`} onClick={() => setTab('payroll')}>Payroll</button>
          <button className={`tab-btn${tab === 'appraisals' ? ' active' : ''}`} onClick={() => setTab('appraisals')}>Appraisals</button>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="stats-row">
            <StatCard label="Total Employees" value={data.employees.length} color="#1565c0" />
            <StatCard label="Pending Leaves" value={data.leaves.filter(l => l.status === 'Open').length} color="#ef6c00" />
            <StatCard label="Payroll This Month" value={(data.payrollTotal / 1_000_000).toFixed(2) + 'M IQD'} color="#2e7d32" />
            <StatCard label="Pending Expenses" value={data.pendingExpenses} color="#6a1b9a" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>Employees by Department</h3></div>
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

      {tab === 'leave' && (
        <>
          <div className="stats-row">
            <StatCard label="Total Applications" value={data.leaves.length} color="#1565c0" />
            <StatCard label="Approved" value={data.leaves.filter(l => l.status === 'Approved').length} color="#2e7d32" />
            <StatCard label="Pending" value={data.leaves.filter(l => l.status === 'Open').length} color="#ef6c00" />
            <StatCard label="Rejected" value={data.leaves.filter(l => l.status === 'Rejected').length} color="#c62828" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>Leave by Type (Approved)</h3></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>Leave Type</th><th>Applications</th></tr></thead>
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

      {tab === 'payroll' && (
        <>
          <div className="stats-row">
            <StatCard label="Total Records" value={data.payroll.length} color="#1565c0" />
            <StatCard label="Draft" value={data.payroll.filter(r => r.status === 'Draft').length} color="#9e9e9e" />
            <StatCard label="Submitted" value={data.payroll.filter(r => r.status === 'Submitted').length} color="#ef6c00" />
            <StatCard label="Paid" value={data.payroll.filter(r => r.status === 'Paid').length} color="#2e7d32" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>Payroll Summary</h3></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Period</th><th>Salary (IQD)</th><th>Status</th></tr></thead>
                <tbody>
                  {data.payroll.map(r => (
                    <tr key={r.id}>
                      <td>{r.employee_name}</td>
                      <td>{r.period_start?.slice(0, 7)}</td>
                      <td>{Number(r.calculated_salary).toLocaleString()}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'appraisals' && (
        <>
          <div className="stats-row">
            <StatCard label="Total Appraisals" value={data.appraisals.length} color="#1565c0" />
            <StatCard label="Completed" value={data.appraisalByStatus['Completed'] || 0} color="#2e7d32" />
            <StatCard label="In Progress" value={(data.appraisalByStatus['In Progress'] || 0) + (data.appraisalByStatus['Self-Assessment Submitted'] || 0) + (data.appraisalByStatus['Manager Review'] || 0)} color="#ef6c00" />
            <StatCard label="Not Started" value={data.appraisalByStatus['Not Started'] || 0} color="#9e9e9e" />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>Appraisal Status Breakdown</h3></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Period</th><th>Status</th><th>Score</th></tr></thead>
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
