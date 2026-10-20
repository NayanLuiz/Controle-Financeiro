import { useEffect, useRef } from 'react';

export interface ConfirmModalProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly isDestructive?: boolean;
  readonly isProcessing?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = true,
  isProcessing = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timer = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isProcessing, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onCancel();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isProcessing) {
          onCancel();
        }
      }}
    >
      <div
        className="modal-box confirm-dialog-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}
        >
          <span
            className={`confirm-dialog-icon ${isDestructive ? 'confirm-icon-danger' : 'confirm-icon-primary'}`}
            aria-hidden="true"
          >
            {isDestructive ? '⚠' : 'ℹ'}
          </span>
          <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            {title}
          </h2>
        </div>

        <p
          id="confirm-dialog-desc"
          style={{
            margin: '0 0 1.25rem 0',
            color: 'var(--color-text-secondary)',
            fontSize: '0.925rem',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
