/**
 * Admin-only endpoint: syncs an employee's role into their Supabase Auth
 * app_metadata so that JWT-based RLS policies enforce the new role immediately.
 *
 * Must be called whenever an employee's role is changed via the Admin panel.
 * The service role key cannot be used from the browser, so this lives server-side.
 */
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

  // Admin-only
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ message: 'Unauthorized' });

  if (user.app_metadata?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }

  const { employee_id, new_role } = req.body;
  if (!employee_id || !new_role) {
    return res.status(400).json({ message: 'employee_id and new_role are required' });
  }

  try {
    // Fetch the employee's Supabase Auth UUID
    const { data: emp, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('auth_id, name')
      .eq('name', employee_id)
      .single();

    if (empErr || !emp) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (!emp.auth_id) {
      // Employee hasn't migrated to Supabase Auth yet — role will be set at migration time
      return res.status(200).json({ updated: false, reason: 'no_auth_account' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.auth_id, {
      app_metadata: { role: new_role, employee_id: emp.name },
    });
    if (error) throw error;

    return res.status(200).json({ updated: true });
  } catch (err) {
    console.error('[set-role]', err.message);
    return res.status(400).json({ message: err.message });
  }
}
