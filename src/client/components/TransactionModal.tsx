import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CategoryDto,
  type EntryType,
  type TransactionDto,
  type TransactionStatus,
  upsertTransactionSchema,
} from '../../shared/contracts/index.js';

import {
  addYearsCivilDate,
  formatCivilDatePtBr,
  getTodayCivilDate,
} from '../../shared/domain/civil-date.js';
import { formatCentsToBrl, parseDigitsToCents } from '../../shared/domain/money.js';
import { ApiRequestError, apiClient } from '../api/client.js';

export interface TransactionModalProps {
  readonly isOpen: boolean;
  readonly categories: readonly CategoryDto[];
  readonly editingTransaction?: TransactionDto | null;
  readonly onClose: () => void;
  readonly onSaved: (transaction: TransactionDto) => void;
}

function getYesterdayCivilDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getTodayCivilDate(yesterday);
}

export function TransactionModal({
  isOpen,
  categories,
  editingTransaction = null,
  onClose,
  onSaved,
}: TransactionModalProps) {
  const [type, setType] = useState<EntryType>('EXPENSE');
  const [status, setStatus] = useState<TransactionStatus>('PAID');
  const [amountCents, setAmountCents] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [date, setDate] = useState<string>(() => getTodayCivilDate());
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const availableCategories = useMemo(() => {
    const list = categories.filter(
      (cat) =>
        cat.type === type &&
        (!cat.isArchived ||
          (editingTransaction !== null && editingTransaction.categoryId === cat.id)),
    );

    if (
      editingTransaction &&
      editingTransaction.type === type &&
      !list.some((cat) => cat.id === editingTransaction.categoryId)
    ) {
      return [
        ...list,
        {
          id: editingTransaction.categoryId,
          name: editingTransaction.categoryName,
          type: editingTransaction.type,
          color: editingTransaction.categoryColor,
          isArchived: editingTransaction.categoryIsArchived,
          hasLinkedRecords: true,
        },
      ];
    }

    return list;
  }, [categories, type, editingTransaction]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFieldErrors({});
    setSubmitError(null);

    if (editingTransaction) {
      setType(editingTransaction.type);
      setStatus(editingTransaction.status ?? 'PAID');
      setAmountCents(editingTransaction.amountCents);
      setCategoryId(editingTransaction.categoryId);
      setDescription(editingTransaction.description);
      setDate(editingTransaction.date);
      setIsRecurring(Boolean(editingTransaction.isRecurring));
      setRecurrenceEndDate('');
    } else {
      const defaultType: EntryType = 'EXPENSE';
      const firstActive = categories.find((c) => c.type === defaultType && !c.isArchived);
      const today = getTodayCivilDate();
      setType(defaultType);
      setStatus('PAID');
      setAmountCents(0);
      setCategoryId(firstActive?.id ?? '');
      setDescription('');
      setDate(today);
      setIsRecurring(false);
      setRecurrenceEndDate(addYearsCivilDate(today, 1));
    }

    amountInputRef.current?.focus();
  }, [isOpen, editingTransaction, categories]);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (isRecurring) {
      setRecurrenceEndDate(addYearsCivilDate(newDate, 1));
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleTypeChange = (nextType: EntryType) => {
    setType(nextType);
    const matching = categories.filter(
      (cat) =>
        cat.type === nextType &&
        (!cat.isArchived ||
          (editingTransaction !== null && editingTransaction.categoryId === cat.id)),
    );
    const firstOption = matching[0];
    setCategoryId(firstOption ? firstOption.id : '');
  };

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setSubmitError(null);

    const validation = upsertTransactionSchema.safeParse({
      type,
      status,
      amountCents,
      date,
      description,
      categoryId,
      isRecurring: !editingTransaction && isRecurring ? true : undefined,
      recurrenceEndDate:
        !editingTransaction && isRecurring
          ? recurrenceEndDate || addYearsCivilDate(date, 1)
          : undefined,
    });

    if (!validation.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    try {
      const saved = editingTransaction
        ? await apiClient.updateTransaction(editingTransaction.id, validation.data)
        : await apiClient.createTransaction(validation.data);
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Erro inesperado ao salvar a transação.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const formattedAmount = amountCents > 0 ? formatCentsToBrl(amountCents) : '';

  return (
    <div className="modal-backdrop">
      <dialog
        ref={dialogRef}
        open
        className="modal-panel"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 id="tx-modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>
            {editingTransaction ? 'Editar Transação' : 'Nova Transação'}
          </h2>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: '36px', padding: '0.25rem 0.65rem' }}
            onClick={onClose}
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {submitError && (
          <div className="alert-banner" role="alert" style={{ marginBottom: '1rem' }}>
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: '1rem' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="field-label" style={{ marginBottom: '0.25rem' }}>
              Tipo de lançamento
            </legend>
            <div className="segmented-control">
              <button
                type="button"
                className="segmented-btn"
                aria-pressed={type === 'EXPENSE'}
                onClick={() => handleTypeChange('EXPENSE')}
              >
                Despesa
              </button>
              <button
                type="button"
                className="segmented-btn"
                aria-pressed={type === 'INCOME'}
                onClick={() => handleTypeChange('INCOME')}
              >
                Receita
              </button>
            </div>
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="field-label" style={{ marginBottom: '0.25rem' }}>
              Status de pagamento
            </legend>
            <div className="segmented-control">
              <button
                type="button"
                className="segmented-btn"
                aria-pressed={status === 'PAID'}
                onClick={() => setStatus('PAID')}
              >
                <span aria-hidden="true">✓</span> {type === 'INCOME' ? 'Recebido' : 'Pago'}
              </button>
              <button
                type="button"
                className="segmented-btn"
                aria-pressed={status === 'PENDING'}
                onClick={() => setStatus('PENDING')}
              >
                <span aria-hidden="true">⏱</span> Pendente
              </button>
            </div>
          </fieldset>

          <div className="field-group">
            <label htmlFor="tx-amount-input" className="field-label">
              Valor (R$)
            </label>
            <input
              ref={amountInputRef}
              id="tx-amount-input"
              type="text"
              inputMode="numeric"
              className="input-control input-hero-amount tabular-nums"
              placeholder="R$ 0,00"
              value={formattedAmount}
              onChange={(event) => {
                setAmountCents(parseDigitsToCents(event.target.value));
              }}
              aria-invalid={Boolean(fieldErrors.amountCents)}
              aria-describedby={fieldErrors.amountCents ? 'tx-amount-error' : undefined}
            />
            {fieldErrors.amountCents && (
              <span id="tx-amount-error" className="field-error" role="alert">
                {fieldErrors.amountCents}
              </span>
            )}
          </div>

          <fieldset
            className="field-group"
            style={{ border: 'none', padding: 0, margin: 0 }}
            aria-describedby={fieldErrors.categoryId ? 'tx-category-error' : undefined}
          >
            <legend className="field-label" style={{ marginBottom: '0.25rem' }}>
              Categoria
            </legend>
            <div className="chips-grid">
              {availableCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="chip-btn"
                  aria-pressed={categoryId === cat.id}
                  onClick={() => setCategoryId(cat.id)}
                >
                  <span
                    className="category-dot"
                    style={{ backgroundColor: cat.color }}
                    aria-hidden="true"
                  />
                  <span>
                    {cat.name}
                    {cat.isArchived ? ' (Arquivada)' : ''}
                  </span>
                </button>
              ))}
            </div>
            {fieldErrors.categoryId && (
              <span id="tx-category-error" className="field-error" role="alert">
                {fieldErrors.categoryId}
              </span>
            )}
          </fieldset>

          <div className="field-group">
            <label htmlFor="tx-description-input" className="field-label">
              Descrição
            </label>
            <input
              id="tx-description-input"
              type="text"
              maxLength={120}
              className="input-control"
              placeholder="Ex.: Almoço executivo, Supermercado..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? 'tx-description-error' : undefined}
            />
            {fieldErrors.description && (
              <span id="tx-description-error" className="field-error" role="alert">
                {fieldErrors.description}
              </span>
            )}
          </div>

          <div className="field-group">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <label htmlFor="tx-date-input" className="field-label">
                Data do lançamento
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: '30px', padding: '0.15rem 0.55rem', fontSize: '0.75rem' }}
                  onClick={() => handleDateChange(getTodayCivilDate())}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: '30px', padding: '0.15rem 0.55rem', fontSize: '0.75rem' }}
                  onClick={() => handleDateChange(getYesterdayCivilDate())}
                >
                  Ontem
                </button>
              </div>
            </div>
            <input
              id="tx-date-input"
              type="date"
              className="input-control tabular-nums"
              value={date}
              onChange={(event) => handleDateChange(event.target.value)}
              aria-invalid={Boolean(fieldErrors.date)}
              aria-describedby={fieldErrors.date ? 'tx-date-error' : undefined}
            />
            {fieldErrors.date && (
              <span id="tx-date-error" className="field-error" role="alert">
                {fieldErrors.date}
              </span>
            )}
          </div>

          {!editingTransaction && (
            <div className="recurring-section-box">
              <label
                htmlFor="tx-is-recurring"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: 'var(--color-text-primary)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  id="tx-is-recurring"
                  checked={isRecurring}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setIsRecurring(checked);
                    if (checked && !recurrenceEndDate) {
                      setRecurrenceEndDate(addYearsCivilDate(date, 1));
                    }
                  }}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>🔁 Conta recorrente mensal (repetir todos os meses)</span>
              </label>

              {isRecurring && (
                <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.5rem' }}>
                  <label htmlFor="tx-recurrence-end-date" className="field-label">
                    Recorrente até (padrão: 1 ano à frente):
                  </label>
                  <input
                    id="tx-recurrence-end-date"
                    type="date"
                    className="input-control tabular-nums"
                    min={date}
                    value={recurrenceEndDate}
                    onChange={(event) => setRecurrenceEndDate(event.target.value)}
                  />
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.8125rem',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Serão gerados lançamentos automáticos mensais como &quot;Pendente&quot; até{' '}
                    <strong className="tabular-nums">
                      {formatCivilDatePtBr(recurrenceEndDate || addYearsCivilDate(date, 1))}
                    </strong>
                    .
                  </p>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '0.5rem',
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
              aria-busy={isSaving}
            >
              {isSaving ? 'Salvando...' : 'Salvar transação'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
