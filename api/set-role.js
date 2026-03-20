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

  // Validate new_role against known built-in roles or custom roles in the DB
  const BUILT_IN_ROLES = ['admin', 'ceo', 'hr_manager', 'finance_manager',
                          'it_manager', 'audit_manager', 'employee'];
  if (!BUILT_IN_ROLES.includes(new_role)) {
    const { count } = await supabaseAdmin.from('custom_roles')
      .select('*', { count: 'exact', head: true }).eq('name', new_role);
    if (!count) {
      return res.status(400).json({ message: `Invalid role: "${new_role}"` });
    }
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

    // Keep employees table in sync with JWT so frontend RBAC matches server enforcement
    await supabaseAdmin.from('employees').update({ role: new_role }).eq('name', employee_id);

    // Audit trail — non-fatal
    await supabaseAdmin.from('audit_logs').insert({
      action: 'ROLE_CHANGE',
      user_id: employee_id,
      resource: 'employees',
      details: `role changed to ${new_role} by ${user.app_metadata?.employee_id || user.id}`,
    }).catch(() => {});

    return res.status(200).json({ updated: true });
  } catch (err) {
    console.error('[set-role]', err.message);
    return res.status(400).json({ message: err.message });
  }
}
