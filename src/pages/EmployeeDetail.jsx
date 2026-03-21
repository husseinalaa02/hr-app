import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getEmployee, getDirectReports, updateEmployee, deleteEmployee } from '../api/employees';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SELF_EDITABLE  = ['cell_number', 'personal_email', 'date_of_birth', 'image'];
const ADMIN_EDITABLE = [
  'employee_name', 'department', 'designation', 'employment_type',
  'date_of_joining', 'branch', 'gender', 'reports_to',
  'cell_number', 'personal_email', 'date_of_birth', 'company_email', 'user_id', 'image',
];

function ChangePasswordModal({ targetId, isSelf, onClose }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();
  const { getAccessToken } = useAuth();

  const handle = async (e) => {
    e.preventDefault();
    if (newPwd !== confirm) { addToast(t('employeeDetail.passwordMismatch'), 'error'); return; }
    if (newPwd.length < 6) { addToast(t('employeeDetail.passwordTooShort'), 'error'); return; }
    setSaving(true);
    try {
      if (isSelf && SUPABASE_MODE) {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        if (email) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
          if (signInErr) throw new Error(t('employeeDetail.wrongCurrentPassword'));
        }
        const { error } = await supabase.auth.updateUser({ password: newPwd });
        if (error) throw error;
      } else if (!isSelf && SUPABASE_MODE) {
        const token = await getAccessToken?.();
        const res = await fetch(`${API_BASE}/api/set-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ employee_id: targetId, new_password: newPwd }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || t('employeeDetail.failedChangePassword'));
      } else {
        await updateEmployee(targetId, { password: newPwd });
      }
      addToast(t('employeeDetail.passwordChanged'), 'success');
      onClose();
    } catch (err) {
      addToast(err.message || t('employeeDetail.failedChangePassword'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('employeeDetail.changePassword')} onClose={onClose}>
      <form onSubmit={handle} className="form-stack">
        {isSelf && (
          <div className="form-group">
            <label>{t('employeeDetail.currentPassword')}</label>
            <input type="password" className="form-input" value={current} onChange={e => setCurrent(e.target.value)} required placeholder={t('employeeDetail.enterCurrentPassword')} />
          </div>
        )}
        <div className="form-group">
          <label>{t('employeeDetail.newPassword')}</label>
          <input type="password" className="form-input" value={newPwd} onChange={e => setNewPwd(e.target.value)} required placeholder={t('employeeDetail.enterNewPassword')} />
        </div>
        <div className="form-group">
          <label>{t('employeeDetail.confirmNewPassword')}</label>
          <input type="password" className="form-input" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder={t('employeeDetail.reenterNewPassword')} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner-sm" /> : t('employeeDetail.changePassword')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
  const { t } = useTranslation();
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      {options ? (
        <select className="form-input form-input-sm" value={value || ''} onChange={e => onChange(fieldKey, e.target.value)}>
          <option value="">{t('employeeDetail.selectPlaceholder')}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="form-input form-input-sm" value={value || ''} onChange={e => onChange(fieldKey, e.target.value)} />
      )}
    </div>
  );
}

export default function EmployeeDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { employee: me, isAdmin, isHR, logout, refreshEmployee } = useAuth();
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
  const [showChangePwd, setShowChangePwd] = useState(false);
  const fileInputRef = useRef(null);

  const isSelf      = me?.name === id;
  const canEdit     = isAdmin || isSelf;
  const canChangePwd = isAdmin || isHR || isSelf;
  const editableKeys = isAdmin ? ADMIN_EDITABLE : SELF_EDITABLE;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [emp, reports] = await Promise.all([
        getEmployee(id),
        getDirectReports(id),
      ]);
      if (!emp) throw new Error(t('employeeDetail.employeeNotFound'));
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
      setError(e.message || t('errors.failedLoad'));
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
      addToast(t('employeeDetail.profileUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.message || t('employeeDetail.failedSave'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(employee); setEditMode(false); };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteEmployee(id);
      addToast(t('employeeDetail.deletedSuccess', { name: employee.employee_name }), 'success');
      navigate('/employees');
    } catch (e) {
      addToast(e.response?.data?.message || t('employeeDetail.failedDelete'), 'error');
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

  const ROLE_BADGE_LABELS = {
    'top-level': { labelKey: 'employeeDetail.roleBadgeTopLevel', color: '#6a1b9a', bg: '#f3e5f5' },
    'manager':   { labelKey: 'employeeDetail.roleBadgeManager',  color: '#0C447C', bg: '#e8f0fb' },
    'employee':  { labelKey: 'employeeDetail.roleBadgeEmployee', color: '#2e7d32', bg: '#e8f5e9' },
  };

  return (
    <div className="page-content">
      <button className="btn-back" onClick={() => navigate(-1)}>{t('employeeDetail.back')}</button>
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
              title={editMode && canEdit ? t('employeeDetail.clickToChangePhoto') : undefined}
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
                    background: ROLE_BADGE_LABELS[roleBadge].bg,
                    color: ROLE_BADGE_LABELS[roleBadge].color,
                    fontSize: 11, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 20,
                  }}>
                    {t(ROLE_BADGE_LABELS[roleBadge].labelKey)}
                  </span>
                )}
              </div>
              <p className="text-muted">{employee.designation} &bull; {employee.department}</p>
              <p className="text-muted">{employee.company}</p>
            </div>
            {!editMode && (canEdit || canChangePwd) && (
              <div className="detail-hero-actions">
                {canEdit && <button className="btn btn-secondary" onClick={() => setEditMode(true)}>✏️ {t('employeeDetail.editProfile')}</button>}
                {canChangePwd && <button className="btn btn-secondary" onClick={() => setShowChangePwd(true)}>🔑 {t('employeeDetail.changePassword')}</button>}
                {isAdmin && (
                  <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>{t('employeeDetail.deleteEmployee')}</button>
                )}
              </div>
            )}
            {editMode && (
              <div className="detail-hero-actions">
                <button className="btn btn-secondary" onClick={handleCancel}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="spinner-sm" /> : t('common.save')}
                </button>
              </div>
            )}
          </div>

          {editMode && (
            <div className="edit-notice">
              {isAdmin ? t('employeeDetail.adminEditNotice') : t('employeeDetail.selfEditNotice')}
            </div>
          )}

          <div className="detail-sections">
            {/* Personal Info */}
            <div className="detail-section">
              <h4 className="detail-section-title">{t('employeeDetail.personalInfo')}</h4>
              <ReadField label={t('employeeDetail.employeeId')} value={employee.name} />
              {field(t('employees.fullName'), 'employee_name')}
              {field(t('employees.gender'), 'gender', 'text', [t('employees.male'), t('employees.female')])}
              {field(t('employeeDetail.dateOfBirth'), 'date_of_birth', 'date')}
              {field(t('employees.personalEmail'), 'personal_email', 'email')}
              {field(t('employees.phone'), 'cell_number', 'tel')}
            </div>

            {/* Work Info */}
            <div className="detail-section">
              <h4 className="detail-section-title">{t('employeeDetail.jobInfo')}</h4>
              {field(t('employees.department'), 'department')}
              {field(t('employees.designation'), 'designation')}
              {field(t('employeeDetail.employmentType'), 'employment_type', 'text', ['Full-time', 'Part-time', 'Contract', 'Intern'])}
              {field(t('employees.dateOfJoining'), 'date_of_joining', 'date')}
              {field(t('employees.branch'), 'branch')}
              {field(t('employees.companyEmail'), 'company_email', 'email')}
              {isAdmin && field(t('employeeDetail.userIdLogin'), 'user_id', 'email')}
            </div>
          </div>

          {/* Org section */}
          <div className="detail-org">
            {/* Reports To */}
            <div className="org-block">
              <h4 className="detail-section-title">{t('employees.reportsTo')}</h4>
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
                <p className="text-muted">{t('employeeDetail.noManager')}</p>
              )}
            </div>

            {/* Direct Reports */}
            <div className="org-block">
              <h4 className="detail-section-title">
                {t('employeeDetail.directReports')}
                {directReports.length > 0 && (
                  <span style={{ marginInlineStart: 8, fontWeight: 400, color: 'var(--primary)', fontSize: 12 }}>
                    {t('employeeDetail.memberCount', { count: directReports.length })}
                  </span>
                )}
              </h4>
              {directReports.length === 0 ? (
                <p className="text-muted">{t('common.noRecords')}</p>
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

      {isSelf && (
        <button
          className="btn btn-danger signout-mobile"
          onClick={logout}
          style={{ width: '100%', marginTop: 16 }}
        >
          {t('nav.signOut')}
        </button>
      )}

      {showChangePwd && (
        <ChangePasswordModal
          targetId={id}
          isSelf={isSelf}
          onClose={() => setShowChangePwd(false)}
        />
      )}

      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('employeeDetail.deleteEmployee')}</span>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
                {t('employeeDetail.confirmDelete')} <strong>{employee?.employee_name}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  {t('common.cancel')}
                </button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <span className="spinner-sm" /> : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
