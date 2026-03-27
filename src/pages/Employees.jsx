import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmployees, getDepartments, createEmployee, addDepartment, deleteDepartment } from '../api/employees';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { SkeletonCard } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';
import { useTranslation } from 'react-i18next';

const EMPTY_FORM = {
  employee_name: '', department: '', designation: '', gender: '',
  date_of_joining: '', employment_type: 'Full-time', employee_type: 'Office', branch: '',
  cell_number: '', personal_email: '', company_email: '', user_id: '', password: '', reports_to: '',
};

function CreatedCredentialsModal({ emp, onClose }) {
  const [copied, setCopied] = useState('');
  const { t } = useTranslation();
  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };
  return (
    <Modal title={t('employees.employeeCreated')} onClose={onClose}>
      <div style={{ padding: '4px 0 8px' }}>
        <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 20 }}>
          {t('employees.shareCredentials')} <strong>{emp.employee_name}</strong>.
        </p>
        {[
          { label: t('employees.loginUserId2'), value: emp.user_id, key: 'uid' },
          { label: t('employees.password'), value: emp.password, key: 'pwd' },
        ].map(({ label, value, key }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', wordBreak: 'break-all' }}>{value || '—'}</span>
              <button onClick={() => copy(value, key)} style={{ background: copied === key ? '#059669' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {copied === key ? t('common.copied') : t('common.copy')}
              </button>
            </div>
          </div>
        ))}
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginTop: 8 }}>
          {t('employees.saveCredentials')}
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>
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
  const { t } = useTranslation();

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
      addToast(err.message || t('employees.failedCreate'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (createdEmp) {
    return <CreatedCredentialsModal emp={createdEmp} onClose={onClose} />;
  }

  return (
    <Modal title={t('employees.createEmployee')} onClose={onClose} size="lg">
      <form onSubmit={handle} className="form-stack">
        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.fullName')} *</label>
            <input className="form-input" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} required placeholder={t('employees.fullNamePlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('employees.gender')}</label>
            <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">{t('employees.selectGender')}</option>
              <option value="Male">{t('employees.male')}</option>
              <option value="Female">{t('employees.female')}</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.department')}</label>
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
              <option value="">{t('employees.selectDepartment')}</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__new__">{t('employees.otherDept')}</option>
            </select>
            {isCustomDept && (
              <input className="form-input" style={{ marginTop: 6 }} placeholder={t('employees.enterDept')}
                value={form.department} onChange={e => set('department', e.target.value)} autoFocus />
            )}
          </div>
          <div className="form-group">
            <label>{t('employees.designation')}</label>
            <input className="form-input" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder={t('employees.designationPlaceholder')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.employmentType')}</label>
            <select className="form-input" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
              <option value="Full-time">{t('employees.fullTime')}</option>
              <option value="Part-time">{t('employees.partTime')}</option>
              <option value="Contract">{t('employees.contract')}</option>
              <option value="Intern">{t('employees.intern')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('employees.employeeType')}</label>
            <select className="form-input" value={form.employee_type} onChange={e => set('employee_type', e.target.value)}>
              <option value="Office">{t('employees.officeType')}</option>
              <option value="Field">{t('employees.fieldType')}</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.dateOfJoining')}</label>
            <input type="date" className="form-input" value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.branch')}</label>
            <input className="form-input" value={form.branch} onChange={e => set('branch', e.target.value)} placeholder={t('employees.branchPlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('employees.phone')}</label>
            <input type="tel" className="form-input" value={form.cell_number} onChange={e => set('cell_number', e.target.value)} placeholder={t('employees.phonePlaceholder')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.personalEmail')}</label>
            <input type="email" className="form-input" value={form.personal_email} onChange={e => set('personal_email', e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t('employees.companyEmail')}</label>
            <input type="email" className="form-input" value={form.company_email} onChange={e => set('company_email', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('employees.loginUserId')} *</label>
            <input className="form-input" value={form.user_id} onChange={e => handleUserIdChange(e.target.value)} required placeholder={t('employees.loginUserIdPlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('employees.password')} *</label>
            <input type="password" className="form-input" value={form.password} onChange={e => set('password', e.target.value)} required placeholder={t('employees.passwordPlaceholder')} />
          </div>
        </div>

        <div className="form-group">
          <label>{t('employees.reportsTo')}</label>
          <select className="form-input" value={form.reports_to} onChange={e => set('reports_to', e.target.value)}>
            <option value="">{t('employees.noManager')}</option>
            {employees.map(e => (
              <option key={e.name} value={e.name}>{e.employee_name} ({e.designation})</option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner-sm" /> : t('employees.createBtn')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManageDepartmentsModal({ departments, onClose, onChanged }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState('');
  const { addToast } = useToast();
  const { t } = useTranslation();

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await addDepartment(newName.trim());
      setNewName('');
      onChanged();
      addToast(t('employees.deptAdded', { name: newName.trim() }), 'success');
    } catch (e) {
      addToast(e.message || t('employees.failedAddDept'), 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (name) => {
    setDeleting(name);
    try {
      await deleteDepartment(name);
      onChanged();
      addToast(t('employees.deptRemoved', { name }), 'success');
    } catch (e) {
      addToast(e.message || t('employees.failedDeleteDept'), 'error');
    } finally { setDeleting(''); }
  };

  return (
    <Modal title={t('employees.manageDeptTitle')} onClose={onClose}>
      <div style={{ minWidth: 320 }}>
        {/* Add new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder={t('employees.newDeptPlaceholder')}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newName.trim()}>
            {saving ? <span className="spinner-sm" /> : t('employees.addDept')}
          </button>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {departments.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>{t('employees.noDepartments')}</p>}
          {departments.map(d => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{d}</span>
              <button
                onClick={() => handleDelete(d)}
                disabled={deleting === d}
                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
              >
                {deleting === d ? <span className="spinner-sm" /> : '×'}
              </button>
            </div>
          ))}
        </div>
      </div>
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
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDepts, setShowDepts]   = useState(false);
  const [showLargeDatasetWarning, setShowLargeDatasetWarning] = useState(false);

  const departmentsRef = useRef(departments);
  useEffect(() => { departmentsRef.current = departments; }, [departments]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deps = departmentsRef.current;
      const [emps, depts] = await Promise.all([
        getEmployees({ search, department }),
        deps.length ? Promise.resolve(deps) : getDepartments(),
      ]);
      setEmployees(emps);
      if (!deps.length) setDepartments(depts);
      if (emps.length >= 1000) setShowLargeDatasetWarning(true);
    } catch (e) {
      setError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [search, department, t]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const handleCreated = () => { load(); };

  const handleDeptsChanged = async () => {
    const depts = await getDepartments();
    setDepartments(depts);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('employees.title')}</h1>
          <p className="page-subtitle">{t('employees.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="btn btn-secondary" onClick={() => setShowDepts(true)}>{t('employees.manageDepartments')}</button>
          )}
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('employees.newEmployee')}</button>
          )}
        </div>
      </div>
      <div className="page-toolbar">
        <input
          type="search"
          className="form-input search-input"
          placeholder={t('employees.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input select-input"
          value={department}
          onChange={e => setDepartment(e.target.value)}
        >
          <option value="">{t('employees.allDepartments')}</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {showLargeDatasetWarning && (
        <div role="alert" style={{ marginBottom: 12, padding: '8px 14px', background: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 13 }}>
          {t('employees.largeDatasetWarning')}
        </div>
      )}

      <div className="emp-grid">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', gridColumn: '1/-1' }}>
            <p className="text-muted" style={{ marginBottom: 12 }}>{t('employees.noEmployees')}</p>
            {canWrite && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('employees.newEmployee')}</button>}
          </div>
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

      {showDepts && (
        <ManageDepartmentsModal
          departments={departments}
          onClose={() => setShowDepts(false)}
          onChanged={handleDeptsChanged}
        />
      )}
    </div>
  );
}
