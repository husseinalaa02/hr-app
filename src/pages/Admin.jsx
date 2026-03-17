import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getAllEmployeesWithOverrides, savePermissionOverrides } from '../api/admin';
import { updateEmployee } from '../api/employees';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../rbac/permissions';
import { Skeleton } from '../components/Skeleton';

// ── Permission groups for the matrix UI ──────────────────────────────────────
const PERM_GROUPS = [
  { label: 'Employees',     perms: ['employees:read', 'employees:write', 'employees:delete'] },
  { label: 'Payroll',       perms: ['payroll:read', 'payroll:write', 'payroll:process', 'payroll:export'] },
  { label: 'Leave',         perms: ['leave:read', 'leave:write', 'leave:approve'] },
  { label: 'Attendance',    perms: ['attendance:read', 'attendance:write'] },
  { label: 'Timesheets',    perms: ['timesheets:read', 'timesheets:write'] },
  { label: 'Payslips',      perms: ['payslips:read'] },
  { label: 'Day Requests',  perms: ['day_requests:read', 'day_requests:write', 'day_requests:approve'] },
  { label: 'Expenses',      perms: ['expenses:read', 'expenses:write', 'expenses:approve'] },
  { label: 'Appraisals',   perms: ['appraisals:read', 'appraisals:manage'] },
  { label: 'Recruitment',   perms: ['recruitment:read', 'recruitment:manage'] },
  { label: 'Reports',       perms: ['reports:hr', 'reports:finance', 'reports:executive'] },
  { label: 'Announcements', perms: ['announcements:read', 'announcements:write'] },
  { label: 'Audit',         perms: ['audit:read'] },
];

const PERM_LABELS = {
  'employees:read':       'View Employees',
  'employees:write':      'Edit Employees',
  'employees:delete':     'Delete Employees',
  'payroll:read':         'View Payroll',
  'payroll:write':        'Edit Payroll',
  'payroll:process':      'Process Payroll',
  'payroll:export':       'Export Payroll',
  'leave:read':           'View Leave',
  'leave:write':          'Submit Leave',
  'leave:approve':        'Approve Leave',
  'attendance:read':      'View Attendance',
  'attendance:write':     'Edit Attendance',
  'timesheets:read':      'View Timesheets',
  'timesheets:write':     'Edit Timesheets',
  'payslips:read':        'View Payslips',
  'day_requests:read':    'View Day Requests',
  'day_requests:write':   'Submit Day Requests',
  'day_requests:approve': 'Approve Day Requests',
  'expenses:read':        'View Expenses',
  'expenses:write':       'Submit Expenses',
  'expenses:approve':     'Approve Expenses',
  'appraisals:read':      'View Appraisals',
  'appraisals:manage':    'Manage Appraisals',
  'recruitment:read':     'View Recruitment',
  'recruitment:manage':   'Manage Recruitment',
  'reports:hr':           'HR Reports',
  'reports:finance':      'Finance Reports',
  'reports:executive':    'Executive Reports',
  'announcements:read':   'View Announcements',
  'announcements:write':  'Post Announcements',
  'audit:read':           'View Audit Log',
};

const ALL_ROLES = ['admin', 'ceo', 'hr_manager', 'finance_manager', 'it_manager', 'audit_manager', 'employee'];
const ROLE_LABELS = {
  admin:           'Admin',
  ceo:             'CEO',
  hr_manager:      'HR Manager',
  finance_manager: 'Finance Manager',
  it_manager:      'IT Manager',
  audit_manager:   'Audit Manager',
  employee:        'Employee',
};

// ── Toggle button: 3 states — null (role default), true (force on), false (force off)
function PermToggle({ roleHas, override, onChange }) {
  // Effective value
  const effective = override !== undefined ? override : roleHas;

  // Cycle: null → invert → null
  const handleClick = () => {
    if (override === undefined) {
      // Currently using role default — override to opposite
      onChange(!roleHas);
    } else if (override === !roleHas) {
      // Override that differs from role — clear it (back to role default)
      onChange(undefined);
    } else {
      // Override same as role (redundant) — clear it
      onChange(undefined);
    }
  };

  let cls = 'perm-toggle';
  let title = '';
  if (override === true) { cls += ' perm-force-on'; title = 'Manually granted — click to reset'; }
  else if (override === false) { cls += ' perm-force-off'; title = 'Manually revoked — click to reset'; }
  else if (roleHas) { cls += ' perm-role-on'; title = 'Granted by role — click to revoke'; }
  else { cls += ' perm-role-off'; title = 'Not in role — click to grant'; }

  return (
    <button className={cls} onClick={handleClick} title={title} type="button">
      {effective ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      )}
    </button>
  );
}

