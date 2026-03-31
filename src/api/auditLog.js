import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

// In demo/local mode we store a placeholder IP so the field is never null.
const DEMO_IP = '127.0.0.1';

// Edge Function URL for server-side audit logging with real IP capture.
// IP address is extracted from x-forwarded-for / x-real-ip headers server-side.
const AUDIT_EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-audit`;

/**
 * Log an action to the audit_logs table.
 *
 * In SUPABASE_MODE, the write is routed through a Supabase Edge Function that
 * captures the real client IP from x-forwarded-for — the direct Supabase insert
 * would always record 127.0.0.1 because IP cannot be read client-side.
 *
 * userId / userName / role are optional.  For ERROR-action logs from the
 * ErrorBoundary (a class component with no auth context), these are omitted and
 * the audit_error_insert RLS policy allows the insert regardless.
 *
 * @param {object} params
 * @param {string} [params.userId]        - user login identifier (optional)
 * @param {string} [params.userName]      - display name (optional)
 * @param {string} [params.role]          - user role (optional)
 * @param {string} params.action          - LOGIN | VIEW | CREATE | UPDATE | APPROVE | REJECT | EXPORT | DELETE | ERROR
 * @param {string} params.resource        - resource type (employee, leave_application, payroll, expense, …)
 * @param {string|null} [params.resourceId]      - ID of the affected record
 * @param {string|null} [params.resourceLabel]   - human-readable label for the record
 * @param {string|null} [params.details]         - free-form description
 * @param {object|null} [params.changes]         - before/after snapshot (optional)
 */
export async function logAction({
  userId        = null,
  userName      = null,
  role          = null,
  action,
  resource,
  resourceId    = null,
  resourceLabel = null,
  details       = null,
  changes       = null,
}) {
  const resolvedDetails = details || (changes ? JSON.stringify(changes) : null);

  if (SUPABASE_MODE) {
    // Get the authenticated session token — required by both the Edge Function
    // and the audit_insert RLS policy (which reads auth.uid() from the JWT).
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return; // not authenticated — skip silently

    // Route through Edge Function so the real client IP can be captured
    // server-side from x-forwarded-for / x-real-ip headers.
    await fetch(AUDIT_EDGE_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id:        userId,
        user_name:      userName,
        role,
        action,
        resource,
        resource_id:    resourceId,
        resource_label: resourceLabel,
        details:        resolvedDetails,
        changes:        changes || null,
      }),
    }).catch(e => {
      if (import.meta.env.DEV) console.error('[auditLog] Edge Function call failed:', e);
    });
    return;
  }

  // Demo / offline mode — write to IndexedDB with placeholder IP
  await db.audit_logs.add({
    timestamp:      new Date().toISOString(),
    user_id:        userId,
    user_name:      userName,
    role,
    action,
    resource,
    resource_id:    resourceId,
    resource_label: resourceLabel,
    details:        resolvedDetails,
    ip_address:     DEMO_IP,
  });
}

/**
 * Query audit logs with optional filters, sorted by timestamp desc.
 *
 * @param {object} filters
 * @param {string} [filters.resource]  - filter by resource type
 * @param {string} [filters.action]    - filter by action
 * @param {string} [filters.userId]    - filter by user_id
 * @param {string} [filters.fromDate]  - ISO date string (inclusive)
 * @param {string} [filters.toDate]    - ISO date string (inclusive)
 * @param {number} [filters.limit=100] - max records to return
 * @returns {Promise<Array>}
 */
export async function getAuditLogs({
  resource,
  action,
  userName,
  fromDate,
  toDate,
  limit = 1000,
} = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('audit_logs').select('*');
    if (resource) query = query.eq('resource', resource);
    if (action)   query = query.eq('action', action);
    if (userName) {
      // Escape ILIKE metacharacters to prevent wildcard injection.
      // A bare '%' would match ALL rows; '_' would match any single character.
      const safeUserName = userName.trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      if (safeUserName.length >= 2) {
        query = query.ilike('user_name', `%${safeUserName}%`);
      }
    }
    if (fromDate) query = query.gte('timestamp', fromDate);
    if (toDate)   query = query.lte('timestamp', toDate);
    const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit || 1000);
    if (error) return [];
    return data || [];
  }
  let collection = db.audit_logs.orderBy('timestamp').reverse();

  const results = await collection.toArray();

  const filtered = results.filter((log) => {
    if (resource  && log.resource  !== resource)  return false;
    if (action    && log.action    !== action)    return false;
    if (userName  && !(log.user_name || '').toLowerCase().includes(userName.toLowerCase())) return false;
    if (fromDate  && log.timestamp < fromDate)    return false;
    if (toDate) {
      // Make toDate inclusive by comparing up to end of day
      const endOfDay = toDate.length === 10 ? toDate + 'T23:59:59Z' : toDate;
      if (log.timestamp > endOfDay) return false;
    }
    return true;
  });

  return filtered.slice(0, limit);
}
