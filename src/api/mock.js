// Mock data for demo mode — no ERPNext connection needed

// Reporting structure:
//   Hussein Alaa (HR-EMP-0010) — System Administrator (admin)
//   Alaa Alghanimi  (HR-EMP-0009) — CEO (admin)
//     ├── Sara   (HR-EMP-0002) — HR Manager     (hr_manager) → reports to CEO
//     ├── Khalid (HR-EMP-0003) — Finance Manager (finance)   → reports to CEO
//     └── Ahmed  (HR-EMP-0001) — IT Manager      (it_manager)→ reports to CEO
//           └── Reem (HR-EMP-0006) — Software Developer (employee)
//
//   Audit Manager (AUDIT-001) — Audit Manager (audit)

const CO = 'Afaq Al-Fiker';
const BR = 'Baghdad HQ';

export const MOCK_EMPLOYEES = [
  {
    name: 'HR-EMP-0010', employee_name: 'Hussein Alaa',
    department: 'Management',             designation: 'System Administrator',
    cell_number: '',                      image: '',       reports_to: '',
    company: CO, branch: BR,             employment_type: 'Full-time',
    date_of_joining: '2015-01-01',        gender: 'Male',  date_of_birth: '',
    personal_email: '',                   company_email: 'hussein@afaqalfiker.com',
    user_id: 'hussein',
    base_salary: 1_200_000,              additional_salary: 300_000,
  },
  {
    name: 'HR-EMP-0009', employee_name: 'Alaa Alghanimi',
    department: 'Management',             designation: 'CEO',
    cell_number: '+964 770 000 0001',     image: '',       reports_to: '',
    company: CO, branch: BR,             employment_type: 'Full-time',
    date_of_joining: '2015-01-01',        gender: 'Male',  date_of_birth: '1975-03-10',
    personal_email: 'alaa@gmail.com',     company_email: 'alaa@afaqalfiker.com',
    user_id: 'administrator',
    base_salary: 1_500_000,              additional_salary: 500_000,
  },
  {
    name: 'HR-EMP-0002', employee_name: 'Sara Al-Otaibi',
    department: 'Human Resources',        designation: 'HR Manager',
    cell_number: '+964 771 234 5678',     image: '',       reports_to: 'HR-EMP-0009',
    company: CO, branch: BR,             employment_type: 'Full-time',
    date_of_joining: '2019-01-15',        gender: 'Female', date_of_birth: '1988-04-20',
    personal_email: 'sara@gmail.com',     company_email: 'sara@afaqalfiker.com',
    user_id: 'sara',
    base_salary: 800_000,               additional_salary: 150_000,
  },
  {
    name: 'HR-EMP-0003', employee_name: 'Khalid Al-Zahrani',
    department: 'Finance',                designation: 'Finance Manager',
    cell_number: '+964 772 345 6789',     image: '',       reports_to: 'HR-EMP-0009',
    company: CO, branch: BR,             employment_type: 'Full-time',
    date_of_joining: '2018-06-01',        gender: 'Male',  date_of_birth: '1983-08-15',
    personal_email: 'khalid@gmail.com',   company_email: 'khalid@afaqalfiker.com',
    user_id: 'khalid',
    base_salary: 750_000,               additional_salary: 100_000,
  },
  {
    name: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',
    department: 'Information Technology', designation: 'IT Manager',
    cell_number: '+964 770 123 4567',     image: '',       reports_to: 'HR-EMP-0009',
    company: CO, branch: BR,             employment_type: 'Full-time',
    date_of_joining: '2022-03-01',        gender: 'Male',  date_of_birth: '1995-06-15',
    personal_email: 'ahmed@gmail.com',    company_email: 'ahmed@afaqalfiker.com',
    user_id: 'ahmed',
    base_salary: 600_000,               additional_salary: 100_000,
  },
  {
    name: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari',
    department: 'Information Technology', designation: 'Software Developer',
    cell_number: '+964 775 678 9012',     image: '',       reports_to: 'HR-EMP-0001',
    company: CO, branch: BR,             employment_type: 'Full-time',
    date_of_joining: '2023-09-01',        gender: 'Female', date_of_birth: '2000-04-22',
    personal_email: 'reem@gmail.com',     company_email: 'reem@afaqalfiker.com',
    user_id: 'reem',
    base_salary: 500_000,               additional_salary: 75_000,
  },
];

