// ─── Permission Strings ────────────────────────────────────────────────────────
export const PERMISSIONS = {
  EMPLOYEES_READ:       'employees:read',
  EMPLOYEES_WRITE:      'employees:write',
  EMPLOYEES_DELETE:     'employees:delete',

  PAYROLL_READ:         'payroll:read',
  PAYROLL_WRITE:        'payroll:write',
  PAYROLL_PROCESS:      'payroll:process',
  PAYROLL_EXPORT:       'payroll:export',

  LEAVE_READ:           'leave:read',
  LEAVE_WRITE:          'leave:write',
  LEAVE_APPROVE:        'leave:approve',

  ATTENDANCE_READ:      'attendance:read',
  ATTENDANCE_WRITE:     'attendance:write',

  RECRUITMENT_READ:     'recruitment:read',
  RECRUITMENT_MANAGE:   'recruitment:manage',

  EXPENSES_READ:        'expenses:read',
  EXPENSES_WRITE:       'expenses:write',
  EXPENSES_APPROVE:     'expenses:approve',

  REPORTS_HR:           'reports:hr',
  REPORTS_FINANCE:      'reports:finance',
  REPORTS_EXECUTIVE:    'reports:executive',

  AUDIT_READ:           'audit:read',

  APPRAISALS_READ:      'appraisals:read',
  APPRAISALS_MANAGE:    'appraisals:manage',

  TIMESHEETS_READ:      'timesheets:read',
  TIMESHEETS_WRITE:     'timesheets:write',

  ANNOUNCEMENTS_READ:   'announcements:read',
  ANNOUNCEMENTS_WRITE:  'announcements:write',

  PAYSLIPS_READ:        'payslips:read',

  DAY_REQUESTS_READ:    'day_requests:read',
  DAY_REQUESTS_WRITE:   'day_requests:write',
  DAY_REQUESTS_APPROVE: 'day_requests:approve',

  ADMIN_ACCESS:         'admin:access',
};

// ─── Role → Permissions Map ────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),

  ceo: [
    'employees:read',
    'payroll:read',
    'payroll:export',
    'leave:read',
    'leave:approve',
    'attendance:read',
    'recruitment:read',
    'expenses:read',
    'expenses:approve',
    'reports:hr',
    'reports:finance',
    'reports:executive',
    'audit:read',
    'appraisals:read',
    'timesheets:read',
    'announcements:read',
    'payslips:read',
    'day_requests:read',
    'day_requests:approve',
  ],

  hr_manager: [
    'employees:read',
    'employees:write',
    'employees:delete',
    'payroll:read',
    'payroll:write',
    'payroll:process',
    'payroll:export',
    'leave:read',
    'leave:write',
    'leave:approve',
    'attendance:read',
    'attendance:write',
    'recruitment:read',
    'recruitment:manage',
    'appraisals:read',
    'appraisals:manage',
    'timesheets:read',
    'timesheets:write',
    'reports:hr',
    'reports:finance',
    'announcements:read',
    'announcements:write',
    'expenses:read',
    'expenses:approve',
    'day_requests:read',
    'day_requests:write',
    'day_requests:approve',
    'payslips:read',
  ],

  finance_manager: [
    'payroll:read',
    'payroll:write',
    'payroll:process',
    'payroll:export',
    'leave:read',
    'leave:write',
    'expenses:read',
    'expenses:approve',
    'reports:finance',
    'reports:hr',
    'reports:executive',
    'employees:read',
    'payslips:read',
    'announcements:read',
  ],

  it_manager: [
    'employees:read',
    'leave:read',
    'leave:write',
    'leave:approve',
    'attendance:read',
    'attendance:write',
    'timesheets:read',
    'timesheets:write',
    'expenses:read',
    'expenses:write',
    'appraisals:read',
    'appraisals:manage',
    'day_requests:read',
    'day_requests:write',
    'day_requests:approve',
    'announcements:read',
    'payslips:read',
    'reports:hr',
  ],

  employee: [
    'employees:read',
    'leave:read',
    'leave:write',
    'attendance:read',
    'attendance:write',
    'timesheets:read',
    'timesheets:write',
    'expenses:read',
    'expenses:write',
    'appraisals:read',
    'day_requests:read',
    'day_requests:write',
    'announcements:read',
    'payslips:read',
  ],

  audit_manager: [
    'employees:read',
    'payroll:read',
    'leave:read',
    'attendance:read',
    'recruitment:read',
    'expenses:read',
    'reports:hr',
    'reports:finance',
    'reports:executive',
    'audit:read',
    'appraisals:read',
    'timesheets:read',
    'payslips:read',
    'day_requests:read',
    'announcements:read',
  ],
};

// ─── hasPermission ─────────────────────────────────────────────────────────────
// Pre-build Set for O(1) lookup — permissions are checked on every render
export const ROLE_PERMISSION_SETS = Object.fromEntries(
  Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set(perms)])
);

export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return ROLE_PERMISSION_SETS[role]?.has(permission) ?? false;
}

// ─── Route → Required Permission Map ──────────────────────────────────────────
export const ROUTE_PERMISSIONS = {
  '/employees':    'employees:read',
  '/leave':        'leave:read',
  '/attendance':   'attendance:read',
  '/timesheets':   'timesheets:read',
  '/payslips':     'payslips:read',
  '/day-requests': 'day_requests:read',
  '/payroll':      'payroll:read',
  '/audit':        'audit:read',
  '/appraisals':   'appraisals:read',
  '/recruitment':  'recruitment:read',
  '/expenses':     'expenses:read',
  '/reports':      'reports:hr',
};
