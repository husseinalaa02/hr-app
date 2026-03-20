const TYPE_MAP = {
  Open: 'badge-warning',
  Pending: 'badge-warning',
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
};

export default function Badge({ status }) {
  const cls = TYPE_MAP[status] || 'badge-secondary';
  return <span className={`badge ${cls}`}>{status}</span>;
}
