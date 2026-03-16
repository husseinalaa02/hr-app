import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

export default function Topbar({ title, onMenuClick }) {
  const { employee } = useAuth();

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
            <NotificationBell />
            <span className="topbar-user">{employee.employee_name}</span>
          </>
        )}
      </div>
    </header>
  );
}
