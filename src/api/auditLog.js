import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

// IP address capture must happen server-side (x-forwarded-for header).
// In demo/local mode we store a placeholder so the field is never null.
const DEMO_IP = '127.0.0.1';

/**
 * Log an action to the audit_logs table.
 *
 * @param {object} params
 * @param {string} params.userId          - user login identifier
 * @param {string} params.userName        - display name
 * @param {string} params.role            - user role
 * @param {string} params.action          - LOGIN | VIEW | CREATE | UPDATE | APPROVE | REJECT | EXPORT | DELETE
 * @param {string} params.resource        - resource type (employee, leave_application, payroll, expense, …)
 * @param {string|null} [params.resourceId]      - ID of the affected record
 * @param {string|null} [params.resourceLabel]   - human-readable label for the record
 * @param {string|null} [params.details]         - free-form description
 * @param {object|null} [params.changes]         - before/after snapshot (optional)
 */
export async function logAction({
  userId,
  userName,
  role,
  action,
  resource,
  resourceId   = null,
  resourceLabel = null,
  details      = null,
  changes      = null,
}) {
  const entry = {
    timestamp:      new Date().toISOString(),
    user_id:        userId,
    user_name:      userName,
    role,
    action,
    resource,
    resource_id:    resourceId,
    resource_label: resourceLabel,
    details:        details || (changes ? JSON.stringify(changes) : null),
    // ip_address is intentionally omitted from the Supabase insert — it must be
    // captured server-side from req.headers['x-forwarded-for']. TODO: route
    // audit writes through a Vercel API function so real IPs can be stored.
    ip_address:     DEMO_IP,
  };
  if (SUPABASE_MODE) {
    await supabase.from('audit_logs').insert({
      user_id: userId, role, resource, action, resource_id: resourceId,
      resource_label: resourceLabel, details, changes: changes || null,
      // ip_address not sent — server-side capture required
    });
    return;
  }
  await db.audit_logs.add(entry);
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
  userId,
  fromDate,
  toDate,
  limit = 100,
} = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('audit_logs').select('*');
    if (resource) query = query.eq('resource', resource);
    if (action)   query = query.eq('action', action);
    if (userId)   query = query.eq('user_id', userId);
    if (fromDate) query = query.gte('timestamp', fromDate);
    if (toDate)   query = query.lte('timestamp', toDate);
    const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit || 200);
    if (error) return [];
    return data || [];
  }
  let collection = db.audit_logs.orderBy('timestamp').reverse();

  const results = await collection.toArray();

  const filtered = results.filter((log) => {
    if (resource  && log.resource  !== resource)  return false;
    if (action    && log.action    !== action)    return false;
    if (userId    && log.user_id   !== userId)    return false;
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
