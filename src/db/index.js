import Dexie from 'dexie';
import {
  MOCK_EMPLOYEES,
  MOCK_LEAVE_APPLICATIONS,
  MOCK_HOURLY_APPLICATIONS,
  MOCK_ALLOCATIONS_V2,
  MOCK_CHECKINS,
  MOCK_WEEKLY_ATTENDANCE,
  MOCK_TIMESHEETS,
  MOCK_PROJECTS,
  MOCK_PAYSLIPS,
  MOCK_ANNOUNCEMENTS,
  MOCK_DAY_REQUESTS,
  MOCK_PAYROLL_RECORDS,
  MOCK_PAYROLL_LOG,
  MOCK_APPRAISAL_TEMPLATES,
  MOCK_APPRAISALS,
  MOCK_JOBS,
  MOCK_CANDIDATES,
  MOCK_EXPENSES,
  MOCK_NOTIFICATIONS,
  MOCK_AUDIT_LOGS,
} from '../api/mock';

export const db = new Dexie('HRAppDemo');

db.version(1).stores({
  employees:     'name, department, user_id, reports_to',
  checkins:      'name, employee, time',
  attendance:    'name, employee, attendance_date',
  leave_apps:    'name, employee, status, from_date',
  leave_allocs:  '[employee+leave_type], employee',
  timesheets:    'name, employee, start_date',
  payslips:      'name, employee, posting_date',
  announcements: 'name',
  projects:      'name',
  day_requests:  '++id, employee_id, request_type, request_date, approval_status',
  payroll:       '++id, employee_id, period_start, period_end, status',
  pending_ops:   '++id, synced_at',
  meta:          'key',
});

db.version(2).stores({
  payroll_log: '++id, payroll_id, performed_by',
});

db.version(3).stores({
  appraisal_templates: '++id',
  appraisals:          '++id, employee_id, appraiser_id, status, template_id',
  recruitment_jobs:    '++id, department, status',
  recruitment_candidates: '++id, job_id, stage, status',
  expenses:            '++id, employee_id, status, expense_date',
  notifications:       '++id, recipient_id, read',
});

db.version(4).stores({
  audit_logs: '++id, timestamp, user_id, role, resource, action',
});

// ─── Seed demo data on first run ──────────────────────────────────────────────
const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const SEED_VERSION = 'v10';

export async function initDatabase() {
  if (!DEMO) return;
  try {
    const already = await db.meta.get('seeded');
    const empCount = await db.employees.count().catch(() => 0);
    // Reseed if version is stale OR employees table is empty
    if (already?.version === SEED_VERSION && empCount >= 6) return;
    await seedAll();
  } catch (err) {
    if (import.meta.env.DEV) console.error('DB init error, retrying seed:', err);
    try { await seedAll(); } catch (e) { if (import.meta.env.DEV) console.error('Seed failed:', e); }
  }
}

async function seedAll() {
  await Promise.all([
    db.employees.clear(), db.checkins.clear(), db.attendance.clear(),
    db.leave_apps.clear(), db.leave_allocs.clear(), db.timesheets.clear(),
    db.payslips.clear(), db.announcements.clear(), db.projects.clear(),
    db.day_requests.clear(), db.payroll.clear(), db.payroll_log.clear(),
    db.pending_ops.clear(), db.meta.clear(),
    db.appraisal_templates.clear(), db.appraisals.clear(),
    db.recruitment_jobs.clear(), db.recruitment_candidates.clear(),
    db.expenses.clear(), db.notifications.clear(),
    // audit_logs intentionally NOT cleared — audit trail must persist
  ]);

  await db.employees.bulkPut([...MOCK_EMPLOYEES]);
  await db.checkins.bulkPut(MOCK_CHECKINS.map(c => ({ ...c })));
  await db.attendance.bulkPut(MOCK_WEEKLY_ATTENDANCE.map(a => ({ ...a })));

  const daily  = MOCK_LEAVE_APPLICATIONS.map(l => ({ ...l, is_hourly: false }));
  const hourly = MOCK_HOURLY_APPLICATIONS.map(l => ({ ...l, is_hourly: true }));
  await db.leave_apps.bulkPut([...daily, ...hourly]);
  for (const emp of MOCK_EMPLOYEES) {
    await db.leave_allocs.bulkPut(MOCK_ALLOCATIONS_V2.map(a => ({ ...a, employee: emp.name })));
  }

  await db.timesheets.bulkPut(MOCK_TIMESHEETS.map(t => ({ ...t })));
  await db.payslips.bulkPut(MOCK_PAYSLIPS.map(p => ({ ...p })));
  await db.announcements.bulkPut(MOCK_ANNOUNCEMENTS.map(a => ({ ...a })));
  await db.projects.bulkPut(MOCK_PROJECTS.map(p => ({ ...p })));

  await db.day_requests.bulkPut(MOCK_DAY_REQUESTS.map(r => ({ ...r })));
  await db.payroll.bulkPut(MOCK_PAYROLL_RECORDS.map(r => ({ ...r })));
  await db.payroll_log.bulkPut(MOCK_PAYROLL_LOG.map(r => ({ ...r })));

  await db.appraisal_templates.bulkPut(MOCK_APPRAISAL_TEMPLATES.map(t => ({ ...t })));
  await db.appraisals.bulkPut(MOCK_APPRAISALS.map(a => ({ ...a })));
  await db.recruitment_jobs.bulkPut(MOCK_JOBS.map(j => ({ ...j })));
  await db.recruitment_candidates.bulkPut(MOCK_CANDIDATES.map(c => ({ ...c })));
  await db.expenses.bulkPut(MOCK_EXPENSES.map(e => ({ ...e })));
  await db.notifications.bulkPut(MOCK_NOTIFICATIONS.map(n => ({ ...n })));

  // Seed audit logs (only if none exist — audit trail persists across seeds)
  const existingAuditCount = await db.audit_logs.count();
  if (existingAuditCount === 0) {
    await db.audit_logs.bulkPut(MOCK_AUDIT_LOGS.map(l => ({ ...l })));
  }

  await db.meta.put({ key: 'seeded', value: true, version: SEED_VERSION, at: new Date().toISOString() });
}

// ─── Clear all user data on logout ────────────────────────────────────────────
// Note: audit_logs are intentionally excluded — audit trail must persist.
export async function clearDatabase() {
  await Promise.all([
    db.employees.clear(), db.checkins.clear(), db.attendance.clear(),
    db.leave_apps.clear(), db.leave_allocs.clear(), db.timesheets.clear(),
    db.payslips.clear(), db.announcements.clear(), db.projects.clear(),
    db.day_requests.clear(), db.payroll.clear(), db.payroll_log.clear(),
    db.pending_ops.clear(), db.meta.clear(),
    db.appraisal_templates.clear(), db.appraisals.clear(),
    db.recruitment_jobs.clear(), db.recruitment_candidates.clear(),
    db.expenses.clear(), db.notifications.clear(),
  ]);
}
