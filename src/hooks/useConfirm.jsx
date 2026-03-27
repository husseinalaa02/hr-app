import { useState, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal';

export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback(({ message, confirmLabel, cancelLabel, danger = false } = {}) => {
    return new Promise((resolve) => {
      setState({
        message,
        confirmLabel,
        cancelLabel,
        danger,
        onConfirm: () => { setState(null); resolve(true); },
        onCancel:  () => { setState(null); resolve(false); },
      });
    });
  }, []);

  const ConfirmModalComponent = state ? (
    <ConfirmModal
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={state.onConfirm}
      onCancel={state.onCancel}
    />
  ) : null;

  return { confirm, ConfirmModalComponent };
}
