import { supabase, SUPABASE_MODE } from '../db/supabase';
import { db } from '../db/index';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getNotifications(recipientId) {
  if (SUPABASE_MODE) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data || [];
  }
  if (DEMO) {
    const rows = await db.notifications
      .filter(n => n.recipient_id === recipientId)
      .toArray();
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return [];
}

export async function getUnreadCount(recipientId) {
  if (SUPABASE_MODE) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('read', false);
    return count || 0;
  }
  if (DEMO) {
    return await db.notifications.filter(n => n.recipient_id === recipientId && !n.read).count();
  }
  return 0;
}

export async function markAsRead(id) {
  if (SUPABASE_MODE) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    return;
  }
  if (DEMO) {
    const rec = await db.notifications.get(Number(id));
    if (rec) await db.notifications.put({ ...rec, read: true });
  }
}

export async function markAllAsRead(recipientId) {
  if (SUPABASE_MODE) {
    await supabase.from('notifications').update({ read: true })
      .eq('recipient_id', recipientId).eq('read', false);
    return;
  }
  if (DEMO) {
    const rows = await db.notifications.filter(n => n.recipient_id === recipientId && !n.read).toArray();
    await Promise.all(rows.map(n => db.notifications.put({ ...n, read: true })));
  }
}

export async function addNotification({ recipient_id, title, message, type = 'info' }) {
  if (SUPABASE_MODE) {
    const { data } = await supabase
      .from('notifications')
      .insert({ recipient_id, title, message, type })
      .select()
      .single();
    return data;
  }
  if (DEMO) {
    const record = { recipient_id, title, message, type, read: false, created_at: new Date().toISOString() };
    const id = await db.notifications.add(record);
    return { ...record, id };
  }
}

// Fan-out: create one notification per employee that has the given role(s),
// including custom-role employees whose custom_role.notify_as matches a target role.
// Uses a security-definer Postgres function so the employee lookup bypasses RLS
// (regular employees can't query the employees table by role via the anon key).
export async function notifyRole(roles, { title, message, type = 'info' }) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  if (SUPABASE_MODE) {
    await supabase.rpc('notify_roles', {
      p_roles:   roleList,
      p_title:   title,
      p_message: message,
      p_type:    type,
    }).catch(() => {});
  }
}
