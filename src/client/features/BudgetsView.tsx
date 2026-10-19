import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { BudgetProgressDto, BudgetsResponseDto } from '../../shared/contracts/index.js';
import { formatCentsToBrl, parseDigitsToCents } from '../../shared/domain/money.js';
import { ApiRequestError, apiClient } from '../api/client.js';
import { BudgetProgressBar } from '../components/BudgetProgressBar.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { formatMonthYearLabel } from '../components/MonthYearPicker.js';
import { StatusBadge, formatBudgetStatusText } from '../components/StatusBadge.js';

export interface BudgetsViewProps {
  readonly month: number;
  readonly year: number;
  readonly onDataChanged: () => void;
}

interface BudgetLimitFormProps {
  readonly categoryId: string;
  readonly label: string;
  readonly limitCentsInput: number;
  readonly isSaving: boolean;
  readonly onChangeCents: (cents: number) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>, categoryId: string) => void;
  readonly onCancel: () => void;
}

function BudgetLimitForm({
  categoryId,
  label,
  limitCentsInput,
  isSaving,
  onChangeCents,
  onSubmit,
  onCancel,
}: BudgetLimitFormProps) {
  const inputId = `budget-input-${categoryId}`;
  return (
    <form
      onSubmit={(e) => onSubmit(e, categoryId)}
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        className="input-control tabular-nums"
        style={{ width: '180px' }}
        placeholder="R$ 0,00"
        value={limitCentsInput > 0 ? formatCentsToBrl(limitCentsInput) : ''}
        onChange={(e) => onChangeCents(parseDigitsToCents(e.target.value))}
      />
      <button type="submit" className="btn btn-primary" disabled={isSaving}>
        Salvar
      </button>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}

export function BudgetsView({ month, year, onDataChanged }: BudgetsViewProps) {
  const [data, setData] = useState<BudgetsResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [limitCentsInput, setLimitCentsInput] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const loadBudgets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.listBudgets({ month, year });
      setData(response);
    } catch {
      setValidationError('Não foi possível carregar os orçamentos do período.');
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  const startEditing = (categoryId: string, currentLimitCents = 0) => {
    setEditingCategoryId(categoryId);
    setLimitCentsInput(currentLimitCents);
    setValidationError(null);
  };

  const handleSaveBudget = async (event: FormEvent<HTMLFormElement>, categoryId: string) => {
    event.preventDefault();
    setValidationError(null);

    if (limitCentsInput <= 0) {
      setValidationError(
        'Informe um limite mensal maior que R$ 0,00 para uma categoria de despesa ativa.',
      );
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.upsertBudget({
        categoryId,
        month,
        year,
        limitCents: limitCentsInput,
      });
      setEditingCategoryId(null);
      onDataChanged();
      void loadBudgets();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setValidationError(err.message);
      } else {
        setValidationError('Erro ao salvar a meta de orçamento.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBudget = async (budget: BudgetProgressDto) => {
    try {
      await apiClient.deleteBudget(budget.id);
      onDataChanged();
      void loadBudgets();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setValidationError(err.message);
      }
    }
  };

  const budgetedItems = data?.items ?? [];
  const unbudgetedItems = data?.unbudgetedExpenseCategories ?? [];
  const periodLabel = formatMonthYearLabel(month, year);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {validationError && (
        <div className="alert-banner" role="alert">
          {validationError}
        </div>
      )}

      <section className="card" aria-labelledby="active-budgets-heading">
        <h2 id="active-budgets-heading" style={{ marginTop: 0, fontSize: '1.125rem' }}>
          Metas Ativas ({periodLabel})
        </h2>

        {isLoading && !data ? (
          <p aria-busy="true">Carregando metas...</p>
        ) : budgetedItems.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Defina limites mensais por categoria abaixo para receber alertas antes de estourar seu
            orçamento.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
            {budgetedItems.map((budget) => {
              const statusText = formatBudgetStatusText({
                status: budget.status,
                remainingCents: budget.remainingCents,
                usagePercentage: budget.usagePercentage,
              });
              const isEditingThis = editingCategoryId === budget.categoryId;

              return (
                <li
                  key={budget.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <CategoryBadge
                      name={budget.categoryName}
                      color={budget.categoryColor}
                      isArchived={budget.isArchived}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <StatusBadge status={budget.status} />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                        onClick={() => startEditing(budget.categoryId, budget.limitCents)}
                      >
                        Editar meta
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                        onClick={() => void handleDeleteBudget(budget)}
                      >
                        Remover meta
                      </button>
                    </div>
                  </div>

                  <BudgetProgressBar
                    categoryName={budget.categoryName}
                    usagePercentage={budget.usagePercentage}
                    status={budget.status}
                    statusDescription={statusText}
                  />

                  <div
                    className="tabular-nums"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                      color: 'var(--color-text-secondary)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      Gasto: <strong>{formatCentsToBrl(budget.spentCents)}</strong> de{' '}
                      <strong>{formatCentsToBrl(budget.limitCents)}</strong>
                    </span>
                    <span>{statusText}</span>
                  </div>

                  {isEditingThis && (
                    <BudgetLimitForm
                      categoryId={budget.categoryId}
                      label="Novo limite (R$):"
                      limitCentsInput={limitCentsInput}
                      isSaving={isSaving}
                      onChangeCents={setLimitCentsInput}
                      onSubmit={(e, catId) => void handleSaveBudget(e, catId)}
                      onCancel={() => setEditingCategoryId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="unbudgeted-heading">
        <h2 id="unbudgeted-heading" style={{ marginTop: 0, fontSize: '1.125rem' }}>
          Categorias de Despesa sem Meta neste Mês
        </h2>

        {unbudgetedItems.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Todas as categorias de despesa ativas já possuem meta definida para este mês.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {unbudgetedItems.map((cat) => {
              const isEditingThis = editingCategoryId === cat.categoryId;
              return (
                <li
                  key={cat.categoryId}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <CategoryBadge name={cat.categoryName} color={cat.categoryColor} />
                      <span
                        className="tabular-nums"
                        style={{
                          marginLeft: '0.75rem',
                          fontSize: '0.875rem',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Gasto no mês: {formatCentsToBrl(cat.spentCents)}
                      </span>
                    </div>

                    {!isEditingThis && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => startEditing(cat.categoryId, 0)}
                      >
                        + Definir meta
                      </button>
                    )}
                  </div>

                  {isEditingThis && (
                    <BudgetLimitForm
                      categoryId={cat.categoryId}
                      label="Limite mensal (R$):"
                      limitCentsInput={limitCentsInput}
                      isSaving={isSaving}
                      onChangeCents={setLimitCentsInput}
                      onSubmit={(e, catId) => void handleSaveBudget(e, catId)}
                      onCancel={() => setEditingCategoryId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
