import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmployees, getDepartments, createEmployee } from '../api/employees';
import { useAuth } from '../context/AuthContext';

import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { SkeletonCard } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';

const EMPTY_FORM = {
  employee_name: '', department: '', designation: '', gender: '',
  date_of_joining: '', employment_type: 'Full-time', employee_type: 'Office', branch: '',
  cell_number: '', personal_email: '', company_email: '', user_id: '', password: '', reports_to: '',
};

function CreatedCredentialsModal({ emp, onClose }) {
  const [copied, setCopied] = useState('');
  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };
  return (
    <Modal title="Employee Created" onClose={onClose}>
      <div style={{ padding: '4px 0 8px' }}>
        <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 20 }}>
          Share these login credentials with <strong>{emp.employee_name}</strong>.
        </p>
        {[
          { label: 'Login (User ID)', value: emp.user_id, key: 'uid' },
          { label: 'Password', value: emp.password, key: 'pwd' },
        ].map(({ label, value, key }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', wordBreak: 'break-all' }}>{value || '—'}</span>
              <button onClick={() => copy(value, key)} style={{ background: copied === key ? '#059669' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {copied === key ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginTop: 8 }}>
          Save these credentials — the password is not shown again.
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}

function CreateEmployeeModal({ departments, employees, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [createdEmp, setCreatedEmp] = useState(null);
  const [isCustomDept, setIsCustomDept] = useState(false);
  const { addToast } = useToast();
  const { getAccessToken } = useAuth();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleUserIdChange = (v) => {
    setForm(f => ({ ...f, user_id: v, password: f.password || v }));
  };

  const handle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getAccessToken?.();
      const emp = await createEmployee(form, token);
      onCreated(emp);
      setCreatedEmp({ ...emp, password: form.password });
    } catch (err) {
      addToast(err.message || 'Failed to create employee', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (createdEmp) {
    return <CreatedCredentialsModal emp={createdEmp} onClose={onClose} />;
  }

  return (
    <Modal title="Create New Employee" onClose={onClose} size="lg">
      <form onSubmit={handle} className="form-stack">
        <div className="form-row">
          <div className="form-group">
            <label>Full Name *</label>
            <input className="form-input" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} required placeholder="e.g. Mohammed Al-Harbi" />
          </div>
          <div className="form-group">
            <label>Gender</label>
            <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">Select</option>
              <option>Male</option>
              <option>Female</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Department</label>
            <select className="form-input" value={isCustomDept ? '__new__' : form.department}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setIsCustomDept(true);
                  set('department', '');
                } else {
                  setIsCustomDept(false);
                  set('department', e.target.value);
                }
              }}>
              <option value="">Select department</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__new__">+ Other (type below)</option>
            </select>
            {isCustomDept && (
              <input className="form-input" style={{ marginTop: 6 }} placeholder="Enter department name"
                value={form.department} onChange={e => set('department', e.target.value)} autoFocus />
            )}
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input className="form-input" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Software Engineer" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Employment Type</label>
            <select className="form-input" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
              <option>Intern</option>
            </select>
          </div>
          <div className="form-group">
            <label>Employee Type</label>
            <select className="form-input" value={form.employee_type} onChange={e => set('employee_type', e.target.value)}>
              <option value="Office">Office (21 days annual leave)</option>
              <option value="Field">Field (12 days annual leave)</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Date of Joining</label>
            <input type="date" className="form-input" value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Branch</label>
            <input className="form-input" value={form.branch} onChange={e => set('branch', e.target.value)} placeholder="e.g. Riyadh HQ" />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input type="tel" className="form-input" value={form.cell_number} onChange={e => set('cell_number', e.target.value)} placeholder="+964 7XX XXX XXXX" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Personal Email</label>
            <input type="email" className="form-input" value={form.personal_email} onChange={e => set('personal_email', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Company Email</label>
            <input type="email" className="form-input" value={form.company_email} onChange={e => set('company_email', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Login User ID *</label>
            <input className="form-input" value={form.user_id} onChange={e => handleUserIdChange(e.target.value)} required placeholder="e.g. ahmed.ali" />
          </div>
          <div className="form-group">
            <label>Password *</label>
            <input type="password" className="form-input" value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Set initial password" />
          </div>
        </div>

        <div className="form-group">
          <label>Reports To</label>
          <select className="form-input" value={form.reports_to} onChange={e => set('reports_to', e.target.value)}>
            <option value="">— No Manager —</option>
            {employees.map(e => (
              <option key={e.name} value={e.name}>{e.employee_name} ({e.designation})</option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner-sm" /> : 'Create Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmployeeCard({ emp, onClick }) {
  return (
    <div className="emp-card" onClick={() => onClick(emp.name)}>
      <div className="emp-card-avatar">
        <Avatar name={emp.employee_name} image={emp.image} size={60} />
      </div>
      <div className="emp-card-info">
        <h4>{emp.employee_name}</h4>
        <p className="emp-card-dept">{emp.department}</p>
        <p className="emp-card-desg">{emp.designation}</p>
        {emp.cell_number && <p className="emp-card-phone">{emp.cell_number}</p>}
      </div>
    </div>
  );
}

export default function Employees() {
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const canWrite = hasPermission('employees:write');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [emps, depts] = await Promise.all([
        getEmployees({ search, department }),
        departments.length ? Promise.resolve(departments) : getDepartments(),
      ]);
      setEmployees(emps);
      if (!departments.length) setDepartments(depts);
    } catch (e) {
      setError(e.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [search, department]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const handleCreated = () => {
    load();
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Directory</h1>
          <p className="page-subtitle">View and manage company employees</p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Employee</button>
        )}
      </div>
      <div className="page-toolbar">
        <input
          type="search"
          className="form-input search-input"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input select-input"
          value={department}
          onChange={e => setDepartment(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="emp-grid">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : employees.length === 0 ? (
          <p className="text-muted">No employees found.</p>
        ) : (
          employees.map(emp => (
            <EmployeeCard key={emp.name} emp={emp} onClick={id => navigate(`/employees/${id}`)} />
          ))
        )}
      </div>

      {showCreate && (
        <CreateEmployeeModal
          departments={departments}
          employees={employees}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
