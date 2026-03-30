import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getEmployee, getEmployees, getDirectReports, getDirectAndIndirectReports, getEmployeeScoped, updateEmployee, deleteEmployee, updateEmployeeSchedule } from '../api/employees';
import { getDepartments as getDeptList } from '../api/departments';
import { useConfirm } from '../hooks/useConfirm';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import {
  submitProfileChangeRequest, getMyProfileRequests, getMyPendingFields,
  SELF_SERVICE_FIELDS,
} from '../api/profileChangeRequests';
import { getMyDelegations, createDelegation, revokeDelegation } from '../api/delegations';
import { getEncashmentHistory, processEncashment, calculateEncashment } from '../api/leaveEncashment';
import { getLeaveBalance } from '../api/leave';
import { formatIQD } from '../utils/format';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SELF_EDITABLE  = [
  'cell_number', 'personal_email', 'date_of_birth', 'image',
  // H3: also allow employees to see & request changes to these fields
  'address', 'marital_status', 'nationality',
  'emergency_contact_name', 'emergency_contact_phone',
];
const ADMIN_EDITABLE = [
  'employee_name', 'department', 'designation', 'employment_type',
  'date_of_joining', 'branch', 'gender', 'reports_to',
  'cell_number', 'personal_email', 'date_of_birth', 'company_email', 'user_id', 'image',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
  'address', 'marital_status', 'nationality', 'national_id',
  'notice_period_days', 'probation_end_date', 'access_expires_at',
];

// Fields employees can self-edit (goes through PCR workflow)
const EMPLOYEE_PCR_EDITABLE = SELF_SERVICE_FIELDS;

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const expiry = new Date(dateStr + 'T23:59:59+03:00');
  const diff   = expiry - new Date();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}
function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const expiry = new Date(dateStr + 'T23:59:59+03:00');
  return Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
}
function today() { return new Date().toISOString().split('T')[0]; }

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
    if (newPwd.length < 8) { addToast(t('employeeDetail.passwordTooShort'), 'error'); return; }
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
        // DEMO ONLY: plaintext password stored for demo purposes.
        // In production, password changes go through Supabase Auth.
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
          <input type="password" className="form-input" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={8} placeholder={t('employeeDetail.enterNewPassword')} />
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
          {options.map(o => {
            const val = typeof o === 'string' ? o : o.value;
            const lbl = typeof o === 'string' ? o : o.label;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
      ) : (
        <input type={type} className="form-input form-input-sm" value={value || ''} onChange={e => onChange(fieldKey, e.target.value)} />
      )}
    </div>
  );
}

