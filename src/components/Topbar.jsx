import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import { useTranslation } from 'react-i18next';
import { applyDirection } from '../i18n';

export default function Topbar({ title, onMenuClick }) {
  const { employee } = useAuth();
  const { i18n } = useTranslation();

  const isAr = i18n.language === 'ar';

  const toggleLang = () => {
    const next = isAr ? 'en' : 'ar';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
    applyDirection(next);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-btn" onClick={onMenuClick} aria-label="Open menu">
          <span />
          <span />
          <span />
        </button>
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-right">
        {employee && (
          <>
            <button
              className="lang-toggle-btn"
              onClick={toggleLang}
              title={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              {isAr ? 'English' : 'العربية'}
            </button>
            <NotificationBell />
            <span className="topbar-user">{employee.employee_name}</span>
          </>
        )}
        {!employee && (
          <button
            className="lang-toggle-btn"
            onClick={toggleLang}
            title={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            {isAr ? 'English' : 'العربية'}
          </button>
        )}
      </div>
    </header>
  );
}
