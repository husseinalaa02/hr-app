import { useTranslation } from 'react-i18next';

const TYPE_MAP = {
  Open: 'badge-warning',
  Pending: 'badge-warning',
  'Pending Manager': 'badge-warning',
  'Pending HR': 'badge-warning',
  Approved: 'badge-success',
  Rejected: 'badge-danger',
  Present: 'badge-success',
  Late: 'badge-warning',
  Absent: 'badge-danger',
  'Early Leave': 'badge-warning',
  Overtime: 'badge-info',
  Off: 'badge-secondary',
  'Missed Punch': 'badge-danger',
  'Half Day': 'badge-warning',
  'Work From Home': 'badge-info',
  'On Leave': 'badge-warning',
  Submitted: 'badge-success',
  Draft: 'badge-secondary',
  Cancelled: 'badge-danger',
  Paid: 'badge-success',
  Hired: 'badge-success',
  'Not Started': 'badge-secondary',
  'In Progress': 'badge-warning',
  Completed: 'badge-success',
  'Self-Assessment Submitted': 'badge-info',
  'Manager Review': 'badge-warning',
};

export default function Badge({ status }) {
  const { t } = useTranslation();
  const cls = TYPE_MAP[status] || 'badge-secondary';
  const label = t(`status.${status}`, { defaultValue: status });
  return <span className={`badge ${cls}`}>{label}</span>;
}
