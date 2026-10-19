import { useCallback, useEffect, useState } from 'react';
import type { DashboardResponseDto, EntryType } from '../../shared/contracts/index.js';
import { compareBudgetSeverity } from '../../shared/domain/budget-status.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';
import { apiClient } from '../api/client.js';
import { BudgetProgressBar } from '../components/BudgetProgressBar.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { formatMonthYearLabel } from '../components/MonthYearPicker.js';
import {
  StatusBadge,
  formatBudgetStatusText,
  formatPercentagePtBr,
} from '../components/StatusBadge.js';

export interface DashboardViewProps {
  readonly month: number;
  readonly year: number;
  readonly onOpenNewTransaction: () => void;
  readonly onNavigateToBudgets: () => void;
  readonly onFilterByCategory: (categoryId: string, type: EntryType) => void;
}

export function DashboardView({
  month,
  year,
  onOpenNewTransaction,
  onNavigateToBudgets,
  onFilterByCategory,
}: DashboardViewProps) {
  const [data, setData] = useState<DashboardResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.getDashboard({ month, year });
      setData(response);
    } catch {
      setErrorMessage('Não foi possível carregar os indicadores do período.');
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (isLoading && !data) {
    return (
      <section aria-busy="true" aria-label="Carregando painel financeiro">
        <p>Carregando resumo financeiro...</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="card" role="alert">
        <p>{errorMessage}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void loadDashboard()}>
          Tentar novamente
        </button>
      </section>
    );
  }

  const summary = data?.summary ?? {
    totalIncomeCents: 0,
    totalExpenseCents: 0,
    netBalanceCents: 0,
    totalBudgetedCents: 0,
    totalBudgetSpentCents: 0,
  };

  const categoryBreakdown = data?.categoryBreakdown ?? [];
  const sortedBudgets = [...(data?.budgetProgress ?? [])].sort(compareBudgetSeverity);
  const maxCashFlowCents = Math.max(1, summary.totalIncomeCents, summary.totalExpenseCents);
  const incomeBarWidth = Math.round((summary.totalIncomeCents / maxCashFlowCents) * 100);
  const expenseBarWidth = Math.round((summary.totalExpenseCents / maxCashFlowCents) * 100);
  const periodLabel = formatMonthYearLabel(month, year);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section aria-label="Indicadores de resumo do mês" className="summary-grid">
        <article className="card">
          <h2 className="kpi-title">Total de Receitas</h2>
          <p className="kpi-value tabular-nums text-income">
            {formatCentsToBrl(summary.totalIncomeCents)}
          </p>
        </article>

        <article className="card">
          <h2 className="kpi-title">Total de Despesas</h2>
          <p className="kpi-value tabular-nums text-expense">
            {formatCentsToBrl(summary.totalExpenseCents)}
          </p>
        </article>

        <article className="card">
          <h2 className="kpi-title">Saldo Líquido</h2>
          <p
            className={`kpi-value tabular-nums ${
              summary.netBalanceCents >= 0 ? 'text-income' : 'text-expense'
            }`}
          >
            {formatCentsToBrl(summary.netBalanceCents)}
          </p>
        </article>

        <article className="card">
          <h2 className="kpi-title">Orçado vs. Realizado</h2>
          <p className="kpi-value tabular-nums" style={{ fontSize: '1.25rem' }}>
            {formatCentsToBrl(summary.totalBudgetSpentCents)} /{' '}
            {formatCentsToBrl(summary.totalBudgetedCents)}
          </p>
          <p className="field-hint" style={{ margin: '0.25rem 0 0 0' }}>
            Considera apenas despesas em categorias com meta definida neste mês.
          </p>
        </article>
      </section>

      <div className="dashboard-split">
        <section className="card" aria-labelledby="cashflow-heading">
          <h2 id="cashflow-heading" style={{ marginTop: 0, fontSize: '1.125rem' }}>
            Fluxo de Caixa e Distribuição ({periodLabel})
          </h2>

          {summary.totalIncomeCents === 0 && summary.totalExpenseCents === 0 ? (
            <div style={{ padding: '1rem 0' }}>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Nenhuma movimentação registrada em {periodLabel}.
              </p>
              <button type="button" className="btn btn-primary" onClick={onOpenNewTransaction}>
                + Registrar primeira transação
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div aria-label="Comparativo gráfico de entradas e saídas">
                <div style={{ marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>Entradas (Receitas)</span>
                    <strong className="tabular-nums text-income">
                      {formatCentsToBrl(summary.totalIncomeCents)}
                    </strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill progress-fill-normal"
                      style={{ width: `${incomeBarWidth}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>Saídas (Despesas)</span>
                    <strong className="tabular-nums text-expense">
                      {formatCentsToBrl(summary.totalExpenseCents)}
                    </strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill progress-fill-exceeded"
                      style={{ width: `${expenseBarWidth}%` }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                  Participação por Categoria
                </h3>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gap: '0.75rem',
                  }}
                >
                  {categoryBreakdown.map((item) => (
                    <li key={`${item.type}-${item.categoryId}`}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          padding: '0.5rem',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                        onClick={() => onFilterByCategory(item.categoryId, item.type)}
                        aria-label={`Filtrar transações de ${item.categoryName} (${formatPercentagePtBr(item.sharePercentage)})`}
                      >
                        <CategoryBadge
                          name={item.categoryName}
                          color={item.categoryColor}
                          isArchived={item.isArchived}
                        />
                        <span className="tabular-nums" style={{ fontWeight: 600 }}>
                          {formatCentsToBrl(item.totalAmountCents)} (
                          {formatPercentagePtBr(item.sharePercentage)})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="budgets-progress-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 id="budgets-progress-heading" style={{ margin: 0, fontSize: '1.125rem' }}>
              Metas de Orçamento do Mês
            </h2>
            <button type="button" className="btn btn-secondary" onClick={onNavigateToBudgets}>
              Gerenciar metas
            </button>
          </div>

          {sortedBudgets.length === 0 ? (
            <div style={{ padding: '1rem 0' }}>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Você ainda não definiu metas de gastos para {periodLabel}.
              </p>
              <button type="button" className="btn btn-primary" onClick={onNavigateToBudgets}>
                Definir metas do mês
              </button>
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'grid',
                gap: '1rem',
              }}
            >
              {sortedBudgets.map((budget) => {
                const statusDescription = formatBudgetStatusText({
                  status: budget.status,
                  remainingCents: budget.remainingCents,
                  usagePercentage: budget.usagePercentage,
                });

                return (
                  <li
                    key={budget.id}
                    style={{
                      padding: '0.875rem',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <CategoryBadge
                        name={budget.categoryName}
                        color={budget.categoryColor}
                        isArchived={budget.isArchived}
                      />
                      <StatusBadge status={budget.status} />
                    </div>

                    <BudgetProgressBar
                      categoryName={budget.categoryName}
                      usagePercentage={budget.usagePercentage}
                      status={budget.status}
                      statusDescription={statusDescription}
                    />

                    <div
                      className="tabular-nums"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8125rem',
                        color: 'var(--color-text-secondary)',
                        flexWrap: 'wrap',
                        gap: '0.25rem',
                      }}
                    >
                      <span>
                        Gasto: <strong>{formatCentsToBrl(budget.spentCents)}</strong> de{' '}
                        <strong>{formatCentsToBrl(budget.limitCents)}</strong>
                      </span>
                      <span>{statusDescription}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
