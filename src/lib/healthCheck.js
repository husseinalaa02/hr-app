import { supabase, SUPABASE_MODE } from '../db/supabase';

const SLOW_THRESHOLD_MS = 2000;

/**
 * Pings the Supabase database and returns a health status object.
 * @returns {Promise<{ status: 'ok'|'slow'|'down', latencyMs: number }>}
 */
export async function checkHealth() {
  if (!SUPABASE_MODE) {
    return { status: 'ok', latencyMs: 0 };
  }
  const start = Date.now();
  try {
    const { error } = await supabase.from('employees').select('name').limit(1);
    const latencyMs = Date.now() - start;
    if (error) return { status: 'down', latencyMs };
    if (latencyMs > SLOW_THRESHOLD_MS) return { status: 'slow', latencyMs };
    return { status: 'ok', latencyMs };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}
