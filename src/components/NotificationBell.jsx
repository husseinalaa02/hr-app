import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getNotifications, markAsRead, markAllAsRead } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const TYPE_ROUTES = {
  leave:       '/leave',
  payroll:     '/payroll',
  appraisal:   '/appraisals',
  expense:     '/expenses',
  recruitment: '/recruitment',
};

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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'ar' ? 'ar-IQ' : 'en-GB';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const panelRef = useRef(null);

  const unread = notifications.filter(n => !n.read).length;

  const load = async () => {
    if (!employee?.name) return;
    try {
      const data = await getNotifications(employee.name);
      setNotifications(data);
    } catch { /* silent — bell is non-critical */ }
  };

  useEffect(() => {
    if (!employee?.name) return;

    load();

    if (SUPABASE_MODE) {
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
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const handleRead = async (n) => {
    if (!n.read) {
      try {
        await markAsRead(n.id);
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      } catch { /* silent */ }
    }
    setOpen(false);
    const route = n.link || TYPE_ROUTES[n.type];
    if (route) navigate(route);
  };

  const handleMarkAll = async () => {
    try {
      await markAllAsRead(employee.name);
      setNotifications(prev => prev.map(x => ({ ...x, read: true })));
    } catch { /* silent */ }
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button className="notif-bell-btn" onClick={() => { setOpen(o => !o); load(); }} aria-label={t('notifications.title')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>{t('notifications.title')}</span>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={handleMarkAll}>{t('notifications.markAllRead')}</button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">{t('notifications.empty')}</div>
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
                  {(Date.now() - new Date(n.created_at).getTime()) > 30 * 24 * 60 * 60 * 1000 && (
                    <div className="notif-msg" style={{ fontSize: 11, color: 'var(--gray-400)', fontStyle: 'italic' }}>
                      {t('notifications.mayNoLongerExist')}
                    </div>
                  )}
                  <div className="notif-time">{new Date(n.created_at).toLocaleDateString(dateLocale, { timeZone: 'Asia/Baghdad', day: 'numeric', month: 'short', year: 'numeric' })}</div>
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