export const MOCK_LEAVE_APPLICATIONS = [
  { name: 'LAPPL-0001', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',  leave_type: 'Annual Leave',  from_date: '2026-03-10', to_date: '2026-03-12', total_leave_days: 3, status: 'Approved',  approval_stage: 'Approved',         description: 'Family trip' },
  { name: 'LAPPL-0002', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',  leave_type: 'Sick Leave',    from_date: '2026-02-20', to_date: '2026-02-21', total_leave_days: 2, status: 'Approved',  approval_stage: 'Approved',         description: 'Not feeling well' },
  { name: 'LAPPL-0003', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',  leave_type: 'Casual Leave',  from_date: '2026-04-01', to_date: '2026-04-01', total_leave_days: 1, status: 'Open',      approval_stage: 'Pending Manager',  description: 'Personal work' },
  { name: 'LAPPL-0004', employee: 'HR-EMP-0002', employee_name: 'Sara Al-Otaibi',    leave_type: 'Annual Leave',  from_date: '2026-03-20', to_date: '2026-03-25', total_leave_days: 6, status: 'Approved',  approval_stage: 'Approved',         description: 'Vacation' },
  { name: 'LAPPL-0005', employee: 'HR-EMP-0003', employee_name: 'Khalid Al-Zahrani', leave_type: 'Sick Leave',    from_date: '2026-03-14', to_date: '2026-03-14', total_leave_days: 1, status: 'Open',      approval_stage: 'Pending Manager',  description: 'Doctor appointment' },
  { name: 'LAPPL-0006', employee: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari',   leave_type: 'Sick Leave',    from_date: '2026-03-13', to_date: '2026-03-13', total_leave_days: 1, status: 'Rejected',  approval_stage: 'Rejected',         description: 'Flu' },
];

export const MOCK_ALLOCATIONS = [
  { leave_type: 'Annual Leave',  total_leaves_allocated: 21, carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Sick Leave',    total_leaves_allocated: 10, carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Casual Leave',  total_leaves_allocated: 6,  carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Hourly Leave',  total_leaves_allocated: 24, carry_forwarded_leaves_count: 0, is_hourly: true  },
];

// Hourly leave applications (tracked in hours, not days)
export const MOCK_HOURLY_APPLICATIONS = [
  { name: 'HLAPPL-0001', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', leave_type: 'Hourly Leave', from_date: '2026-03-05', from_time: '10:00', to_time: '12:00', total_hours: 2, status: 'Approved', approval_stage: 'Approved', description: 'Bank errand' },
  { name: 'HLAPPL-0002', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', leave_type: 'Hourly Leave', from_date: '2026-03-11', from_time: '14:00', to_time: '16:00', total_hours: 2, status: 'Approved', approval_stage: 'Approved', description: 'Medical check' },
];

const today = new Date().toISOString().split('T')[0];
const now = new Date().toISOString().replace('T', ' ').split('.')[0];

export const MOCK_CHECKINS = [
  { name: 'CHK-0001', employee: 'HR-EMP-0001', log_type: 'IN',  time: `${today} 08:55:00` },
];

export const MOCK_WEEKLY_ATTENDANCE = [
  { name: 'ATT-001', employee: 'HR-EMP-0001', attendance_date: '2026-03-09', status: 'Present', in_time: '2026-03-09 08:50:00', out_time: '2026-03-09 17:10:00', working_hours: 8.3 },
  { name: 'ATT-002', employee: 'HR-EMP-0001', attendance_date: '2026-03-10', status: 'Present', in_time: '2026-03-10 09:05:00', out_time: '2026-03-10 17:00:00', working_hours: 7.9 },
  { name: 'ATT-003', employee: 'HR-EMP-0001', attendance_date: '2026-03-11', status: 'Present', in_time: '2026-03-11 08:45:00', out_time: '2026-03-11 17:30:00', working_hours: 8.8 },
  { name: 'ATT-004', employee: 'HR-EMP-0001', attendance_date: '2026-03-12', status: 'Present', in_time: '2026-03-12 09:00:00', out_time: '2026-03-12 17:00:00', working_hours: 8.0 },
  { name: 'ATT-005', employee: 'HR-EMP-0001', attendance_date: '2026-03-13', status: 'Present', in_time: '2026-03-13 08:55:00', out_time: '2026-03-13 16:50:00', working_hours: 7.9 },
];

export const MOCK_TIMESHEETS = [
  { name: 'TS-2026-001', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', start_date: '2026-03-02', end_date: '2026-03-08', status: 'Submitted', total_hours: 40 },
  { name: 'TS-2026-002', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', start_date: '2026-02-23', end_date: '2026-03-01', status: 'Submitted', total_hours: 38.5 },
];

export const MOCK_PROJECTS = [
  { name: 'PROJ-001', project_name: 'HR Portal Development' },
  { name: 'PROJ-002', project_name: 'ERP Integration' },
  { name: 'PROJ-003', project_name: 'Internal IT Support' },
];

export const MOCK_PAYSLIPS = [
  {
    name: 'SAL-2026-003', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',
    posting_date: '2026-03-31', start_date: '2026-03-01', end_date: '2026-03-31',
    gross_pay: 1_250_000, total_deduction: 112_500, net_pay: 1_137_500, status: 'Submitted',
    currency: 'IQD',
    earnings: [
      { salary_component: 'Basic Salary',             amount: 800_000 },
      { salary_component: 'Housing Allowance',         amount: 250_000 },
      { salary_component: 'Transportation Allowance',  amount: 125_000 },
      { salary_component: 'Mobile Allowance',          amount:  75_000 },
    ],
    deductions: [
      { salary_component: 'Social Security',  amount: 80_000 },
      { salary_component: 'Income Tax',       amount: 32_500 },
    ],
  },
  {
    name: 'SAL-2026-002', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',
    posting_date: '2026-02-28', start_date: '2026-02-01', end_date: '2026-02-28',
    gross_pay: 1_250_000, total_deduction: 112_500, net_pay: 1_137_500, status: 'Submitted',
    currency: 'IQD',
    earnings: [
      { salary_component: 'Basic Salary',             amount: 800_000 },
      { salary_component: 'Housing Allowance',         amount: 250_000 },
      { salary_component: 'Transportation Allowance',  amount: 125_000 },
      { salary_component: 'Mobile Allowance',          amount:  75_000 },
    ],
    deductions: [
      { salary_component: 'Social Security',  amount: 80_000 },
      { salary_component: 'Income Tax',       amount: 32_500 },
    ],
  },
  {
    name: 'SAL-2026-001', employee: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',
    posting_date: '2026-01-31', start_date: '2026-01-01', end_date: '2026-01-31',
    gross_pay: 1_200_000, total_deduction: 108_000, net_pay: 1_092_000, status: 'Submitted',
    currency: 'IQD',
    earnings: [
      { salary_component: 'Basic Salary',             amount: 800_000 },
      { salary_component: 'Housing Allowance',         amount: 250_000 },
      { salary_component: 'Transportation Allowance',  amount: 100_000 },
      { salary_component: 'Mobile Allowance',          amount:  50_000 },
    ],
    deductions: [
      { salary_component: 'Social Security',  amount: 80_000 },
      { salary_component: 'Income Tax',       amount: 28_000 },
    ],
  },
];

export const MOCK_ANNOUNCEMENTS = [
  { name: 'ANN-001', title: 'Ramadan Working Hours', notice_date: '2026-03-01', content: 'Working hours during Ramadan will be from 9:00 AM to 3:00 PM.' },
  { name: 'ANN-002', title: 'Q1 Performance Reviews', notice_date: '2026-02-15', content: 'Q1 performance reviews will begin on March 20th. Please complete your self-assessments.' },
  { name: 'ANN-003', title: 'New Health Insurance Policy', notice_date: '2026-02-01', content: 'Updated health insurance cards are available for collection from HR.' },
];

// ─── Day Requests ─────────────────────────────────────────────────────────────
export const MOCK_DAY_REQUESTS = [
  { id: 1, employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',   request_type: 'Friday Day',   request_date: '2026-03-07', approval_status: 'Approved',  created_at: '2026-03-06T09:00:00Z', notes: 'Covered emergency deployment' },
  { id: 2, employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',   request_type: 'Extra Day',    request_date: '2026-03-08', approval_status: 'Approved',  created_at: '2026-03-07T10:00:00Z', notes: 'Critical system migration' },
  { id: 3, employee_id: 'HR-EMP-0002', employee_name: 'Sara Al-Otaibi',     request_type: 'Friday Day',   request_date: '2026-03-07', approval_status: 'Pending',   created_at: '2026-03-06T11:00:00Z', notes: 'HR audit preparation' },
  { id: 4, employee_id: 'HR-EMP-0003', employee_name: 'Khalid Al-Zahrani',  request_type: 'Friday Day',   request_date: '2026-03-07', approval_status: 'Rejected',  created_at: '2026-03-05T08:00:00Z', notes: 'Financial reporting' },
  { id: 5, employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',   request_type: 'Friday Day',   request_date: '2026-03-14', approval_status: 'Pending',   created_at: '2026-03-13T09:00:00Z', notes: 'Planned maintenance window' },
  { id: 6, employee_id: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari',    request_type: 'Extra Day',    request_date: '2026-03-22', approval_status: 'Approved',  created_at: '2026-03-21T10:00:00Z', notes: 'Sprint deadline' },
];

// ─── Payroll Records (March 2026) ─────────────────────────────────────────────
// Status flow: Draft → Submitted (by HR) → Paid (by Finance)
export const MOCK_PAYROLL_RECORDS = [
  {
    // Paid: full cycle completed
    id: 1,  employee_id: 'HR-EMP-0010', employee_name: 'Hussein Alaa',
    period_start: '2026-03-01', period_end: '2026-03-31',
    base_salary: 1_200_000, additional_salary: 300_000,
    working_days: 30, friday_bonus: 0, extra_day_bonus: 0,
    calculated_salary: 1_500_000, status: 'Paid', payroll_date: '2026-03-31',
    submitted_by: 'HR-EMP-0002', submitted_by_name: 'Sara Al-Otaibi', submitted_at: '2026-03-31T08:00:00Z',
    paid_by: 'HR-EMP-0003',      paid_by_name: 'Khalid Al-Zahrani',   paid_at: '2026-03-31T14:00:00Z',
  },
  {
    // Submitted: waiting for Finance to pay
    id: 2,  employee_id: 'HR-EMP-0009', employee_name: 'Alaa Alghanimi',
    period_start: '2026-03-01', period_end: '2026-03-31',
    base_salary: 1_500_000, additional_salary: 500_000,
    working_days: 30, friday_bonus: 0, extra_day_bonus: 0,
    calculated_salary: 2_000_000, status: 'Submitted', payroll_date: '2026-03-31',
    submitted_by: 'HR-EMP-0002', submitted_by_name: 'Sara Al-Otaibi', submitted_at: '2026-03-31T08:05:00Z',
    paid_by: null, paid_by_name: null, paid_at: null,
  },
  {
    id: 3,  employee_id: 'HR-EMP-0002', employee_name: 'Sara Al-Otaibi',
    period_start: '2026-03-01', period_end: '2026-03-31',
    base_salary: 800_000, additional_salary: 150_000,
    working_days: 30, friday_bonus: 0, extra_day_bonus: 0,
    calculated_salary: 950_000, status: 'Submitted', payroll_date: '2026-03-31',
    submitted_by: 'HR-EMP-0010', submitted_by_name: 'Hussein Alaa', submitted_at: '2026-03-31T09:00:00Z',
    paid_by: null, paid_by_name: null, paid_at: null,
  },
  {
    id: 4,  employee_id: 'HR-EMP-0003', employee_name: 'Khalid Al-Zahrani',
    period_start: '2026-03-01', period_end: '2026-03-31',
    base_salary: 750_000, additional_salary: 100_000,
    working_days: 30, friday_bonus: 0, extra_day_bonus: 0,
    calculated_salary: 850_000, status: 'Draft', payroll_date: '2026-03-31',
    submitted_by: null, submitted_by_name: null, submitted_at: null,
    paid_by: null, paid_by_name: null, paid_at: null,
  },
  {
    // Ahmed: approved friday (+25,000) + approved extra (700,000/30 = 23,333)
    id: 5,  employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',
    period_start: '2026-03-01', period_end: '2026-03-31',
    base_salary: 600_000, additional_salary: 100_000,
    working_days: 30, friday_bonus: 25_000, extra_day_bonus: 23_333,
    calculated_salary: 748_333, status: 'Draft', payroll_date: '2026-03-31',
    submitted_by: null, submitted_by_name: null, submitted_at: null,
    paid_by: null, paid_by_name: null, paid_at: null,
  },
  {
    // Reem: approved extra day (575,000/30 = 19,167)
    id: 6,  employee_id: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari',
    period_start: '2026-03-01', period_end: '2026-03-31',
    base_salary: 500_000, additional_salary: 75_000,
    working_days: 30, friday_bonus: 0, extra_day_bonus: 19_167,
    calculated_salary: 594_167, status: 'Draft', payroll_date: '2026-03-31',
    submitted_by: null, submitted_by_name: null, submitted_at: null,
    paid_by: null, paid_by_name: null, paid_at: null,
  },
];

// ─── Payroll Process Log ──────────────────────────────────────────────────────
export const MOCK_PAYROLL_LOG = [
  { id: 1, payroll_id: 1, action: 'Created',              performed_by: 'HR-EMP-0002', performed_by_name: 'Sara Al-Otaibi',    timestamp: '2026-03-30T09:00:00Z', notes: '' },
  { id: 2, payroll_id: 1, action: 'Submitted to Finance', performed_by: 'HR-EMP-0002', performed_by_name: 'Sara Al-Otaibi',    timestamp: '2026-03-31T08:00:00Z', notes: 'Ready for March payment' },
  { id: 3, payroll_id: 1, action: 'Marked as Paid',       performed_by: 'HR-EMP-0003', performed_by_name: 'Khalid Al-Zahrani', timestamp: '2026-03-31T14:00:00Z', notes: 'Bank transfer completed' },
  { id: 4, payroll_id: 2, action: 'Created',              performed_by: 'HR-EMP-0002', performed_by_name: 'Sara Al-Otaibi',    timestamp: '2026-03-30T09:05:00Z', notes: '' },
  { id: 5, payroll_id: 2, action: 'Submitted to Finance', performed_by: 'HR-EMP-0002', performed_by_name: 'Sara Al-Otaibi',    timestamp: '2026-03-31T08:05:00Z', notes: 'Ready for March payment' },
  { id: 6, payroll_id: 3, action: 'Created',              performed_by: 'HR-EMP-0010', performed_by_name: 'Hussein Alaa',   timestamp: '2026-03-30T10:00:00Z', notes: '' },
  { id: 7, payroll_id: 3, action: 'Submitted to Finance', performed_by: 'HR-EMP-0010', performed_by_name: 'Hussein Alaa',   timestamp: '2026-03-31T09:00:00Z', notes: '' },
];

// ─── Updated Leave Allocations (extended leave types) ─────────────────────────
// Replace export with new one that includes Marriage, Bereavement, Unpaid
export const MOCK_ALLOCATIONS_V2 = [
  { leave_type: 'Annual Leave',      total_leaves_allocated: 21, carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Sick Leave',        total_leaves_allocated: 30, carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Casual Leave',      total_leaves_allocated: 6,  carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Marriage Leave',    total_leaves_allocated: 10, carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Bereavement Leave', total_leaves_allocated: 2,  carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Unpaid Leave',      total_leaves_allocated: 30, carry_forwarded_leaves_count: 0, is_hourly: false },
  { leave_type: 'Hourly Leave',      total_leaves_allocated: 24, carry_forwarded_leaves_count: 0, is_hourly: true  },
];

// ─── Appraisal Templates ──────────────────────────────────────────────────────
export const MOCK_APPRAISAL_TEMPLATES = [
  {
    id: 1, name: 'Quarterly Performance Review', description: 'Q1 2026 review cycle',
    questions: [
      { id: 1, text: 'Achievement of set goals and targets',  type: 'rating' },
      { id: 2, text: 'Quality of work output',                type: 'rating' },
      { id: 3, text: 'Communication and teamwork',            type: 'rating' },
      { id: 4, text: 'Initiative and problem solving',        type: 'rating' },
      { id: 5, text: 'Overall comments and areas for improvement', type: 'text' },
    ],
  },
  {
    id: 2, name: 'Annual Performance Appraisal', description: 'Year-end comprehensive review',
    questions: [
      { id: 1, text: 'Goals and KPI achievement',     type: 'rating' },
      { id: 2, text: 'Technical skills and knowledge', type: 'rating' },
      { id: 3, text: 'Leadership and collaboration',   type: 'rating' },
      { id: 4, text: 'Adherence to policies',          type: 'rating' },
      { id: 5, text: 'Professional development',       type: 'rating' },
      { id: 6, text: 'Key achievements this year',     type: 'text'   },
      { id: 7, text: 'Goals for next year',            type: 'text'   },
    ],
  },
];

// ─── Appraisals ───────────────────────────────────────────────────────────────
export const MOCK_APPRAISALS = [
  {
    id: 1, template_id: 1, template_name: 'Quarterly Performance Review',
    employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi',
    appraiser_id: 'HR-EMP-0009', appraiser_name: 'Alaa Alghanimi',
    period: 'Q1 2026', status: 'Self-Assessment Submitted',
    self_scores:    { 1: 4, 2: 4, 3: 3, 4: 4 }, self_comment: 'Met all Q1 technical objectives. Completed the ERP integration milestone ahead of schedule.',
    manager_scores: null, manager_comment: null, final_score: null,
    created_at: '2026-03-01T09:00:00Z', submitted_at: '2026-03-10T11:00:00Z',
  },
  {
    id: 2, template_id: 1, template_name: 'Quarterly Performance Review',
    employee_id: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari',
    appraiser_id: 'HR-EMP-0001', appraiser_name: 'Ahmed Al-Rashidi',
    period: 'Q1 2026', status: 'Completed',
    self_scores:    { 1: 5, 2: 5, 3: 4, 4: 5 }, self_comment: 'Delivered all sprint tasks on time. Received positive peer feedback.',
    manager_scores: { 1: 5, 2: 4, 3: 4, 4: 4 }, manager_comment: 'Reem consistently exceeds expectations. Excellent deliverables this quarter.',
    final_score: 4.5,
    created_at: '2026-03-01T09:00:00Z', submitted_at: '2026-03-07T09:00:00Z', completed_at: '2026-03-12T14:00:00Z',
  },
];

// ─── Recruitment ──────────────────────────────────────────────────────────────
export const MOCK_JOBS = [
  { id: 1, job_title: 'Senior Software Engineer', department: 'Information Technology', status: 'Open',   description: 'Looking for experienced full-stack developer with 5+ years.',   created_at: '2026-02-15', target_date: '2026-04-01', hired_count: 0 },
  { id: 2, job_title: 'HR Specialist',            department: 'Human Resources',        status: 'Open',   description: 'Daily HR operations, onboarding, and employee relations.',       created_at: '2026-03-01', target_date: '2026-04-15', hired_count: 0 },
  { id: 3, job_title: 'Marketing Manager',        department: 'Marketing',              status: 'Closed', description: 'Lead marketing strategy and team.',                              created_at: '2026-01-10', target_date: '2026-02-28', hired_count: 1 },
];

export const MOCK_CANDIDATES = [
  { id: 1, job_id: 1, name: 'Ali Hassan',       email: 'ali.hassan@email.com',   phone: '+964 770 111 2233', stage: 'Interview',    status: 'Active',    applied_at: '2026-02-20', cv_note: 'Strong React & Node.js. 6 years experience.' },
  { id: 2, job_id: 1, name: 'Maha Al-Rasheed',  email: 'maha.r@email.com',       phone: '+964 771 222 3344', stage: 'Offer',        status: 'Active',    applied_at: '2026-02-18', cv_note: 'Full-stack developer. Currently at tech startup.' },
  { id: 3, job_id: 1, name: 'Tariq Al-Zaidi',   email: 'tariq.z@email.com',      phone: '+964 772 333 4455', stage: 'Screening',    status: 'Active',    applied_at: '2026-03-05', cv_note: 'Junior-mid level. Needs assessment.' },
  { id: 4, job_id: 2, name: 'Nadia Al-Amiri',   email: 'nadia.amiri@email.com',  phone: '+964 773 444 5566', stage: 'Application',  status: 'Active',    applied_at: '2026-03-08', cv_note: 'HR degree + 3 years experience.' },
  { id: 5, job_id: 2, name: 'Sara Al-Hamdan',   email: 'sara.hamdan@email.com',  phone: '+964 774 555 6677', stage: 'Interview',    status: 'Active',    applied_at: '2026-03-02', cv_note: 'Strong recruiter background.' },
  { id: 6, job_id: 3, name: 'Layla Al-Khatib',  email: 'layla.k@email.com',      phone: '+964 775 666 7788', stage: 'Hired',        status: 'Hired',     applied_at: '2026-01-15', cv_note: 'Excellent strategic marketing background.' },
];

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const EXPENSE_TYPES = ['Travel', 'Equipment', 'Office Supplies', 'Training', 'Marketing', 'Meals', 'Other'];

export const MOCK_EXPENSES = [
  { id: 1, employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', expense_type: 'Travel',    amount: 45_000,  expense_date: '2026-03-10', description: 'Client meeting transportation',      status: 'Approved',  approved_by: 'Sara Al-Otaibi', approved_at: '2026-03-11T09:00:00Z', created_at: '2026-03-10T15:00:00Z' },
  { id: 2, employee_id: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', expense_type: 'Equipment', amount: 120_000, expense_date: '2026-03-05', description: 'USB hub and developer cables',       status: 'Submitted', approved_by: null, approved_at: null,                     created_at: '2026-03-05T12:00:00Z' },
  { id: 3, employee_id: 'HR-EMP-0002', employee_name: 'Sara Al-Otaibi',   expense_type: 'Training',  amount: 150_000, expense_date: '2026-02-28', description: 'HR conference registration fee',     status: 'Approved',  approved_by: 'Alaa Alghanimi', approved_at: '2026-03-01T10:00:00Z', created_at: '2026-02-28T14:00:00Z' },
  { id: 4, employee_id: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari',  expense_type: 'Equipment', amount: 55_000,  expense_date: '2026-03-09', description: 'Software license for dev tools',     status: 'Submitted', approved_by: null, approved_at: null,                     created_at: '2026-03-09T10:00:00Z' },
];

// ─── Notifications ────────────────────────────────────────────────────────────
export const MOCK_NOTIFICATIONS = [
  { id: 1, recipient_id: 'HR-EMP-0001', title: 'Leave Approved',          message: 'Your Annual Leave (Mar 10–12) has been approved.',                             type: 'leave',       read: true,  created_at: '2026-03-09T10:00:00Z' },
  { id: 2, recipient_id: 'HR-EMP-0001', title: 'Appraisal Pending',       message: 'Please complete your Q1 2026 self-assessment by March 15.',                  type: 'appraisal',   read: false, created_at: '2026-03-14T09:00:00Z' },
  { id: 3, recipient_id: 'HR-EMP-0001', title: 'Expense Approved',        message: 'Your Travel expense (45,000 IQD) has been approved.',                        type: 'expense',     read: false, created_at: '2026-03-11T09:00:00Z' },
  { id: 4, recipient_id: 'HR-EMP-0002', title: 'New Leave Request',       message: 'Khalid Al-Zahrani submitted a Sick Leave request for Mar 14.',               type: 'leave',       read: false, created_at: '2026-03-14T08:30:00Z' },
  { id: 5, recipient_id: 'HR-EMP-0002', title: 'Expense Submitted',       message: 'Ahmed Al-Rashidi submitted an Equipment expense for 120,000 IQD.',           type: 'expense',     read: false, created_at: '2026-03-05T12:00:00Z' },
  { id: 6, recipient_id: 'HR-EMP-0002', title: 'Appraisal Review Needed', message: 'Reem Al-Dossari self-assessment is waiting for your review.',                type: 'appraisal',   read: false, created_at: '2026-03-08T10:30:00Z' },
  { id: 7, recipient_id: 'HR-EMP-0003', title: 'Payrolls Awaiting Payment', message: '2 payroll records submitted — awaiting Finance approval.',                  type: 'payroll',     read: false, created_at: '2026-03-31T09:00:00Z' },
  { id: 8, recipient_id: 'HR-EMP-0009', title: 'New Candidate — Offer',   message: 'Maha Al-Rasheed has reached the Offer stage for Senior Software Engineer.',  type: 'recruitment', read: false, created_at: '2026-03-10T11:00:00Z' },
  { id: 9, recipient_id: 'HR-EMP-0010', title: 'Appraisals Due',          message: '1 employee has not started their Q1 2026 appraisal.',                        type: 'appraisal',   read: false, created_at: '2026-03-14T07:00:00Z' },
];

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const MOCK_AUDIT_LOGS = [
  {
    id: 1,
    timestamp:      '2026-03-16T08:02:11Z',
    user_id:        'hussein',
    user_name:      'Hussein Alaa',
    role:           'admin',
    action:         'LOGIN',
    resource:       'system',
    resource_id:    null,
    resource_label: 'System',
    details:        'Successful login from Baghdad HQ',
    ip_address:     '192.168.1.10',
  },
  {
    id: 2,
    timestamp:      '2026-03-16T08:05:44Z',
    user_id:        'hussein',
    user_name:      'Hussein Alaa',
    role:           'admin',
    action:         'VIEW',
    resource:       'employee',
    resource_id:    'HR-EMP-0003',
    resource_label: 'Khalid Al-Zahrani',
    details:        'Viewed employee profile',
    ip_address:     '192.168.1.10',
  },
  {
    id: 3,
    timestamp:      '2026-03-16T08:12:30Z',
    user_id:        'sara',
    user_name:      'Sara Al-Otaibi',
    role:           'hr_manager',
    action:         'APPROVE',
    resource:       'leave_application',
    resource_id:    'LEAVE-0012',
    resource_label: 'Annual Leave — Reem Al-Dossari',
    details:        'Approved annual leave Mar 10–12',
    ip_address:     '192.168.1.22',
  },
  {
    id: 4,
    timestamp:      '2026-03-15T14:30:05Z',
    user_id:        'khalid',
    user_name:      'Khalid Al-Zahrani',
    role:           'finance_manager',
    action:         'EXPORT',
    resource:       'payroll',
    resource_id:    null,
    resource_label: 'Payroll — March 2026',
    details:        'Exported payroll report for March 2026 (7 records)',
    ip_address:     '192.168.1.15',
  },
  {
    id: 5,
    timestamp:      '2026-03-15T11:20:18Z',
    user_id:        'sara',
    user_name:      'Sara Al-Otaibi',
    role:           'hr_manager',
    action:         'CREATE',
    resource:       'recruitment',
    resource_id:    'JOB-003',
    resource_label: 'Marketing Specialist',
    details:        'Created new job posting for Marketing Specialist',
    ip_address:     '192.168.1.22',
  },
  {
    id: 6,
    timestamp:      '2026-03-15T09:55:00Z',
    user_id:        'ahmed',
    user_name:      'Ahmed Al-Rashidi',
    role:           'it_manager',
    action:         'APPROVE',
    resource:       'expense',
    resource_id:    '1',
    resource_label: 'Travel Expense — Ahmed Al-Rashidi',
    details:        'Approved travel expense of 45,000 IQD',
    ip_address:     '192.168.1.31',
  },
  {
    id: 7,
    timestamp:      '2026-03-14T16:44:22Z',
    user_id:        'hussein',
    user_name:      'Hussein Alaa',
    role:           'admin',
    action:         'UPDATE',
    resource:       'employee',
    resource_id:    'HR-EMP-0006',
    resource_label: 'Reem Al-Dossari',
    details:        'Updated employment type: Contract → Full-time',
    ip_address:     '192.168.1.10',
  },
  {
    id: 8,
    timestamp:      '2026-03-14T13:10:09Z',
    user_id:        'sara',
    user_name:      'Sara Al-Otaibi',
    role:           'hr_manager',
    action:         'REJECT',
    resource:       'leave_application',
    resource_id:    'LEAVE-0015',
    resource_label: 'Sick Leave — Khalid Al-Zahrani',
    details:        'Rejected sick leave — documentation insufficient',
    ip_address:     '192.168.1.22',
  },
  {
    id: 9,
    timestamp:      '2026-03-13T10:00:00Z',
    user_id:        'khalid',
    user_name:      'Khalid Al-Zahrani',
    role:           'finance_manager',
    action:         'LOGIN',
    resource:       'system',
    resource_id:    null,
    resource_label: 'System',
    details:        'Successful login',
    ip_address:     '192.168.1.15',
  },
  {
    id: 10,
    timestamp:      '2026-03-13T10:05:30Z',
    user_id:        'khalid',
    user_name:      'Khalid Al-Zahrani',
    role:           'finance_manager',
    action:         'VIEW',
    resource:       'payroll',
    resource_id:    null,
    resource_label: 'Payroll — March 2026',
    details:        'Viewed payroll records (7 employees)',
    ip_address:     '192.168.1.15',
  },
  {
    id: 11,
    timestamp:      '2026-03-12T15:22:47Z',
    user_id:        'hussein',
    user_name:      'Hussein Alaa',
    role:           'admin',
    action:         'DELETE',
    resource:       'recruitment',
    resource_id:    'CAND-007',
    resource_label: 'Candidate: Omar Al-Faruq',
    details:        'Deleted withdrawn candidate application',
    ip_address:     '192.168.1.10',
  },
  {
    id: 12,
    timestamp:      '2026-03-12T11:00:00Z',
    user_id:        'audit',
    user_name:      'Audit Manager',
    role:           'audit_manager',
    action:         'LOGIN',
    resource:       'system',
    resource_id:    null,
    resource_label: 'System',
    details:        'Audit session started',
    ip_address:     '192.168.1.99',
  },
  {
    id: 13,
    timestamp:      '2026-03-12T11:08:15Z',
    user_id:        'audit',
    user_name:      'Audit Manager',
    role:           'audit_manager',
    action:         'VIEW',
    resource:       'payroll',
    resource_id:    null,
    resource_label: 'Payroll — February 2026',
    details:        'Reviewed payroll records for February 2026 compliance check',
    ip_address:     '192.168.1.99',
  },
  {
    id: 14,
    timestamp:      '2026-03-11T09:30:00Z',
    user_id:        'sara',
    user_name:      'Sara Al-Otaibi',
    role:           'hr_manager',
    action:         'UPDATE',
    resource:       'appraisal',
    resource_id:    '2',
    resource_label: 'Q1 2026 Appraisal — Reem Al-Dossari',
    details:        'Submitted manager review for Q1 2026 appraisal',
    ip_address:     '192.168.1.22',
  },
  {
    id: 15,
    timestamp:      '2026-03-10T14:00:00Z',
    user_id:        'ahmed',
    user_name:      'Ahmed Al-Rashidi',
    role:           'it_manager',
    action:         'CREATE',
    resource:       'expense',
    resource_id:    '2',
    resource_label: 'Equipment Expense — Ahmed Al-Rashidi',
    details:        'Submitted equipment expense request for 120,000 IQD',
    ip_address:     '192.168.1.31',
  },
];
