import { useState, useEffect, useRef } from 'react';
import { getNotifications, markAsRead, markAllAsRead } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const TYPE_ICONS = {
  leave: '📅',
  payroll: '💰',
  appraisal: '⭐',
  expense: '🧾',
  recruitment: '👥',
  info: 'ℹ️',
};

export default function NotificationBell() {
  const { employee } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const panelRef = useRef(null);

  const unread = notifications.filter(n => !n.read).length;

  const load = async () => {
    if (!employee?.name) return;
    const data = await getNotifications(employee.name);
    setNotifications(data);
  };

  useEffect(() => {
    if (!employee?.name) return;

    load();

    if (SUPABASE_MODE) {
      // Realtime: update badge instantly when a new notification arrives
      // — no polling needed
      const channel = supabase
        .channel(`notif-${employee.name}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `recipient_id=eq.${employee.name}` },
          (payload) => {
            setNotifications(prev => [payload.new, ...prev]);
          }
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    }

    // Fallback polling for demo mode (no realtime)
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [employee?.name]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRead = async (n) => {
    if (n.read) return;
    await markAsRead(n.id);
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
  };

  const handleMarkAll = async () => {
    await markAllAsRead(employee.name);
    setNotifications(prev => prev.map(x => ({ ...x, read: true })));
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button className="notif-bell-btn" onClick={() => { setOpen(o => !o); load(); }} aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={handleMarkAll}>Mark all read</button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications</div>
            ) : notifications.map(n => (
              <div
                key={n.id}
                className={`notif-item${n.read ? '' : ' notif-unread'}`}
                onClick={() => handleRead(n)}
              >
                <span className="notif-type-icon">{TYPE_ICONS[n.type] || 'ℹ️'}</span>
                <div className="notif-content">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-msg">{n.message}</div>
                  <div className="notif-time">{new Date(n.created_at).toLocaleDateString()}</div>
                </div>
                {!n.read && <span className="notif-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
