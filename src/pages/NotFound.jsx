import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-code">404</div>
        <h1 className="not-found-title">{t('notFound.title')}</h1>
        <p className="not-found-message">{t('notFound.message')}</p>
        <div className="not-found-actions">
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            {t('notFound.goToDashboard')}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            {t('nav.back')}
          </button>
        </div>
      </div>
    </div>
  );
}