// ── Role badge pill ───────────────────────────────────────────────────────────
function RolePill({ role }) {
  const colors = {
    admin: '#0C447C', ceo: '#6d28d9', hr_manager: '#059669',
    finance_manager: '#b45309', it_manager: '#0891b2',
    audit_manager: '#7c3aed', employee: '#6b7280',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, color: '#fff',
      background: colors[role] || '#6b7280',
    }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function Admin() {
  const { employee: me } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('roles');

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);

  // Roles tab state
  const [roleEdits, setRoleEdits] = useState({}); // { [empId]: newRole }
  const [savingRole, setSavingRole] = useState({});

  // Permissions tab state
  const [selectedEmp, setSelectedEmp] = useState('');
  const [pendingOverrides, setPendingOverrides] = useState({}); // { [perm]: true | false | undefined }
  const [savingPerms, setSavingPerms] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllEmployeesWithOverrides();
      setEmployees(data);
    } catch (e) {
      addToast('Failed to load employees', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Roles tab ──────────────────────────────────────────────────────────────
  const handleRoleChange = (empId, newRole) => {
    setRoleEdits(prev => ({ ...prev, [empId]: newRole }));
  };

  const saveRole = async (emp) => {
    const newRole = roleEdits[emp.name];
    if (!newRole || newRole === emp.role) return;
    setSavingRole(prev => ({ ...prev, [emp.name]: true }));
    try {
      await updateEmployee(emp.name, { role: newRole });
      setEmployees(prev => prev.map(e => e.name === emp.name ? { ...e, role: newRole } : e));
      setRoleEdits(prev => { const n = { ...prev }; delete n[emp.name]; return n; });
      addToast(`${emp.employee_name}'s role updated to ${ROLE_LABELS[newRole]}`, 'success');
    } catch {
      addToast('Failed to update role', 'error');
    } finally {
      setSavingRole(prev => ({ ...prev, [emp.name]: false }));
    }
  };

  // ── Permissions tab ────────────────────────────────────────────────────────
  const selectedEmpObj = employees.find(e => e.name === selectedEmp);

  // When a different employee is selected, load their current overrides into pending state
  useEffect(() => {
    if (!selectedEmpObj) { setPendingOverrides({}); return; }
    // Convert stored overrides to pending format (undefined = no override / role default)
    const pending = {};
    for (const [perm, val] of Object.entries(selectedEmpObj.overrides)) {
      pending[perm] = val;
    }
    setPendingOverrides(pending);
  }, [selectedEmp]);

  const handlePermToggle = (perm, value) => {
    setPendingOverrides(prev => {
      const next = { ...prev };
      if (value === undefined) delete next[perm];
      else next[perm] = value;
      return next;
    });
  };

  const resetToRole = () => {
    setPendingOverrides({});
  };

  const savePermissions = async () => {
    if (!selectedEmpObj) return;
    setSavingPerms(true);
    try {
      // Build diff: what overrides to set vs delete
      const toSave = {};
      // All permissions that exist in pendingOverrides
      for (const [perm, val] of Object.entries(pendingOverrides)) {
        toSave[perm] = val;
      }
      // Any existing overrides NOT in pendingOverrides → delete (null means remove)
      for (const perm of Object.keys(selectedEmpObj.overrides)) {
        if (!(perm in pendingOverrides)) toSave[perm] = null;
      }
      await savePermissionOverrides(selectedEmpObj.name, toSave);
      // Update local state
      setEmployees(prev => prev.map(e =>
        e.name === selectedEmpObj.name ? { ...e, overrides: { ...pendingOverrides } } : e
      ));
      addToast('Permissions saved', 'success');
    } catch {
      addToast('Failed to save permissions', 'error');
    } finally {
      setSavingPerms(false);
    }
  };

  const hasUnsavedChanges = selectedEmpObj && (
    JSON.stringify(pendingOverrides) !== JSON.stringify(
      Object.fromEntries(Object.entries(selectedEmpObj.overrides).filter(([,v]) => v !== undefined))
    )
  );

  // Count overrides for a given employee
  const overrideCount = (emp) => Object.keys(emp.overrides).length;

  return (
    <div className="page-content">
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Control Panel</h3>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Admin only</span>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button
            className={`admin-tab${tab === 'roles' ? ' active' : ''}`}
            onClick={() => setTab('roles')}
          >
            Users &amp; Roles
          </button>
          <button
            className={`admin-tab${tab === 'permissions' ? ' active' : ''}`}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>
        </div>

        {/* ── Tab: Users & Roles ─────────────────────────────────────────────── */}
        {tab === 'roles' && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Current Role</th>
                  <th>Change Role</th>
                  <th>Perm Overrides</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><Skeleton height={14} /></td>
                      ))}
                    </tr>
                  ))
                ) : employees.map(emp => {
                  const pendingRole = roleEdits[emp.name];
                  const isDirty = pendingRole && pendingRole !== emp.role;
                  const isSelf = emp.name === me?.name;
                  return (
                    <tr key={emp.name}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{emp.employee_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.name}</div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{emp.department}</td>
                      <td><RolePill role={emp.role} /></td>
                      <td>
                        <select
                          className="form-control"
                          style={{ fontSize: 13, padding: '4px 8px', width: 'auto' }}
                          value={pendingRole ?? emp.role}
                          onChange={e => handleRoleChange(emp.name, e.target.value)}
                          disabled={isSelf}
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {overrideCount(emp) > 0 ? (
                          <button
                            className="btn btn-sm"
                            style={{ fontSize: 12 }}
                            onClick={() => { setSelectedEmp(emp.name); setTab('permissions'); }}
                          >
                            {overrideCount(emp)} override{overrideCount(emp) > 1 ? 's' : ''}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td>
                        {isSelf ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>You</span>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!isDirty || savingRole[emp.name]}
                            onClick={() => saveRole(emp)}
                          >
                            {savingRole[emp.name] ? 'Saving…' : 'Save'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tab: Permissions ───────────────────────────────────────────────── */}
        {tab === 'permissions' && (
          <div style={{ padding: '20px 24px' }}>
            {/* Employee picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 280px' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Select Employee
                </label>
                <select
                  className="form-control"
                  value={selectedEmp}
                  onChange={e => setSelectedEmp(e.target.value)}
                >
                  <option value="">— Choose an employee —</option>
                  {employees.map(e => (
                    <option key={e.name} value={e.name}>{e.employee_name} ({ROLE_LABELS[e.role] || e.role})</option>
                  ))}
                </select>
              </div>
              {selectedEmpObj && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 22 }}>
                  <RolePill role={selectedEmpObj.role} />
                  <button className="btn btn-sm" onClick={resetToRole}>Reset to role defaults</button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={savePermissions}
                    disabled={savingPerms || !hasUnsavedChanges}
                  >
                    {savingPerms ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            {!selectedEmpObj ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                Select an employee to manage their permissions
              </div>
            ) : (
              <>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                  {[
                    { cls: 'perm-role-on',   label: 'Granted by role' },
                    { cls: 'perm-role-off',  label: 'Not in role' },
                    { cls: 'perm-force-on',  label: 'Manually granted' },
                    { cls: 'perm-force-off', label: 'Manually revoked' },
                  ].map(({ cls, label }) => (
                    <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span className={`perm-toggle ${cls}`} style={{ pointerEvents: 'none', cursor: 'default' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {cls.includes('off') ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <polyline points="20 6 9 17 4 12"/>}
                        </svg>
                      </span>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Permission matrix */}
                <div className="perm-matrix">
                  {PERM_GROUPS.map(group => {
                    const rolePerms = ROLE_PERMISSIONS[selectedEmpObj.role] || [];
                    return (
                      <div key={group.label} className="perm-group">
                        <div className="perm-group-label">{group.label}</div>
                        {group.perms.map(perm => {
                          const roleHas = rolePerms.includes(perm);
                          const override = pendingOverrides[perm]; // true | false | undefined
                          const effective = override !== undefined ? override : roleHas;
                          return (
                            <div key={perm} className={`perm-row${effective ? ' perm-row-on' : ''}`}>
                              <PermToggle
                                roleHas={roleHas}
                                override={override}
                                onChange={(val) => handlePermToggle(perm, val)}
                              />
                              <span className="perm-label">{PERM_LABELS[perm] || perm}</span>
                              <span className="perm-key">{perm}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
