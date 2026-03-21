import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getAllEmployeesWithOverrides, savePermissionOverrides, getCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole } from '../api/admin';
import { updateEmployee } from '../api/employees';
import { ROLE_PERMISSIONS } from '../rbac/permissions';
import { Skeleton } from '../components/Skeleton';

// ── Config ────────────────────────────────────────────────────────────────────
const PERM_GROUPS = [
  { labelKey: 'admin.permGroup.employees',    icon: '👥', perms: ['employees:read', 'employees:write', 'employees:delete'] },
  { labelKey: 'admin.permGroup.payroll',      icon: '💰', perms: ['payroll:read', 'payroll:write', 'payroll:process', 'payroll:export'] },
  { labelKey: 'admin.permGroup.leave',        icon: '📅', perms: ['leave:read', 'leave:write', 'leave:approve'] },
  { labelKey: 'admin.permGroup.attendance',   icon: '🕐', perms: ['attendance:read', 'attendance:write'] },
  { labelKey: 'admin.permGroup.timesheets',   icon: '📋', perms: ['timesheets:read', 'timesheets:write'] },
  { labelKey: 'admin.permGroup.dayRequests',  icon: '📆', perms: ['day_requests:read', 'day_requests:write', 'day_requests:approve'] },
  { labelKey: 'admin.permGroup.expenses',     icon: '🧾', perms: ['expenses:read', 'expenses:write', 'expenses:approve'] },
  { labelKey: 'admin.permGroup.appraisals',   icon: '⭐', perms: ['appraisals:read', 'appraisals:manage'] },
  { labelKey: 'admin.permGroup.recruitment',  icon: '🔍', perms: ['recruitment:read', 'recruitment:manage'] },
  { labelKey: 'admin.permGroup.reports',      icon: '📊', perms: ['reports:hr', 'reports:finance', 'reports:executive'] },
  { labelKey: 'admin.permGroup.announcements',icon: '📢', perms: ['announcements:read', 'announcements:write'] },
  { labelKey: 'admin.permGroup.payslips',     icon: '💳', perms: ['payslips:read'] },
  { labelKey: 'admin.permGroup.audit',        icon: '🔒', perms: ['audit:read'] },
];

const PERM_LABEL_KEYS = {
  'employees:read': 'admin.perm.view', 'employees:write': 'admin.perm.edit', 'employees:delete': 'admin.perm.delete',
  'payroll:read': 'admin.perm.view', 'payroll:write': 'admin.perm.edit', 'payroll:process': 'admin.perm.process', 'payroll:export': 'admin.perm.export',
  'leave:read': 'admin.perm.view', 'leave:write': 'admin.perm.submit', 'leave:approve': 'admin.perm.approve',
  'attendance:read': 'admin.perm.view', 'attendance:write': 'admin.perm.edit',
  'timesheets:read': 'admin.perm.view', 'timesheets:write': 'admin.perm.edit',
  'payslips:read': 'admin.perm.view',
  'day_requests:read': 'admin.perm.view', 'day_requests:write': 'admin.perm.submit', 'day_requests:approve': 'admin.perm.approve',
  'expenses:read': 'admin.perm.view', 'expenses:write': 'admin.perm.submit', 'expenses:approve': 'admin.perm.approve',
  'appraisals:read': 'admin.perm.view', 'appraisals:manage': 'admin.perm.manage',
  'recruitment:read': 'admin.perm.view', 'recruitment:manage': 'admin.perm.manage',
  'reports:hr': 'admin.perm.hr', 'reports:finance': 'admin.perm.finance', 'reports:executive': 'admin.perm.executive',
  'announcements:read': 'admin.perm.view', 'announcements:write': 'admin.perm.post',
  'audit:read': 'admin.perm.view',
};

const ALL_ROLES = ['admin','ceo','hr_manager','finance_manager','it_manager','audit_manager','employee'];
const ROLE_COLORS = {
  admin: '#0C447C', ceo: '#6d28d9', hr_manager: '#059669',
  finance_manager: '#b45309', it_manager: '#0891b2',
  audit_manager: '#7c3aed', employee: '#6b7280',
};

