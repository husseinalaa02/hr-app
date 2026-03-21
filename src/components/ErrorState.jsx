import { useTranslation } from 'react-i18next';

export default function ErrorState({ message = '', onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="error-state">
      <div className="error-icon">⚠</div>
      <p>{message || t('errors.somethingWentWrong')}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
