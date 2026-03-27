import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

let modalCounter = 0;

export default function Modal({ title, onClose, children, size = 'md' }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const prevFocusRef = useRef(null);
  const [titleId] = useState(() => `modal-title-${++modalCounter}`);

  // Escape key + focus restoration
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocusRef.current?.focus();
    };
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const focusable = () => Array.from(el.querySelectorAll(FOCUSABLE));
    const first = focusable()[0];
    if (first) first.focus();
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { e.preventDefault(); return; }
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === items[0]) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); items[0].focus(); }
      }
    };
    el.addEventListener('keydown', trap);
    return () => el.removeEventListener('keydown', trap);
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={titleId} className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