export default function EmployeeDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { employee: me, isAdmin, isHR, isFinance, logout, refreshEmployee } = useAuth();
  const myRole = me?.role;
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
  const [deptNames, setDeptNames]     = useState([]);
  const [deptLoadError, setDeptLoadError] = useState(false);
  const fileInputRef = useRef(null);
  const { confirm, ConfirmModalComponent } = useConfirm();

  // PCR (profile change requests)
  const [pcrRequests, setPcrRequests]     = useState([]);
  const [pendingFields, setPendingFields] = useState(new Set());
  const [pcrSaving, setPcrSaving]         = useState('');

  // M4: whether the current employee manages anyone (used to show delegation section)
  const [hasAnyReports, setHasAnyReports] = useState(false);

  // Delegations
  const [delegations, setDelegations]   = useState([]);
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegForm, setDelegForm]       = useState({ delegate_id: '', start_date: '', end_date: '', reason: '' });
  const [delegSaving, setDelegSaving]   = useState(false);
  const [allEmployees, setAllEmployees] = useState([]);

  // Leave encashment
  const [encashmentHistory, setEncashmentHistory] = useState([]);
  const [showEncashModal, setShowEncashModal]     = useState(false);
  const [encashForm, setEncashForm] = useState({ leave_type: 'Annual Leave', days: '', reason: 'Resignation' });
  const [encashBalance, setEncashBalance]   = useState(null);
  const [encashSaving, setEncashSaving]     = useState(false);
  const [leaveBalance, setLeaveBalance]     = useState([]);

  const isSelf      = me?.name === id;
  const canEdit     = isHR || isSelf;
  const canChangePwd = isAdmin || isSelf;
  const canViewSalary = isAdmin || isHR || isFinance;
  const editableKeys = isHR ? ADMIN_EDITABLE : SELF_EDITABLE;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [emp, reports] = await Promise.all([
        // C3: use scoped getter so line managers cannot load profiles outside their tree
        getEmployeeScoped(id, me?.name, myRole),
        getDirectReports(id),
      ]);
      if (!emp) throw new Error(t('employeeDetail.employeeNotFound'));
      setEmployee(emp);
      setDraft(emp);
      setDirectReports(reports);

      if (emp?.reports_to) {
        try {
          let mgr = await getEmployee(emp.reports_to);
          if (!mgr) {
            const list = await getEmployees();
            mgr = list.find(e => e.name === emp.reports_to) || null;
          }
          setManager(mgr);
        } catch {
          try {
            const list = await getEmployees();
            setManager(list.find(e => e.name === emp.reports_to) || null);
          } catch { setManager(null); }
        }
      } else {
        setManager(null);
      }

      // Load PCR for self view
      if (isSelf) {
        Promise.all([
          getMyProfileRequests(id),
          getMyPendingFields(id),
        ]).then(([reqs, fields]) => {
          setPcrRequests(reqs);
          setPendingFields(fields);
        }).catch(() => {});
      }

      // M4: load full indirect report tree to determine if this employee is a manager at any level
      if (isSelf) {
        getDirectAndIndirectReports(id).then(allReports => {
          setHasAnyReports(allReports.length > 0);
          if (allReports.length > 0) {
            getMyDelegations(id).then(setDelegations).catch(() => {});
            getEmployees().then(setAllEmployees).catch(() => {});
          }
        }).catch(() => {});
      } else if (reports.length > 0) {
        // Non-self view: use direct reports count already fetched
        setHasAnyReports(true);
      }

      // Load encashment history and leave balance for HR/Admin/Finance
      if (isHR || isAdmin || isFinance) {
        Promise.all([
          getEncashmentHistory(id),
          getLeaveBalance(id),
        ]).then(([hist, bal]) => {
          setEncashmentHistory(hist);
          setLeaveBalance(bal);
        }).catch(() => {});
      }

    } catch (e) {
      if (e.code === 'ACCESS_DENIED') {
        addToast(t('errors.accessDenied', { defaultValue: 'Access denied' }), 'error');
        navigate('/employees');
        return;
      }
      setError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [id, t, isSelf, isHR, isAdmin, isFinance, me?.name, myRole, navigate, addToast]);

  useEffect(() => { load(); }, [load]);

  // L3: load department list for dropdown; surface error if it fails
  useEffect(() => {
    if (!isHR && !isAdmin) return;
    getDeptList()
      .then(list => { setDeptNames(list.map(d => d.name)); setDeptLoadError(false); })
      .catch(() => setDeptLoadError(true));
  }, [isHR, isAdmin]);

  const handleChange = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  const toggleOffDay = (day) => {
    const current = draft.off_days || [5, 6];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setDraft(d => ({ ...d, off_days: updated }));
  };

  const handleSave = async () => {
    if ((isHR || isAdmin) && (draft.off_days || [5, 6]).length === 7) {
      const proceed = await confirm({
        message: t('employees.schedule.allDaysOffWarning'),
        confirmLabel: t('common.saveAnyway'),
        danger: true,
      });
      if (!proceed) return;
    }
    setSaving(true);
    try {
      // For self-editing, certain fields go through the PCR workflow
      if (isSelf && !isHR && !isAdmin) {
        const pcrFields = EMPLOYEE_PCR_EDITABLE.filter(k => SELF_EDITABLE.includes(k));
        const changedPcr = pcrFields.filter(k => draft[k] !== employee[k] && draft[k] !== undefined);
        // image field saves immediately
        const immediatePayload = {};
        if (draft.image !== employee.image) immediatePayload.image = draft.image;
        // Others go through PCR
        for (const fieldName of changedPcr) {
          if (fieldName === 'image') continue;
          try {
            await submitProfileChangeRequest(id, fieldName, employee[fieldName], draft[fieldName]);
          } catch (pcrErr) {
            if (pcrErr.message === 'DUPLICATE_PENDING_REQUEST') {
              addToast(t('profile.duplicatePending', { field: fieldName }), 'warning');
              continue;
            }
            throw pcrErr;
          }
        }
        if (Object.keys(immediatePayload).length > 0) {
          await updateEmployee(id, immediatePayload);
          if (isSelf) refreshEmployee({ ...me, ...immediatePayload });
        }
        if (changedPcr.filter(k => k !== 'image').length > 0) {
          addToast(t('profile.changeSubmitted'), 'info');
          const [reqs, fields] = await Promise.all([getMyProfileRequests(id), getMyPendingFields(id)]);
          setPcrRequests(reqs);
          setPendingFields(fields);
        } else if (Object.keys(immediatePayload).length > 0) {
          addToast(t('employeeDetail.profileUpdated'), 'success');
        }
        setEditMode(false);
        return;
      }

      const payload = {};
      editableKeys.forEach(k => { payload[k] = draft[k]; });
      const updated = await updateEmployee(id, payload);
      if ((isHR || isAdmin) && JSON.stringify(draft.off_days) !== JSON.stringify(employee.off_days)) {
        await updateEmployeeSchedule(id, draft.off_days || [5, 6]);
      }
      setEmployee({ ...updated, off_days: draft.off_days });
      setDraft({ ...updated, off_days: draft.off_days });
      setEditMode(false);
      if (isSelf) refreshEmployee({ ...me, ...payload });
      addToast(t('employeeDetail.profileUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.message || t('employeeDetail.failedSave'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDelegation = async () => {
    if (!delegForm.delegate_id || !delegForm.start_date || !delegForm.end_date) {
      addToast(t('errors.fillRequired'), 'error'); return;
    }
    setDelegSaving(true);
    try {
      await createDelegation({
        delegatorId: id,
        delegateId:  delegForm.delegate_id,
        startDate:   delegForm.start_date,
        endDate:     delegForm.end_date,
        reason:      delegForm.reason,
      });
      addToast(t('delegation.createSuccess'), 'success');
      setShowDelegationModal(false);
      setDelegForm({ delegate_id: '', start_date: '', end_date: '', reason: '' });
      getMyDelegations(id).then(setDelegations).catch(() => {});
    } catch (e) {
      addToast(e.message || t('errors.actionFailed'), 'error');
    } finally { setDelegSaving(false); }
  };

  const handleRevokeDelegation = async (delegId) => {
    const ok = await confirm({ message: t('delegation.revokeConfirm'), danger: true });
    if (!ok) return;
    try {
      await revokeDelegation(delegId);
      addToast(t('delegation.revokeSuccess'), 'success');
      getMyDelegations(id).then(setDelegations).catch(() => {});
    } catch (e) {
      addToast(e.message || t('errors.actionFailed'), 'error');
    }
  };

  const handleProcessEncashment = async () => {
    const days = Number(encashForm.days);
    if (!days || days <= 0) { addToast(t('errors.fillRequired'), 'error'); return; }
    const bal = leaveBalance.find(b => b.leave_type === encashForm.leave_type && !b.is_hourly);
    if (!bal || days > bal.remaining) { addToast(t('leave.encashment.insufficientBalance'), 'error'); return; }
    if (!employee.base_salary) { addToast(t('leave.encashment.noSalaryConfigured'), 'error'); return; }
    const { dailyRate, totalAmount } = calculateEncashment(employee.base_salary, days);
    setEncashSaving(true);
    try {
      await processEncashment({
        employeeId:     id,
        leaveType:      encashForm.leave_type,
        encashmentDate: today(),
        daysEncashed:   days,
        dailyRate,
        totalAmount,
        reason:         encashForm.reason,
        processedBy:    me.name,
      });
      addToast(t('leave.encashment.success'), 'success');
      setShowEncashModal(false);
      setEncashForm({ leave_type: 'Annual Leave', days: '', reason: 'Resignation' });
      const [hist, bal2] = await Promise.all([getEncashmentHistory(id), getLeaveBalance(id)]);
      setEncashmentHistory(hist);
      setLeaveBalance(bal2);
    } catch (e) {
      if (e.message === 'INSUFFICIENT_BALANCE') {
        addToast(t('leave.encashment.insufficientBalance'), 'error');
      } else {
        addToast(e.message || t('errors.actionFailed'), 'error');
      }
    } finally { setEncashSaving(false); }
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
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      addToast(t('employeeDetail.invalidFileType'), 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast(t('employeeDetail.fileTooLarge'), 'error');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => addToast(t('employeeDetail.uploadFailed'), 'error');
    reader.onload = (ev) => handleChange('image', ev.target.result);
    reader.readAsDataURL(file);
  };

  const field = (label, key, type = 'text', options = null) => {
    if (editMode && editableKeys.includes(key)) {
      return <EditableField key={key} label={label} fieldKey={key} value={draft[key]} type={type} options={options} onChange={handleChange} />;
    }
    return <ReadField key={key} label={label} value={employee?.[key]} />;
  };

  // L2: dept dropdown options for edit mode; null falls back to free-text input
  const deptOptions = isHR && deptNames.length > 0
    ? [{ value: '', label: `— ${t('employees.selectDepartment')} —` }, ...deptNames.map(n => ({ value: n, label: n }))]
    : null;

  // L2: replaces IIFE in JSX for schedule default hint
  const scheduleUsesDefault = !employee?.off_days
    || (employee.off_days.length === 2 && employee.off_days.includes(5) && employee.off_days.includes(6));

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
                accept="image/jpeg,image/png,image/webp"
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
              {isSelf && !isHR && !isAdmin && pendingFields.has('personal_email') && (
                <span className="badge badge-warning" style={{ fontSize: 11 }}>{t('profile.changePending')}</span>
              )}
              {field(t('employees.phone'), 'cell_number', 'tel')}
              {isSelf && !isHR && !isAdmin && pendingFields.has('cell_number') && (
                <span className="badge badge-warning" style={{ fontSize: 11 }}>{t('profile.changePending')}</span>
              )}
              {/* Address, marital status, nationality (HR can edit; employee can see own and request change) */}
              {(isHR || isAdmin || isSelf) && field(t('employees.address'), 'address')}
              {(isHR || isAdmin || isSelf) && field(t('employees.maritalStatus'), 'marital_status', 'text', [
                { value: 'Single',   label: t('employees.maritalSingle') },
                { value: 'Married',  label: t('employees.maritalMarried') },
                { value: 'Divorced', label: t('employees.maritalDivorced') },
                { value: 'Widowed',  label: t('employees.maritalWidowed') },
              ])}
              {(isHR || isAdmin || isSelf) && field(t('employees.nationality'), 'nationality')}
              {/* Sensitive — HR/Admin only */}
              {(isHR || isAdmin) && field(t('employees.nationalId'), 'national_id')}
            </div>

            {/* Work Info */}
            <div className="detail-section">
              <h4 className="detail-section-title">{t('employeeDetail.jobInfo')}</h4>
              {field(t('employees.department'), 'department', 'text', deptOptions)}
              {editMode && deptLoadError && (
                <p className="form-hint" style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: -8 }}>
                  {t('employees.deptLoadError', 'Could not load departments — type manually.')}
                </p>
              )}
              {field(t('employees.designation'), 'designation')}
              {field(t('employeeDetail.employmentType'), 'employment_type', 'text', [
                { value: 'Full-time', label: t('employees.employmentTypes.fullTime') },
                { value: 'Part-time', label: t('employees.employmentTypes.partTime') },
                { value: 'Contract',  label: t('employees.employmentTypes.contract') },
                { value: 'Intern',    label: t('employees.employmentTypes.intern') },
              ])}
              {field(t('employees.dateOfJoining'), 'date_of_joining', 'date')}
              {field(t('employees.branch'), 'branch')}
              {field(t('employees.companyEmail'), 'company_email', 'email')}
              {isAdmin && field(t('employeeDetail.userIdLogin'), 'user_id', 'email')}
              {/* Notice period & probation (HR/Admin) */}
              {(isHR || isAdmin) && field(t('employees.noticePeriod'), 'notice_period_days', 'number')}
              {(isHR || isAdmin) && field(t('employees.probationEndDate'), 'probation_end_date', 'date')}
              {(isHR || isAdmin) && employee.probation_end_date && new Date(employee.probation_end_date) > new Date() && (
                <span className="badge badge-warning" style={{ fontSize: 11 }}>
                  {t('employees.inProbation')}
                </span>
              )}
              {/* Access expiry — HR/Admin only */}
              {(isHR || isAdmin) && (
                <div className="detail-field">
                  <span className="detail-label">{t('employees.accessExpiry')}</span>
                  {editMode ? (
                    <input
                      type="date"
                      className="form-input form-input-sm"
                      value={draft.access_expires_at || ''}
                      min={today()}
                      onChange={e => handleChange('access_expires_at', e.target.value || null)}
                    />
                  ) : (
                    <span className="detail-value">
                      {employee.access_expires_at
                        ? <>
                            {employee.access_expires_at}
                            {isExpiringSoon(employee.access_expires_at) && (
                              <span className="badge badge-warning" style={{ marginInlineStart: 8, fontSize: 11 }}>
                                {t('employees.accessExpiringSoon', { days: daysUntilExpiry(employee.access_expires_at) })}
                              </span>
                            )}
                          </>
                        : <span className="text-muted">{t('employees.noExpiry')}</span>
                      }
                    </span>
                  )}
                  {editMode && <p className="form-hint" style={{ fontSize: 11 }}>{t('employees.accessExpiryHint')}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="detail-section" style={{ marginTop: 16 }}>
            <h4 className="detail-section-title">{t('employees.emergencyContact')}</h4>
            {field(t('employees.emergencyContactName'),     'emergency_contact_name')}
            {field(t('employees.emergencyContactPhone'),    'emergency_contact_phone', 'tel')}
            {field(t('employees.emergencyContactRelation'), 'emergency_contact_relation')}
          </div>

          {/* Work Schedule — HR/admin only */}
          {(isHR || isAdmin) && (
            <div className="detail-section schedule-section">
              <h4 className="detail-section-title">{t('employees.schedule.weeklyOffDays')}</h4>
              {!editMode && scheduleUsesDefault && (
                <p className="form-hint schedule-hint" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('employees.schedule.usingDefault')}
                </p>
              )}
              {editMode ? (
                <>
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 10 }}>{t('employees.schedule.hint')}</p>
                  <div className="schedule-days">
                    {[0, 1, 2, 3, 4, 5, 6].map(day => {
                      const offDays = draft.off_days ?? [5, 6];
                      const isOff = offDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`day-toggle${isOff ? '' : ' day-toggle-on'}`}
                          onClick={() => toggleOffDay(day)}
                          title={t(`common.dayLong.${day}`)}
                        >
                          {t(`common.dayShort.${day}`)}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="schedule-days">
                  {[0, 1, 2, 3, 4, 5, 6].map(day => {
                    const offDays = employee.off_days ?? [5, 6];
                    const isOff = offDays.includes(day);
                    return (
                      <span
                        key={day}
                        className={`day-toggle day-toggle-static${isOff ? '' : ' day-toggle-on'}`}
                        title={t(`common.dayLong.${day}`)}
                      >
                        {t(`common.dayShort.${day}`)}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Leave Encashment — HR/Admin/Finance only */}
          {(isHR || isAdmin || isFinance) && (
            <div className="detail-section" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 className="detail-section-title" style={{ margin: 0 }}>{t('leave.encashment.title')}</h4>
                {(isHR || isAdmin || isFinance) && (
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowEncashModal(true)}>
                    {t('leave.encashment.process')}
                  </button>
                )}
              </div>
              {encashmentHistory.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>{t('leave.encashment.noHistory')}</p>
              ) : (
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>{t('common.date')}</th>
                        <th>{t('common.type')}</th>
                        <th>{t('leave.encashment.daysEncashed')}</th>
                        <th>{t('leave.encashment.dailyRate')}</th>
                        <th>{t('leave.encashment.totalAmount')}</th>
                        <th>{t('leave.encashment.reason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {encashmentHistory.map(e => (
                        <tr key={e.id}>
                          <td>{e.encashment_date}</td>
                          <td>{e.leave_type}</td>
                          <td>{e.days_encashed}</td>
                          <td>{formatIQD(e.daily_rate)}</td>
                          <td><strong style={{ color: 'var(--primary)' }}>{formatIQD(e.total_amount)}</strong></td>
                          <td>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Approval Delegation — self view, managers with any reports (direct or indirect) */}
          {isSelf && hasAnyReports && (
            <div className="detail-section" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 className="detail-section-title" style={{ margin: 0 }}>{t('delegation.title')}</h4>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowDelegationModal(true)}>
                  {t('delegation.create')}
                </button>
              </div>
              {delegations.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>{t('delegation.noCurrent')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {delegations.map(d => {
                    const now = new Date().toISOString().split('T')[0];
                    const status = d.is_active ? 'active'
                      : d.start_date > now ? 'upcoming' : 'expired';
                    const statusColor = status === 'active' ? '#059669' : status === 'upcoming' ? '#b45309' : '#9ca3af';
                    const delegateName = allEmployees.find(e => e.name === d.delegate_id)?.employee_name || d.delegate_id;
                    return (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 12px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {t('delegation.delegate')}: {delegateName}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {d.start_date} → {d.end_date}
                            {d.reason && ` · ${d.reason}`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>
                            {t(`delegation.${status}`)}
                          </span>
                          {status === 'active' && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleRevokeDelegation(d.id)}
                            >
                              {t('common.revoke')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* My Change Requests — self view */}
          {isSelf && pcrRequests.length > 0 && (
            <div className="detail-section" style={{ marginTop: 16 }}>
              <h4 className="detail-section-title">{t('profile.myChangeRequests')}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pcrRequests.map(r => (
                  <div key={r.id} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{r.field_name}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: r.status === 'Approved' ? '#059669' : r.status === 'Rejected' ? '#dc2626' : '#b45309',
                      }}>
                        {r.status}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.old_value || '—'} → {r.new_value}
                    </div>
                    {r.review_note && (
                      <div style={{ color: '#dc2626', marginTop: 4, fontSize: 11 }}>
                        {t('profile.reviewNote')}: {r.review_note}
                      </div>
                    )}
                    <div style={{ color: 'var(--gray-400)', marginTop: 2, fontSize: 10 }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

      {/* Delegation Modal */}
      {showDelegationModal && (
        <Modal title={t('delegation.create')} onClose={() => setShowDelegationModal(false)}>
          <div className="form-stack">
            <div className="form-group">
              <label>{t('delegation.delegate')} *</label>
              <select className="form-input" value={delegForm.delegate_id} onChange={e => setDelegForm(f => ({ ...f, delegate_id: e.target.value }))}>
                <option value="">— {t('common.select')} —</option>
                {allEmployees.filter(e => e.name !== id).map(e => (
                  <option key={e.name} value={e.name}>{e.employee_name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('delegation.startDate')} *</label>
                <input type="date" className="form-input" value={delegForm.start_date} min={today()} onChange={e => setDelegForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('delegation.endDate')} *</label>
                <input type="date" className="form-input" value={delegForm.end_date} min={delegForm.start_date || today()} onChange={e => setDelegForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>{t('delegation.reason')}</label>
              <textarea className="form-input" rows={2} value={delegForm.reason} onChange={e => setDelegForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowDelegationModal(false)}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={handleCreateDelegation} disabled={delegSaving}>
                {delegSaving ? <span className="spinner-sm" /> : t('common.save')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Encashment Modal */}
      {showEncashModal && (
        <Modal title={t('leave.encashment.process')} onClose={() => setShowEncashModal(false)}>
          <div className="form-stack">
            <div className="form-group">
              <label>{t('leave.leaveType')}</label>
              <select className="form-input" value={encashForm.leave_type} onChange={e => {
                const lt = e.target.value;
                setEncashForm(f => ({ ...f, leave_type: lt, days: '' }));
                const bal = leaveBalance.find(b => b.leave_type === lt && !b.is_hourly);
                setEncashBalance(bal || null);
              }}>
                {['Annual Leave','Sick Leave','Casual Leave'].map(lt => <option key={lt} value={lt}>{lt}</option>)}
              </select>
              {encashBalance && (
                <p className="form-hint">{t('leave.encashment.availableDays', { count: encashBalance.remaining })}</p>
              )}
            </div>
            <div className="form-group">
              <label>{t('leave.encashment.daysToEncash')} *</label>
              <input
                type="number" className="form-input"
                min="1" max={encashBalance?.remaining || undefined}
                value={encashForm.days}
                onChange={e => setEncashForm(f => ({ ...f, days: e.target.value }))}
              />
            </div>
            {employee.base_salary && encashForm.days > 0 && (
              <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div>{t('leave.encashment.formula')}</div>
                <div style={{ marginTop: 4 }}>
                  {formatIQD(employee.base_salary)} ÷ 30 = <strong>{formatIQD(employee.base_salary / 30)}</strong>/day
                </div>
                <div style={{ marginTop: 4 }}>
                  {t('leave.encashment.totalAmount')}: <strong style={{ color: 'var(--primary)' }}>
                    {formatIQD((employee.base_salary / 30) * Number(encashForm.days))}
                  </strong>
                </div>
              </div>
            )}
            <div className="form-group">
              <label>{t('leave.encashment.reason')}</label>
              <select className="form-input" value={encashForm.reason} onChange={e => setEncashForm(f => ({ ...f, reason: e.target.value }))}>
                <option value="Resignation">{t('leave.encashment.resignation')}</option>
                <option value="Year-End">{t('leave.encashment.yearEnd')}</option>
                <option value="Policy">{t('leave.encashment.policy')}</option>
                <option value="Other">{t('leave.encashment.other')}</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEncashModal(false)}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={handleProcessEncashment} disabled={encashSaving || !encashForm.days}>
                {encashSaving ? <span className="spinner-sm" /> : t('common.confirm')}
              </button>
            </div>
          </div>
        </Modal>
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
      {ConfirmModalComponent}
    </div>
  );
}
