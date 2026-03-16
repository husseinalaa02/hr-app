import { useNavigate } from 'react-router-dom';

const PERMISSION_LABELS = {
  'employees:read':      'View Employees',
  'leave:read':          'View Leave Requests',
  'attendance:read':     'View Attendance',
  'timesheets:read':     'View Timesheets',
  'payslips:read':       'View Payslips',
  'day_requests:read':   'View Day Requests',
  'payroll:read':        'View Payroll',
  'audit:read':          'Access Audit View',
  'appraisals:read':     'View Appraisals',
  'recruitment:read':    'View Recruitment',
  'expenses:read':       'View Expenses',
  'reports:hr':          'View Reports',
};

export default function AccessDenied({ permission }) {
  const navigate = useNavigate();
  const permLabel = permission ? (PERMISSION_LABELS[permission] || permission) : 'this page';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      {/* Lock Icon */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: 'var(--surface-alt, #f3f4f6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.5rem',
        border: '2px solid var(--border, #e5e7eb)',
      }}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted, #9ca3af)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>

      <h2 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color: 'var(--text, #111827)',
        margin: '0 0 0.75rem',
      }}>
        Access Restricted
      </h2>

      <p style={{
        fontSize: '0.95rem',
        color: 'var(--text-muted, #6b7280)',
        maxWidth: 380,
        lineHeight: 1.6,
        margin: '0 0 0.5rem',
      }}>
        You don't have permission to access this page.
      </p>

      {permission && (
        <p style={{
          fontSize: '0.85rem',
          color: 'var(--text-muted, #9ca3af)',
          margin: '0 0 2rem',
        }}>
          Required permission: <code style={{
            background: 'var(--surface-alt, #f3f4f6)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: '0.82rem',
            fontFamily: 'monospace',
            color: 'var(--primary, #4f46e5)',
          }}>{permLabel}</code>
        </p>
      )}

      {!permission && <div style={{ marginBottom: '2rem' }} />}

      <button
        onClick={() => navigate('/')}
        style={{
          background: 'var(--primary, #4f46e5)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '0.625rem 1.5rem',
          fontSize: '0.9rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
        Back to Dashboard
      </button>
    </div>
  );
}
