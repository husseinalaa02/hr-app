import { useState, useCallback, useRef, useMemo } from 'react';
import ConfirmModal from '../components/ConfirmModal';

export function useConfirm() {
  const [state, setState] = useState(null);
  const stateRef = useRef(null);

  const confirm = useCallback(({ message, confirmLabel, cancelLabel, danger = false } = {}) => {
    // H6: guard against concurrent calls — second call resolves false immediately
    if (stateRef.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      const newState = {
        message,
        confirmLabel,
        cancelLabel,
        danger,
        onConfirm: () => { stateRef.current = null; setState(null); resolve(true); },
        onCancel:  () => { stateRef.current = null; setState(null); resolve(false); },
      };
      stateRef.current = newState;
      setState(newState);
    });
  }, []);

  // L8: memoize to prevent unnecessary re-renders in parent components
  const ConfirmModalComponent = useMemo(() => state ? (
    <ConfirmModal
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={state.onConfirm}
      onCancel={state.onCancel}
    />
  ) : null, [state]);

  return { confirm, ConfirmModalComponent };
}
