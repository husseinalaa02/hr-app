/**
 * Transparent migration: when an existing employee logs in for the first time
 * after the Supabase Auth migration, this endpoint creates their auth account
 * and links it, using their existing (plain-text) credentials to verify identity.
 */
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_TRIES = 10;
const WINDOW_MS = 15 * 60 * 1000;

// ── Persistent rate limiter using audit_logs (survives Vercel cold starts) ────
async function checkRateLimit(ip) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'MIGRATE_AUTH_ATTEMPT')
    .eq('user_id', ip)
    .gte('timestamp', since);
  if ((count || 0) >= MAX_TRIES) return false;
  // Log this attempt
  await supabaseAdmin.from('audit_logs').insert({
    action: 'MIGRATE_AUTH_ATTEMPT', user_id: ip, resource: 'auth',
    details: { endpoint: 'migrate-auth' },
  }).catch(() => {});
  return true;
}

// ── CORS — only allow known origins ──────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  'capacitor://localhost',   // Capacitor iOS / Android
  'http://localhost:5173',   // Vite dev
  'http://localhost:4173',   // Vite preview
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

  // Rate limit by client IP (persistent across Vercel cold starts via audit_logs)
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  if (!(await checkRateLimit(ip))) {
    return res.status(429).json({ message: 'Too many attempts. Try again in 15 minutes.' });
  }

  const { user_id, password } = req.body;
  if (!user_id || !password) {
    return res.status(400).json({ message: 'user_id and password are required' });
  }

  // Sanitise: strip any accidental email domain, enforce length
  const userId = user_id.toLowerCase().trim().split('@')[0];
  if (!userId || userId.length > 50 || !/^[a-z0-9_.-]+$/.test(userId)) {
    return res.status(400).json({ message: 'Invalid user_id' });
  }

  try {
    const { data: emp, error: empError } = await supabaseAdmin
      .from('employees')
      .select('name, password, auth_id, role')
      .eq('user_id', userId)
      .single();

    if (empError || !emp) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Constant-time comparison to prevent timing attacks
    if (!emp.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    let passwordMatch = false;
    try {
      passwordMatch = timingSafeEqual(
        Buffer.from(emp.password, 'utf8'),
        Buffer.from(password,     'utf8')
      );
    } catch {
      // Buffers of different lengths — not equal
    }
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Already migrated
    if (emp.auth_id) return res.status(200).json({ migrated: false, already_done: true });

    // Create Supabase Auth user
    const email = `${userId}@afaqhr.internal`;
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

    // Stamp role + employee_id into JWT metadata
    await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { role: emp.role || 'employee', employee_id: emp.name },
    });

    return res.status(200).json({ migrated: true });
  } catch (err) {
    console.error('[migrate-auth]', err.message);
    return res.status(400).json({ message: 'Migration failed' });
  }
}