function RolePill({ role, customRoles = [], size = 'sm' }) {
  const { t } = useTranslation();
  const customLabel = customRoles.find(r => r.name === role)?.label;
  return (
    <span style={{
      display: 'inline-block',
      padding: size === 'lg' ? '4px 14px' : '2px 10px',
      borderRadius: 20,
      fontSize: size === 'lg' ? 13 : 11,
      fontWeight: 600,
      color: '#fff',
      background: ROLE_COLORS[role] || '#0891b2',
      whiteSpace: 'nowrap',
    }}>
      {customLabel || t(`roles.${role}`, { defaultValue: role })}
    </span>
  );
}

// 3-state toggle: role-default (green/gray) → force-on (blue) → force-off (red) → back
function PermToggle({ roleHas, override, onChange }) {
  const { t } = useTranslation();
  const effective = override !== undefined ? override : roleHas;

  const handleClick = () => {
    if (override === undefined) onChange(!roleHas);
    else onChange(undefined);
  };

  let cls = 'perm-toggle';
  let title = '';
  if (override === true)       { cls += ' perm-force-on';  title = t('admin.permManuallyGranted'); }
  else if (override === false) { cls += ' perm-force-off'; title = t('admin.permManuallyRevoked'); }
  else if (roleHas)            { cls += ' perm-role-on';   title = t('admin.permGrantedByRole'); }
  else                         { cls += ' perm-role-off';  title = t('admin.permNotInRole'); }

  return (
    <button className={cls} onClick={handleClick} title={title} type="button">
      {effective
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      }
    </button>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 120,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function RoleEditor({ role: roleObj, onSave, onCancel }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(roleObj?.label || '');
  const [name, setName]   = useState(roleObj?.name  || '');
  const [perms, setPerms] = useState(roleObj?.permissions || []);
  const isEdit = !!roleObj?.id;

  const toggle = (p) => setPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="form-label">{t('admin.roleEditorLabelField')}</label>
          <input className="form-control" value={label} onChange={e => setLabel(e.target.value)} placeholder={t('admin.roleEditorLabelPlaceholder')} />
        </div>
        {!isEdit && (
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="form-label">{t('admin.roleEditorIdField')}</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder={t('admin.roleEditorIdPlaceholder')} />
          </div>
        )}
      </div>
      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t('admin.permissionsSelected', { count: perms.length })}
      </div>
      <div className="perm-matrix" style={{ marginBottom: 16 }}>
        {PERM_GROUPS.map(group => (
          <div key={group.labelKey} className="perm-group">
            <div className="perm-group-label"><span style={{ marginInlineEnd: 6 }}>{group.icon}</span>{t(group.labelKey)}</div>
            {group.perms.map(p => (
              <div key={p} className={`perm-row${perms.includes(p) ? ' perm-row-on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => toggle(p)}>
                <button
                  type="button"
                  className={`perm-toggle ${perms.includes(p) ? 'perm-force-on' : 'perm-role-off'}`}
                  onClick={e => { e.stopPropagation(); toggle(p); }}
                >
                  {perms.includes(p)
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  }
                </button>
                <span className="perm-label">{t(PERM_LABEL_KEYS[p] || 'admin.perm.view')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onSave({ name: name.trim(), label: label.trim(), permissions: perms })} disabled={!label.trim() || (!isEdit && !name.trim())}>
          {isEdit ? t('common.save') : t('admin.createRole')}
        </button>
        <button className="btn btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { t } = useTranslation();
  const { employee: me, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('roles');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Users & Roles tab
  const [roleEdits, setRoleEdits] = useState({});
  const [savingRole, setSavingRole] = useState({});
  const [search, setSearch] = useState('');

  // Permissions tab
  const [selectedEmp, setSelectedEmp] = useState('');
  const [pendingOverrides, setPendingOverrides] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);

  // Custom Roles tab
  const [customRoles, setCustomRoles]       = useState([]);
  const [customRolesLoading, setCustomRolesLoading] = useState(false);
  const [editingRole, setEditingRole]       = useState(null); // null | {} (new) | role obj (edit)

  const load = useCallback(async () => {
    setLoading(true);
    try { setEmployees(await getAllEmployeesWithOverrides()); }
    catch { addToast(t('admin.failedLoad'), 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadCustomRoles = useCallback(async () => {
    setCustomRolesLoading(true);
    try { setCustomRoles(await getCustomRoles()); }
    catch { addToast(t('admin.failedLoadRoles'), 'error'); }
    finally { setCustomRolesLoading(false); }
  }, []);

  useEffect(() => { load(); loadCustomRoles(); }, [load, loadCustomRoles]);

  // Save / delete custom role handlers
  const handleSaveCustomRole = async ({ name, label, permissions }) => {
    try {
      if (editingRole?.id) {
        await updateCustomRole(editingRole.id, { label, permissions });
        addToast(t('admin.roleUpdated'), 'success');
      } else {
        await createCustomRole({ name, label, permissions });
        addToast(t('admin.roleCreated'), 'success');
      }
      setEditingRole(null);
      await loadCustomRoles();
    } catch (err) {
      addToast(err.message || t('admin.failedSaveRole'), 'error');
    }
  };

  const handleDeleteCustomRole = async (role) => {
    if (!window.confirm(t('admin.confirmDeleteRole', { label: role.label }))) return;
    try {
      await deleteCustomRole(role.id);
      addToast(t('admin.roleDeleted'), 'success');
      await loadCustomRoles();
    } catch (err) {
      addToast(err.message || t('admin.failedDeleteRole'), 'error');
    }
  };

  // Stats
  const allRoleOptions = [...ALL_ROLES, ...customRoles.map(r => r.name)];
  const roleCounts = allRoleOptions.reduce((acc, r) => {
    acc[r] = employees.filter(e => e.role === r).length;
    return acc;
  }, {});
  const withOverrides = employees.filter(e => Object.keys(e.overrides).length > 0).length;

  // ── Roles tab ──────────────────────────────────────────────────────────────
  const filtered = employees.filter(e =>
    !search || e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  const saveRole = async (emp) => {
    const newRole = roleEdits[emp.name];
    if (!newRole || newRole === emp.role) return;
    setSavingRole(p => ({ ...p, [emp.name]: true }));
    try {
      // 1. Update the employees table (enforced by RLS)
      await updateEmployee(emp.name, { role: newRole });

      // 2. Sync the new role into Supabase Auth app_metadata so JWT-based
      //    RLS policies enforce it immediately on the next token refresh.
      const token = await getAccessToken();
      if (token) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
        await fetch(`${API_BASE}/api/set-role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ employee_id: emp.name, new_role: newRole }),
        }).catch(err => console.warn('[Admin] set-role JWT sync failed (non-fatal):', err));
      }

      setEmployees(p => p.map(e => e.name === emp.name ? { ...e, role: newRole } : e));
      setRoleEdits(p => { const n = { ...p }; delete n[emp.name]; return n; });
      const newRoleLabel = t(`roles.${newRole}`, { defaultValue: customRoles.find(r => r.name === newRole)?.label || newRole });
      addToast(`${emp.employee_name} → ${newRoleLabel}`, 'success');
    } catch { addToast(t('admin.failedUpdateRole'), 'error'); }
    finally { setSavingRole(p => ({ ...p, [emp.name]: false })); }
  };

  // ── Permissions tab ────────────────────────────────────────────────────────
  const selectedEmpObj = employees.find(e => e.name === selectedEmp);

  useEffect(() => {
    if (!selectedEmpObj) { setPendingOverrides({}); return; }
    const pending = {};
    for (const [perm, val] of Object.entries(selectedEmpObj.overrides)) pending[perm] = val;
    setPendingOverrides(pending);
  }, [selectedEmp, selectedEmpObj]);

  const handlePermToggle = (perm, value) => {
    setPendingOverrides(prev => {
      const next = { ...prev };
      if (value === undefined) delete next[perm];
      else next[perm] = value;
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedEmpObj) return;
    setSavingPerms(true);
    try {
      const toSave = { ...pendingOverrides };
      for (const perm of Object.keys(selectedEmpObj.overrides)) {
        if (!(perm in pendingOverrides)) toSave[perm] = null;
      }
      await savePermissionOverrides(selectedEmpObj.name, toSave);
      setEmployees(p => p.map(e =>
        e.name === selectedEmpObj.name ? { ...e, overrides: { ...pendingOverrides } } : e
      ));
      addToast(t('admin.permissionsSaved'), 'success');
    } catch { addToast(t('admin.failedSavePerms'), 'error'); }
    finally { setSavingPerms(false); }
  };

  const hasChanges = selectedEmpObj && (
    JSON.stringify(pendingOverrides) !== JSON.stringify(
      Object.fromEntries(Object.entries(selectedEmpObj.overrides).filter(([, v]) => v !== undefined))
    )
  );

  const rolePerms = selectedEmpObj
    ? (ROLE_PERMISSIONS[selectedEmpObj.role] || customRoles.find(r => r.name === selectedEmpObj.role)?.permissions || [])
    : [];
  const effectiveGranted = Object.values(PERM_GROUPS).flatMap(g => g.perms).filter(p => {
    const ov = pendingOverrides[p];
    return ov !== undefined ? ov : rolePerms.includes(p);
  }).length;
  const totalPerms = Object.values(PERM_GROUPS).flatMap(g => g.perms).length;
  const overrideCount = Object.keys(pendingOverrides).length;

  return (
    <div className="page-content">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('admin.title')}</h1>
          <p className="page-subtitle">{t('admin.subtitle')}</p>
        </div>
      </div>

      {/* Stats row */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label={t('reports.headcount')} value={employees.length} color="var(--primary)" />
          <StatCard label={t('admin.admins')} value={roleCounts.admin || 0} color={ROLE_COLORS.admin} />
          <StatCard label={t('admin.hrManagers')} value={roleCounts.hr_manager || 0} color={ROLE_COLORS.hr_manager} />
          <StatCard label={t('admin.finance')} value={roleCounts.finance_manager || 0} color={ROLE_COLORS.finance_manager} />
          <StatCard label={t('admin.withOverrides')} value={withOverrides} color="#7c3aed" />
        </div>
      )}

      <div className="card" style={{ marginBottom: 0 }}>
        {/* Tabs */}
        <div className="admin-tabs">
          <button className={`admin-tab${tab === 'roles' ? ' active' : ''}`} onClick={() => setTab('roles')}>
            {t('admin.tabRoles')}
          </button>
          <button className={`admin-tab${tab === 'permissions' ? ' active' : ''}`} onClick={() => setTab('permissions')}>
            {t('admin.tabPermissions')}
          </button>
          <button className={`admin-tab${tab === 'custom-roles' ? ' active' : ''}`} onClick={() => setTab('custom-roles')}>
            {t('admin.tabCustomRoles')}
          </button>
        </div>

        {/* ── Users & Roles ──────────────────────────────────────────────────── */}
        {tab === 'roles' && (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <input
                className="form-control"
                placeholder={t('admin.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ maxWidth: 320, fontSize: 13 }}
              />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('nav.employees')}</th>
                    <th>{t('employees.department')}</th>
                    <th>{t('admin.currentRole')}</th>
                    <th>{t('admin.assignRole')}</th>
                    <th>{t('admin.overrides')}</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><Skeleton height={14} /></td>)}</tr>
                      ))
                    : filtered.map(emp => {
                        const pendingRole = roleEdits[emp.name];
                        const isDirty = pendingRole && pendingRole !== emp.role;
                        const isSelf = emp.name === me?.name;
                        const oc = Object.keys(emp.overrides).length;
                        return (
                          <tr key={emp.name} style={isDirty ? { background: 'var(--warning-light)' } : undefined}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.employee_name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{emp.name}</div>
                            </td>
                            <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{emp.department || '—'}</td>
                            <td><RolePill role={emp.role} /></td>
                            <td>
                              <select
                                className="form-control"
                                style={{ fontSize: 13, padding: '5px 8px', minWidth: 150 }}
                                value={pendingRole ?? emp.role}
                                onChange={e => setRoleEdits(p => ({ ...p, [emp.name]: e.target.value }))}
                                disabled={isSelf}
                              >
                                {ALL_ROLES.map(r => <option key={r} value={r}>{t(`roles.${r}`, { defaultValue: r })}</option>)}
                                {customRoles.length > 0 && (
                                  <optgroup label={t('admin.tabCustomRoles')}>
                                    {customRoles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
                                  </optgroup>
                                )}
                              </select>
                            </td>
                            <td>
                              {oc > 0 ? (
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, background: '#f3e8ff', color: '#7c3aed', border: '1px solid #e9d5ff' }}
                                  onClick={() => { setSelectedEmp(emp.name); setTab('permissions'); }}
                                >
                                  {t('admin.overrideCount', { count: oc })}
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11 }}
                                  onClick={() => { setSelectedEmp(emp.name); setTab('permissions'); }}
                                >
                                  {t('common.edit')}
                                </button>
                              )}
                            </td>
                            <td>
                              {isSelf ? (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('admin.youLabel')}</span>
                              ) : (
                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={!isDirty || savingRole[emp.name]}
                                  onClick={() => saveRole(emp)}
                                >
                                  {savingRole[emp.name] ? '…' : t('common.save')}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Custom Roles ───────────────────────────────────────────────────── */}
        {tab === 'custom-roles' && (
          <div>
            {editingRole !== null ? (
              <RoleEditor
                role={editingRole}
                onSave={handleSaveCustomRole}
                onCancel={() => setEditingRole(null)}
              />
            ) : (
              <>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {t('admin.customRolesCount', { count: customRoles.length })}
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={() => setEditingRole({})}>
                    {t('admin.newRole')}
                  </button>
                </div>
                {customRolesLoading ? (
                  <div style={{ padding: 20 }}><Skeleton height={60} /></div>
                ) : customRoles.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎭</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('admin.noCustomRoles')}</div>
                    <div style={{ fontSize: 13 }}>{t('admin.noCustomRolesDesc')}</div>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t('admin.roleLabel')}</th>
                          <th>{t('admin.roleId')}</th>
                          <th>{t('admin.permissionsCol')}</th>
                          <th>{t('nav.employees')}</th>
                          <th style={{ width: 120 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {customRoles.map(r => {
                          const empCount = employees.filter(e => e.role === r.name).length;
                          return (
                            <tr key={r.id}>
                              <td>
                                <span style={{ fontWeight: 600, background: '#0891b2', color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>
                                  {r.label}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{r.name}</td>
                              <td style={{ fontSize: 13 }}>{t('admin.permissionCount', { count: (r.permissions || []).length })}</td>
                              <td style={{ fontSize: 13 }}>{empCount}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-sm" onClick={() => setEditingRole(r)}>{t('common.edit')}</button>
                                  <button
                                    className="btn btn-sm"
                                    style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                    onClick={() => handleDeleteCustomRole(r)}
                                  >
                                    {t('common.delete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Permissions ────────────────────────────────────────────────────── */}
        {tab === 'permissions' && (
          <div style={{ display: 'flex', minHeight: 500 }}>

            {/* Employee list sidebar */}
            <div style={{
              width: 240, flexShrink: 0, borderInlineEnd: '1px solid var(--border)',
              overflowY: 'auto', background: 'var(--surface-alt, #f9fafb)',
            }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                {t('admin.selectEmployee')}
              </div>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ padding: '10px 14px' }}><Skeleton height={32} /></div>)
                : employees.map(emp => {
                    const oc = Object.keys(emp.overrides).length;
                    const isSelected = selectedEmp === emp.name;
                    return (
                      <button
                        key={emp.name}
                        onClick={() => setSelectedEmp(emp.name)}
                        style={{
                          width: '100%', textAlign: 'start', background: isSelected ? 'var(--primary-light)' : 'none',
                          border: 'none', borderBottom: '1px solid var(--border)', padding: '10px 14px',
                          cursor: 'pointer', borderInlineStart: isSelected ? `3px solid var(--primary)` : '3px solid transparent',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? 'var(--primary)' : 'var(--text)' }}>{emp.employee_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <RolePill role={emp.role} />
                          {oc > 0 && (
                            <span style={{ fontSize: 10, background: '#f3e8ff', color: '#7c3aed', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                              {oc}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
              }
            </div>

            {/* Right: permission matrix */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!selectedEmpObj ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span style={{ fontSize: 14 }}>{t('admin.selectEmployeeHint')}</span>
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap',
                    position: 'sticky', top: 0, zIndex: 2,
                  }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedEmpObj.employee_name}</span>
                      <span style={{ marginInlineStart: 10 }}><RolePill role={selectedEmpObj.role} size="lg" /></span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {effectiveGranted}/{totalPerms} {t('admin.tabPermissions').toLowerCase()}
                      {overrideCount > 0 && <span style={{ marginInlineStart: 8, color: '#7c3aed', fontWeight: 600 }}>{t('admin.overrideCount', { count: overrideCount })}</span>}
                    </div>
                    <button className="btn btn-sm" onClick={() => setPendingOverrides({})}>{t('admin.resetToRole')}</button>
                    <button className="btn btn-primary btn-sm" onClick={savePermissions} disabled={savingPerms || !hasChanges}>
                      {savingPerms ? t('admin.savingLabel') : t('common.save')}
                    </button>
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--surface-alt, #f9fafb)' }}>
                    {[
                      { cls: 'perm-role-on',   labelKey: 'admin.legendFromRole' },
                      { cls: 'perm-role-off',  labelKey: 'admin.legendNotInRole' },
                      { cls: 'perm-force-on',  labelKey: 'admin.legendManuallyGranted' },
                      { cls: 'perm-force-off', labelKey: 'admin.legendManuallyRevoked' },
                    ].map(({ cls, labelKey }) => (
                      <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span className={`perm-toggle ${cls}`} style={{ pointerEvents: 'none', width: 20, height: 20 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            {cls.includes('off') ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <polyline points="20 6 9 17 4 12"/>}
                          </svg>
                        </span>
                        {t(labelKey)}
                      </div>
                    ))}
                  </div>

                  {/* Matrix */}
                  <div style={{ padding: '16px 20px' }}>
                    <div className="perm-matrix">
                      {PERM_GROUPS.map(group => (
                        <div key={group.labelKey} className="perm-group">
                          <div className="perm-group-label">
                            <span style={{ marginInlineEnd: 6 }}>{group.icon}</span>{t(group.labelKey)}
                          </div>
                          {group.perms.map(perm => {
                            const roleHas = rolePerms.includes(perm);
                            const override = pendingOverrides[perm];
                            const effective = override !== undefined ? override : roleHas;
                            return (
                              <div key={perm} className={`perm-row${effective ? ' perm-row-on' : ''}`}>
                                <PermToggle roleHas={roleHas} override={override} onChange={val => handlePermToggle(perm, val)} />
                                <span className="perm-label">{t(PERM_LABEL_KEYS[perm] || 'admin.perm.view')}</span>
                                {override !== undefined && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                                    background: override ? '#dbeafe' : 'var(--danger-light)',
                                    color: override ? '#1d4ed8' : 'var(--danger)',
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                  }}>
                                    {override ? t('admin.granted') : t('admin.revoked')}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
