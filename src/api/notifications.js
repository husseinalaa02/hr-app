import { db } from '../db/index';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getNotifications(recipientId) {
  if (DEMO) {
    const rows = await db.notifications
      .filter(n => n.recipient_id === recipientId)
      .toArray();
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return [];
}

export async function getUnreadCount(recipientId) {
  if (DEMO) {
    return db.notifications.filter(n => n.recipient_id === recipientId && !n.read).count();
  }
  return 0;
}

export async function markAsRead(id) {
  if (DEMO) {
    const rec = await db.notifications.get(Number(id));
    if (rec) await db.notifications.put({ ...rec, read: true });
  }
}

export async function markAllAsRead(recipientId) {
  if (DEMO) {
    const rows = await db.notifications.filter(n => n.recipient_id === recipientId && !n.read).toArray();
    await Promise.all(rows.map(n => db.notifications.put({ ...n, read: true })));
  }
}

export async function addNotification({ recipient_id, title, message, type = 'info' }) {
  if (DEMO) {
    const record = { recipient_id, title, message, type, read: false, created_at: new Date().toISOString() };
    const id = await db.notifications.add(record);
    return { ...record, id };
  }
}
