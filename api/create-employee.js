import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  'capacitor://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
].filter(Boolean));

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  // Verify the requester is an authenticated admin or HR manager
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ message: 'Unauthorized' });

  const requesterRole = user.app_metadata?.role;
  if (requesterRole !== 'admin' && requesterRole !== 'hr_manager') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  const { employee_data, password } = req.body;
  if (!employee_data?.user_id || !password) {
    return res.status(400).json({ message: 'user_id and password are required' });
  }

  // Sanitise user_id — must be alphanumeric + underscores/dots only
  const userId = employee_data.user_id.toLowerCase().trim();
  if (!/^[a-z0-9_.-]+$/.test(userId) || userId.length > 50) {
    return res.status(400).json({ message: 'Invalid user_id: use only letters, numbers, underscores, dots' });
  }

  try {
    // ── Generate collision-free employee ID via DB sequence ────────────────────
    // next_employee_id() is defined in supabase-schema.sql
    const { data: nextId, error: seqErr } = await supabaseAdmin.rpc('next_employee_id');
    if (seqErr) throw seqErr;
    const id = nextId; // e.g. "HR-EMP-0011"

    // ── Create Supabase Auth user ──────────────────────────────────────────────
    const email = `${userId}@afaqhr.internal`;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    // ── Create employee record (no password stored) ────────────────────────────
    const record = {
      name:            id,
      auth_id:         authData.user.id,
      employee_name:   employee_data.employee_name   || '',
      department:      employee_data.department      || '',
      designation:     employee_data.designation     || '',
      cell_number:     employee_data.cell_number     || '',
      image:           '',
      user_id:         userId,
      password:        '',  // never stored
      company:         employee_data.company         || process.env.DEFAULT_COMPANY || 'Afaq Al-Fiker',
      date_of_joining: employee_data.date_of_joining || null,
      gender:          employee_data.gender          || '',
      date_of_birth:   employee_data.date_of_birth   || null,
      employment_type: employee_data.employment_type || 'Full-time',
      branch:          employee_data.branch          || '',
      personal_email:  employee_data.personal_email  || '',
      company_email:   employee_data.company_email   || '',
      reports_to:      employee_data.reports_to      || null,
      role:            employee_data.role            || 'employee',
    };

    const { data: emp, error: empError } = await supabaseAdmin
      .from('employees').insert(record).select().single();

    if (empError) {
      // Roll back auth user if employee insert failed
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw empError;
    }

    // ── Stamp role + employee_id into JWT metadata ─────────────────────────────
    await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { role: emp.role || 'employee', employee_id: emp.name },
    });

    return res.status(200).json(emp);
  } catch (err) {
    console.error('[create-employee]', err.message);
    return res.status(400).json({ message: err.message });
  }
}
