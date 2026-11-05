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
  const formRef = useRef<HTMLFormElement>(null);
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

  const quickAddAmount = (reais: number) => {
    setAmountCents((prev) => prev + reais * 100);
  };

  const clearAmount = () => {
    setAmountCents(0);
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
        style={{ maxWidth: '480px', width: '100%', padding: '1.25rem' }}
      >
        {/* Stitch: Top Navigation & Action Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: '36px', padding: '0.35rem 0.75rem', borderRadius: '9999px' }}
            onClick={onClose}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
            <span>Cancelar</span>
          </button>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              background: 'var(--color-surface-low)',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--color-text-secondary)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-secondary)',
              }}
            />
            <span>Fluxo Rápido</span>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: '36px', padding: '0.35rem 0.85rem', borderRadius: '9999px' }}
            disabled={isSaving}
            onClick={() => formRef.current?.requestSubmit()}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              check
            </span>
            <span>Salvar</span>
          </button>
        </div>

        {submitError && (
          <div className="alert-banner" role="alert" style={{ marginBottom: '1rem' }}>
            {submitError}
          </div>
        )}

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <h2 id="tx-modal-title" className="sr-only">
            {editingTransaction ? 'Editar Transação' : 'Nova Transação'}
          </h2>

          {/* Stitch: Segmented Control Despesa vs Receita */}
          <div
            style={{
              display: 'flex',
              background: 'var(--color-surface-container)',
              padding: '4px',
              borderRadius: '14px',
            }}
          >
            <button
              type="button"
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                border: 0,
                fontWeight: 700,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: type === 'EXPENSE' ? 'var(--color-tertiary-container)' : 'transparent',
                color: type === 'EXPENSE' ? '#ffffff' : 'var(--color-on-surface-variant)',
                boxShadow: type === 'EXPENSE' ? 'var(--shadow-sm)' : 'none',
              }}
              onClick={() => handleTypeChange('EXPENSE')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                arrow_downward
              </span>
              <span>Despesa</span>
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                border: 0,
                fontWeight: 700,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: type === 'INCOME' ? 'var(--color-secondary)' : 'transparent',
                color: type === 'INCOME' ? '#ffffff' : 'var(--color-on-surface-variant)',
                boxShadow: type === 'INCOME' ? 'var(--shadow-sm)' : 'none',
              }}
              onClick={() => handleTypeChange('INCOME')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                arrow_upward
              </span>
              <span>Receita</span>
            </button>
          </div>

          {/* Stitch: Hero Amount Input with Quick Add Buttons */}
          <div className="stitch-hero-amount">
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-secondary)',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Valor do Lançamento
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                gap: '0.35rem',
              }}
            >
              <label htmlFor="tx-amount-input" className="sr-only">
                Valor do Lançamento em Reais
              </label>
              <span
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  userSelect: 'none',
                }}
              >
                R$
              </span>
              <input
                ref={amountInputRef}
                id="tx-amount-input"
                type="text"
                inputMode="numeric"
                className="tabular-nums"
                style={{
                  width: '240px',
                  background: 'transparent',
                  border: 0,
                  textAlign: 'center',
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: 'var(--color-on-surface)',
                  outline: 'none',
                }}
                placeholder="0,00"
                value={formattedAmount ? formattedAmount.replace('R$', '').trim() : ''}
                onChange={(event) => {
                  setAmountCents(parseDigitsToCents(event.target.value));
                }}
                aria-invalid={Boolean(fieldErrors.amountCents)}
                aria-describedby={fieldErrors.amountCents ? 'tx-amount-error' : undefined}
              />
            </div>
            {fieldErrors.amountCents && (
              <span
                id="tx-amount-error"
                style={{
                  color: 'var(--color-tertiary-container)',
                  fontSize: '0.75rem',
                  marginTop: '0.25rem',
                  display: 'block',
                }}
                role="alert"
              >
                {fieldErrors.amountCents}
              </span>
            )}

            {/* Quick Add Buttons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginTop: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <button type="button" className="stitch-quick-btn" onClick={() => quickAddAmount(10)}>
                + R$ 10
              </button>
              <button type="button" className="stitch-quick-btn" onClick={() => quickAddAmount(50)}>
                + R$ 50
              </button>
              <button
                type="button"
                className="stitch-quick-btn"
                onClick={() => quickAddAmount(100)}
              >
                + R$ 100
              </button>
              <button
                type="button"
                className="stitch-quick-btn"
                onClick={clearAmount}
                title="Limpar valor"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                  backspace
                </span>
              </button>
            </div>
          </div>

          {/* Descrição */}
          <div className="field-group">
            <label
              htmlFor="tx-description-input"
              className="field-label"
              style={{ fontSize: '0.85rem' }}
            >
              Descrição
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: 'var(--color-outline)',
                  fontSize: '20px',
                  pointerEvents: 'none',
                }}
              >
                edit_note
              </span>
              <input
                id="tx-description-input"
                type="text"
                maxLength={120}
                className="input-control"
                style={{ width: '100%', paddingLeft: '2.5rem', height: '46px' }}
                placeholder="Ex.: Almoço de negócios, Supermercado..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? 'tx-description-error' : undefined}
              />
            </div>
            {fieldErrors.description && (
              <span id="tx-description-error" className="field-error" role="alert">
                {fieldErrors.description}
              </span>
            )}
          </div>

          {/* Categoria (Grid de Chips do Stitch) */}
          <div className="field-group">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.35rem',
              }}
            >
              <span className="field-label" style={{ fontSize: '0.85rem', margin: 0 }}>
                Categoria
              </span>
              <span
                style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)' }}
                aria-label="Categoria selecionada"
              >
                {(() => {
                  const selected = availableCategories.find((c) => c.id === categoryId);
                  return selected ? `Selecionada: ${selected.name}` : 'Selecione';
                })()}
              </span>
            </div>
            <div className="stitch-cat-grid">
              {availableCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`stitch-cat-chip-btn ${categoryId === cat.id ? 'selected' : ''}`}
                  onClick={() => setCategoryId(cat.id)}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '20px',
                      marginBottom: '2px',
                      color:
                        categoryId === cat.id ? '#ffffff' : cat.color || 'var(--color-primary)',
                    }}
                  >
                    {type === 'INCOME' ? 'payments' : 'category'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
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
          </div>

          {/* Data de Competência / Vencimento */}
          <div className="field-group">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <label
                htmlFor="tx-date-input"
                className="field-label"
                style={{ fontSize: '0.85rem' }}
              >
                Data de Competência
              </label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="stitch-quick-btn"
                  onClick={() => handleDateChange(getYesterdayCivilDate())}
                >
                  Ontem
                </button>
                <button
                  type="button"
                  className="stitch-quick-btn"
                  style={{
                    background: 'var(--color-primary-fixed)',
                    color: 'var(--color-on-primary-fixed)',
                  }}
                  onClick={() => handleDateChange(getTodayCivilDate())}
                >
                  Hoje
                </button>
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: 'var(--color-outline)',
                  fontSize: '20px',
                  pointerEvents: 'none',
                }}
              >
                calendar_today
              </span>
              <input
                id="tx-date-input"
                type="date"
                className="input-control tabular-nums"
                style={{ width: '100%', paddingLeft: '2.5rem', height: '46px' }}
                value={date}
                onChange={(event) => handleDateChange(event.target.value)}
                aria-invalid={Boolean(fieldErrors.date)}
                aria-describedby={fieldErrors.date ? 'tx-date-error' : undefined}
              />
            </div>
            {fieldErrors.date && (
              <span id="tx-date-error" className="field-error" role="alert">
                {fieldErrors.date}
              </span>
            )}
          </div>

          {/* Stitch: Status de Pagamento */}
          <div className="field-group">
            <span className="field-label" style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              Já foi pago?
            </span>
            <div
              style={{
                display: 'flex',
                background: 'var(--color-surface-container)',
                padding: '4px',
                borderRadius: '12px',
                gap: '4px',
              }}
            >
              <button
                type="button"
                aria-pressed={status === 'PAID'}
                style={{
                  flex: 1,
                  padding: '0.65rem 0.75rem',
                  borderRadius: '10px',
                  border: 0,
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                  background: status === 'PAID' ? 'var(--color-secondary)' : 'transparent',
                  color: status === 'PAID' ? '#ffffff' : 'var(--color-on-surface-variant)',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setStatus('PAID')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '16px',
                    fontVariationSettings: status === 'PAID' ? "'FILL' 1" : undefined,
                  }}
                >
                  check_circle
                </span>
                <span>{type === 'INCOME' ? 'Recebido' : 'Pago / Liquidado'}</span>
              </button>
              <button
                type="button"
                aria-pressed={status === 'PENDING'}
                style={{
                  flex: 1,
                  padding: '0.65rem 0.75rem',
                  borderRadius: '10px',
                  border: 0,
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                  background:
                    status === 'PENDING' ? 'var(--color-tertiary-container)' : 'transparent',
                  color: status === 'PENDING' ? '#ffffff' : 'var(--color-on-surface-variant)',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setStatus('PENDING')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  schedule
                </span>
                <span>Pendente</span>
              </button>
            </div>
          </div>

          {/* Stitch: Recorrência Mensal */}
          {!editingTransaction && (
            <div
              style={{
                background: 'var(--color-surface-low)',
                borderRadius: '14px',
                padding: '0.85rem 1rem',
              }}
            >
              <label
                htmlFor="tx-is-recurring"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--color-primary-fixed)',
                      color: 'var(--color-on-primary-fixed)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      sync
                    </span>
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: 'var(--color-on-surface)',
                      }}
                    >
                      Conta recorrente mensal
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      Repetir lançamento todo mês
                    </span>
                  </div>
                </div>

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
                  style={{ width: '20px', height: '20px', accentColor: 'var(--color-primary)' }}
                />
              </label>

              {isRecurring && (
                <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.35rem' }}>
                  <label
                    htmlFor="tx-recurrence-end-date"
                    className="field-label"
                    style={{ fontSize: '0.75rem' }}
                  >
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
                      margin: '0.2rem 0 0',
                      fontSize: '0.72rem',
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

          {/* Stitch: Botão de Salvar Lançamento no Rodapé */}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '14px',
                fontSize: '0.95rem',
                fontWeight: 700,
              }}
              disabled={isSaving}
              aria-busy={isSaving}
            >
              {isSaving
                ? 'Salvando...'
                : `Salvar Lançamento ${formattedAmount ? `(${formattedAmount})` : ''}`}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
