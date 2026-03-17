/**
 * Transparent migration: when an existing employee logs in for the first time
 * after the Supabase Auth migration, this endpoint creates their auth account
 * and links it, using their existing (plain-text) credentials to verify identity.
 */
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

  const { user_id, password } = req.body;
  if (!user_id || !password) {
    return res.status(400).json({ message: 'user_id and password are required' });
  }

  try {
    // Verify old credentials
    const { data: emp, error: empError } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('user_id', user_id.toLowerCase().trim())
      .single();

    if (empError || !emp) return res.status(401).json({ message: 'Invalid credentials' });
    if (!emp.password || emp.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Already migrated
    if (emp.auth_id) return res.status(200).json({ migrated: false, already_done: true });

    // Create Supabase Auth user
    const email = `${user_id}@afaqhr.internal`;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    // Link auth_id and clear plain-text password
    await supabaseAdmin
      .from('employees')
      .update({ auth_id: authData.user.id, password: '' })
      .eq('name', emp.name);

    // Set role in auth metadata
    await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { role: emp.role || 'employee', employee_id: emp.name },
    });

    return res.status(200).json({ migrated: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}
