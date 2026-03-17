import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

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

  try {
    const { data: emp, error: empError } = await supabaseAdmin
      .from('employees').select('auth_id').eq('name', employee_id).single();
    if (empError || !emp?.auth_id) {
      return res.status(404).json({ message: 'Employee auth account not found' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.auth_id, {
      password: new_password,
    });
    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}
