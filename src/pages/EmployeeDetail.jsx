import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEmployee, getDirectReports, updateEmployee, deleteEmployee } from '../api/employees';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

const SELF_EDITABLE  = ['cell_number', 'personal_email', 'date_of_birth', 'image'];
const ADMIN_EDITABLE = [
  'employee_name', 'department', 'designation', 'employment_type',
  'date_of_joining', 'branch', 'gender', 'reports_to',
  'cell_number', 'personal_email', 'date_of_birth', 'company_email', 'user_id', 'image',
];

function ReadField({ label, value }) {
  if (!value) return null;
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function EditableField({ label, fieldKey, value, type = 'text', options, onChange }) {
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      {options ? (
        <select className="form-input form-input-sm" value={value || ''} onChange={e => onChange(fieldKey, e.target.value)}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="form-input form-input-sm" value={value || ''} onChange={e => onChange(fieldKey, e.target.value)} />
      )}
    </div>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employee: me, isAdmin, refreshEmployee } = useAuth();
  const { addToast } = useToast();

  const [employee, setEmployee]       = useState(null);
  const [manager, setManager]         = useState(null);
  const [directReports, setDirectReports] = useState([]);
  const [draft, setDraft]             = useState({});
  const [editMode, setEditMode]       = useState(false);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const fileInputRef = useRef(null);

  const isSelf      = me?.name === id;
  const canEdit     = isAdmin || isSelf;
  const editableKeys = isAdmin ? ADMIN_EDITABLE : SELF_EDITABLE;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [emp, reports] = await Promise.all([
        getEmployee(id),
        getDirectReports(id),
      ]);
      if (!emp) throw new Error('Employee not found');
      setEmployee(emp);
      setDraft(emp);
      setDirectReports(reports);

      // Load manager details if employee reports to someone
      if (emp?.reports_to) {
        try {
          const mgr = await getEmployee(emp.reports_to);
          setManager(mgr);
        } catch { setManager(null); }
      } else {
        setManager(null);
      }
    } catch (e) {
      setError(e.message || 'Failed to load employee');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleChange = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      editableKeys.forEach(k => { payload[k] = draft[k]; });
      const updated = await updateEmployee(id, payload);
      setEmployee(updated);
      setDraft(updated);
      setEditMode(false);
      if (isSelf) refreshEmployee({ ...me, ...payload });
      addToast('Profile updated successfully', 'success');
    } catch (e) {
      addToast(e.response?.data?.message || 'Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(employee); setEditMode(false); };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteEmployee(id);
      addToast(`${employee.employee_name} has been deleted`, 'success');
      navigate('/employees');
    } catch (e) {
      addToast(e.response?.data?.message || 'Failed to delete employee', 'error');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleChange('image', ev.target.result);
    reader.readAsDataURL(file);
  };

  const field = (label, key, type = 'text', options = null) => {
    if (editMode && editableKeys.includes(key)) {
      return <EditableField key={key} label={label} fieldKey={key} value={draft[key]} type={type} options={options} onChange={handleChange} />;
    }
    return <ReadField key={key} label={label} value={employee?.[key]} />;
  };

  const isManager = directReports.length > 0;
  const roleBadge = !employee ? null
    : !employee.reports_to && isManager ? 'top-level'
    : isManager                         ? 'manager'
    : employee.reports_to               ? 'employee'
    : null;

  const ROLE_LABELS = {
    'top-level': { label: 'Top-Level / CEO', color: '#6a1b9a', bg: '#f3e5f5' },
    'manager':   { label: 'Manager',         color: '#0C447C', bg: '#e8f0fb' },
    'employee':  { label: 'Employee',        color: '#2e7d32', bg: '#e8f5e9' },
  };

  return (
    <div className="page-content">
      <button className="btn-back" onClick={() => navigate(-1)}>← Back</button>
      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <div className="detail-skeleton">
          <Skeleton width={80} height={80} radius={50} />
          <Skeleton width="40%" height={24} style={{ marginTop: 16 }} />
          <Skeleton width="25%" height={16} style={{ marginTop: 8 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={14} width="60%" style={{ marginTop: 12 }} />
          ))}
        </div>
      ) : employee ? (
        <div className="detail-card">

          {/* Hero */}
          <div className="detail-hero">
            <div
              className={`avatar-upload-wrap ${editMode && canEdit ? 'avatar-upload-active' : ''}`}
              onClick={() => editMode && canEdit && fileInputRef.current?.click()}
              title={editMode && canEdit ? 'Click to change photo' : undefined}
            >
              <Avatar name={employee.employee_name} image={editMode ? draft.image : employee.image} size={80} />
              {editMode && canEdit && (
                <div className="avatar-upload-overlay">📷</div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoChange}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2>{employee.employee_name}</h2>
                {roleBadge && (
                  <span style={{
                    background: ROLE_LABELS[roleBadge].bg,
                    color: ROLE_LABELS[roleBadge].color,
                    fontSize: 11, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 20,
                  }}>
                    {ROLE_LABELS[roleBadge].label}
                  </span>
                )}
              </div>
              <p className="text-muted">{employee.designation} &bull; {employee.department}</p>
              <p className="text-muted">{employee.company}</p>
            </div>
            {canEdit && !editMode && (
              <div className="detail-hero-actions">
                <button className="btn btn-secondary" onClick={() => setEditMode(true)}>✏️ Edit Profile</button>
                {isAdmin && (
                  <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>Delete</button>
                )}
              </div>
            )}
            {editMode && (
              <div className="detail-hero-actions">
                <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="spinner-sm" /> : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          {editMode && (
            <div className="edit-notice">
              {isAdmin ? '✏️ Admin mode — all fields are editable' : '✏️ You can edit your personal contact details'}
            </div>
          )}

          <div className="detail-sections">
            {/* Personal Info */}
            <div className="detail-section">
              <h4 className="detail-section-title">Personal Info</h4>
              <ReadField label="Employee ID" value={employee.name} />
              {field('Full Name', 'employee_name')}
              {field('Gender', 'gender', 'text', ['Male', 'Female'])}
              {field('Date of Birth', 'date_of_birth', 'date')}
              {field('Personal Email', 'personal_email', 'email')}
              {field('Phone', 'cell_number', 'tel')}
            </div>

            {/* Work Info */}
            <div className="detail-section">
              <h4 className="detail-section-title">Work Info</h4>
              {field('Department', 'department')}
              {field('Designation', 'designation')}
              {field('Employment Type', 'employment_type', 'text', ['Full-time', 'Part-time', 'Contract', 'Intern'])}
              {field('Date of Joining', 'date_of_joining', 'date')}
              {field('Branch', 'branch')}
              {field('Company Email', 'company_email', 'email')}
              {isAdmin && field('User ID (login)', 'user_id', 'email')}
            </div>
          </div>

          {/* Org section */}
          <div className="detail-org">
            {/* Reports To */}
            <div className="org-block">
              <h4 className="detail-section-title">Reports To</h4>
              {manager ? (
                <div className="org-person-card" onClick={() => navigate(`/employees/${manager.name}`)}>
                  <Avatar name={manager.employee_name} image={manager.image} size={40} />
                  <div>
                    <div className="org-person-name">{manager.employee_name}</div>
                    <div className="org-person-sub">{manager.designation} &bull; {manager.department}</div>
                  </div>
                  <span className="org-chevron">›</span>
                </div>
              ) : (
                <p className="text-muted">No manager — top of hierarchy</p>
              )}
            </div>

            {/* Direct Reports */}
            <div className="org-block">
              <h4 className="detail-section-title">
                Direct Reports
                {directReports.length > 0 && (
                  <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--primary)', fontSize: 12 }}>
                    {directReports.length} member{directReports.length > 1 ? 's' : ''}
                  </span>
                )}
              </h4>
              {directReports.length === 0 ? (
                <p className="text-muted">No one reports to this employee</p>
              ) : (
                <div className="org-reports-list">
                  {directReports.map(r => (
                    <div key={r.name} className="org-person-card" onClick={() => navigate(`/employees/${r.name}`)}>
                      <Avatar name={r.employee_name} image={r.image} size={40} />
                      <div>
                        <div className="org-person-name">{r.employee_name}</div>
                        <div className="org-person-sub">{r.designation} &bull; {r.department}</div>
                      </div>
                      <span className="org-chevron">›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      ) : null}

      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete Employee</span>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
                Are you sure you want to delete <strong>{employee?.employee_name}</strong>? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <span className="spinner-sm" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
