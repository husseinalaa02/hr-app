import { createClient } from '@supabase/supabase-js';
import { validatePassword } from './_validate.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  'capacitor://localhost',   // Capacitor iOS
  'http://localhost',        // Capacitor Android WebView
  'http://localhost:5173',   // Vite dev
  'http://localhost:4173',   // Vite preview
].filter(Boolean));

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.has(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Roles ordered by privilege level — a requester may not reset
// a password for someone at the same or higher privilege.
const ROLE_RANK = {
  admin:           100,
  ceo:              80,
  hr_manager:       60,
  finance_manager:  50,
  it_manager:       50,
  audit_manager:    50,
  employee:         10,
};

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ message: 'Unauthorized' });

  const requesterRole = user.app_metadata?.role;
  if (requesterRole !== 'admin' && requesterRole !== 'hr_manager') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  const { employee_id, new_password } = req.body;
  if (!employee_id || !new_password) {
    return res.status(400).json({ message: 'employee_id and new_password are required' });
  }
  const pwError = validatePassword(new_password);
  if (pwError) return res.status(400).json({ message: pwError });

  try {
    const { data: targetEmp, error: empError } = await supabaseAdmin
      .from('employees')
      .select('auth_id, role')
      .eq('name', employee_id)
      .single();

    if (empError || !targetEmp?.auth_id) {
      return res.status(404).json({ message: 'Employee auth account not found' });
    }

    // Privilege check: requester rank must be strictly greater than target rank
    const requesterRank = ROLE_RANK[requesterRole] ?? 0;
    const targetRank    = ROLE_RANK[targetEmp.role]  ?? 10;
    if (requesterRank <= targetRank) {
      return res.status(403).json({ message: 'Cannot reset password for an account with equal or higher privilege' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetEmp.auth_id, {
      password: new_password,
    });
    if (error) throw error;

    // Audit trail — non-fatal
    await supabaseAdmin.from('audit_logs').insert({
      action: 'PASSWORD_RESET',
      user_id: employee_id,
      resource: 'auth',
      details: `password reset by ${requesterRole} ${user.app_metadata?.employee_id || user.id}`,
    }).catch(() => {});

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[set-password]', err.message);
    return res.status(400).json({ message: err.message });
  }
}
