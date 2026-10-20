import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { BudgetProgressDto, BudgetsResponseDto } from '../../shared/contracts/index.js';
import { formatCentsToBrl, parseDigitsToCents } from '../../shared/domain/money.js';
import { ApiRequestError, apiClient } from '../api/client.js';
import { BudgetProgressBar } from '../components/BudgetProgressBar.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { formatMonthYearLabel } from '../components/MonthYearPicker.js';
import {
  StatusBadge,
  formatBudgetStatusText,
  formatPercentagePtBr,
} from '../components/StatusBadge.js';
import { useToast } from '../components/Toast.js';

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
  const toast = useToast();
  const [data, setData] = useState<BudgetsResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [limitCentsInput, setLimitCentsInput] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [deletingBudget, setDeletingBudget] = useState<BudgetProgressDto | null>(null);

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
      toast.success('Meta de orçamento salva com sucesso!');
      onDataChanged();
      void loadBudgets();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setValidationError(err.message);
        toast.error(err.message);
      } else {
        setValidationError('Erro ao salvar a meta de orçamento.');
        toast.error('Erro ao salvar a meta de orçamento.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBudget = async (budget: BudgetProgressDto) => {
    try {
      await apiClient.deleteBudget(budget.id);
      setDeletingBudget(null);
      toast.success('Meta de orçamento removida.');
      onDataChanged();
      void loadBudgets();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setValidationError(err.message);
        toast.error(err.message);
      }
    }
  };

  const handleCopyPreviousBudgets = async () => {
    setIsCopying(true);
    try {
      const res = await apiClient.copyPreviousBudgets({ month, year });
      if (res.copiedCount > 0) {
        toast.success(
          `${res.copiedCount} ${res.copiedCount === 1 ? 'meta copiada' : 'metas copiadas'} do mês anterior!`,
        );
        onDataChanged();
        void loadBudgets();
      } else {
        toast.info('Nenhuma nova meta do mês anterior disponível para copiar.');
      }
    } catch {
      toast.error('Não foi possível copiar as metas do mês anterior.');
    } finally {
      setIsCopying(false);
    }
  };

  const budgetedItems = data?.items ?? [];
  const unbudgetedItems = data?.unbudgetedExpenseCategories ?? [];
  const periodLabel = formatMonthYearLabel(month, year);

  let totalBudgetedCents = 0;
  let totalSpentCents = 0;
  for (const b of budgetedItems) {
    totalBudgetedCents += b.limitCents;
    totalSpentCents += b.spentCents;
  }
  const overallUsagePct =
    totalBudgetedCents > 0 ? Math.round((totalSpentCents / totalBudgetedCents) * 10000) / 100 : 0;
  const overallRemainingCents = totalBudgetedCents - totalSpentCents;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {validationError && (
        <div className="alert-banner" role="alert">
          {validationError}
        </div>
      )}

      {/* Consolidated Monthly Budget Overview */}
      {budgetedItems.length > 0 && (
        <section className="card" aria-label="Resumo geral do orçamento mensal">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Teto Geral do Mês</h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCopyPreviousBudgets}
              disabled={isCopying}
              title="Copiar metas cadastradas no mês anterior para este mês"
            >
              {isCopying ? 'Copiando...' : '📋 Copiar metas do mês anterior'}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '0.85rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Total Orçado
              </span>
              <div className="tabular-nums" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {formatCentsToBrl(totalBudgetedCents)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Total Realizado
              </span>
              <div
                className="tabular-nums"
                style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-expense-text)' }}
              >
                {formatCentsToBrl(totalSpentCents)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {overallRemainingCents >= 0 ? 'Folga Orçamentária' : 'Excesso no Teto Geral'}
              </span>
              <div
                className="tabular-nums"
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color:
                    overallRemainingCents >= 0
                      ? 'var(--color-income-text)'
                      : 'var(--color-expense-text)',
                }}
              >
                {formatCentsToBrl(Math.abs(overallRemainingCents))}
              </div>
            </div>
          </div>

          <div className="progress-track" style={{ height: '10px' }}>
            <div
              className={`progress-fill ${
                overallUsagePct > 100
                  ? 'progress-fill-exceeded'
                  : overallUsagePct >= 80
                    ? 'progress-fill-warning'
                    : 'progress-fill-normal'
              }`}
              style={{ width: `${Math.min(100, overallUsagePct)}%` }}
            />
          </div>
          <div
            className="tabular-nums"
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              marginTop: '0.4rem',
              textAlign: 'right',
            }}
          >
            {formatPercentagePtBr(overallUsagePct)} do teto mensal comprometido
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="active-budgets-heading">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <h2 id="active-budgets-heading" style={{ margin: 0, fontSize: '1.125rem' }}>
            Metas Ativas ({periodLabel})
          </h2>
          {budgetedItems.length === 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCopyPreviousBudgets}
              disabled={isCopying}
            >
              {isCopying ? 'Copiando...' : '📋 Copiar metas do mês anterior'}
            </button>
          )}
        </div>

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
                        onClick={() => setDeletingBudget(budget)}
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

      {deletingBudget && (
        <ConfirmModal
          isOpen={true}
          title="Remover Meta de Orçamento"
          message={`Tem certeza que deseja remover o teto de ${formatCentsToBrl(deletingBudget.limitCents)} para a categoria "${deletingBudget.categoryName}" em ${periodLabel}?`}
          confirmLabel="Remover"
          cancelLabel="Cancelar"
          isDestructive={true}
          onConfirm={() => void handleDeleteBudget(deletingBudget)}
          onCancel={() => setDeletingBudget(null)}
        />
      )}
    </div>
  );
}
