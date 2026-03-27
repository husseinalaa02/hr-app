import { useTranslation } from 'react-i18next';
import Modal from './Modal';

export default function ConfirmModal({ message, onConfirm, onCancel, confirmLabel, cancelLabel, danger = false }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('common.confirm')} onClose={onCancel}>
      <div className="form-stack">
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 20px' }}>{message}</p>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel || t('common.cancel')}
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel || t('common.yes')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
