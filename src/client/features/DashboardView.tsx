import { useEffect, useState } from 'react';
import type {
  DashboardResponseDto,
  EntryType,
  TransactionDto,
} from '../../shared/contracts/index.js';
import { formatCivilDatePtBr, getDaysInMonth } from '../../shared/domain/civil-date.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';
import { apiClient } from '../api/client.js';
import { BudgetProgressBar } from '../components/BudgetProgressBar.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { DailyTrendChart } from '../components/DailyTrendChart.js';
import { DonutChart } from '../components/DonutChart.js';
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
  readonly onNavigateToTransactions?: () => void;
  readonly onEditTransaction?: (tx: TransactionDto) => void;
}

export function DashboardView({
  month,
  year,
  onOpenNewTransaction,
  onNavigateToBudgets,
  onFilterByCategory,
  onNavigateToTransactions,
  onEditTransaction,
}: DashboardViewProps) {
  const [data, setData] = useState<DashboardResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    apiClient
      .getDashboard({ month, year })
      .then((res) => {
        if (active) {
          setData(res);
        }
      })
      .catch(() => {
        if (active) {
          setError('Não foi possível carregar os indicadores do período.');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [month, year]);

  if (isLoading && !data) {
    return (
      <section className="card" aria-busy="true">
        <p style={{ margin: 0, fontWeight: 600 }}>
          Carregando indicadores de {formatMonthYearLabel(month, year)}...
        </p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="alert-banner" role="alert">
        <p style={{ margin: 0 }}>{error ?? 'Erro ao carregar dados.'}</p>
      </section>
    );
  }

  const {
    summary,
    cashFlow,
    categoryBreakdown,
    budgetProgress,
    dailyTrend = [],
    recentTransactions = [],
  } = data;
  const maxCashFlow = Math.max(cashFlow.totalIncomeCents, cashFlow.totalExpenseCents, 1);
  const incomeBarPct =
    cashFlow.totalIncomeCents > 0 ? Math.round((cashFlow.totalIncomeCents / maxCashFlow) * 100) : 0;
  const expenseBarPct =
    cashFlow.totalExpenseCents > 0
      ? Math.round((cashFlow.totalExpenseCents / maxCashFlow) * 100)
      : 0;

  const savingsRatePct =
    summary.totalIncomeCents > 0
      ? Math.round(
          ((summary.totalIncomeCents - summary.totalExpenseCents) / summary.totalIncomeCents) *
            1000,
        ) / 10
      : null;

  const budgetOverallPct =
    summary.totalBudgetedCents > 0
      ? Math.round((summary.totalBudgetSpentCents / summary.totalBudgetedCents) * 10000) / 100
      : 0;

  const periodLabel = formatMonthYearLabel(month, year);
  const hasAnyTransactions = summary.totalIncomeCents > 0 || summary.totalExpenseCents > 0;

  // Cálculos de Projeção e Ritmo Diário
  const totalDaysInMonth = getDaysInMonth(year, month);
  const now = new Date();
  const isCurrentPeriod = now.getFullYear() === year && now.getMonth() + 1 === month;
  const elapsedDays = isCurrentPeriod ? Math.max(1, now.getDate()) : totalDaysInMonth;
  const daysRemaining = Math.max(0, totalDaysInMonth - elapsedDays);
  const dailyBurnRateCents = Math.round(summary.totalExpenseCents / elapsedDays);
  const projectedMonthExpenseCents = dailyBurnRateCents * totalDaysInMonth;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section aria-label={`Resumo financeiro de ${periodLabel}`} className="summary-grid">
        <article className="card kpi-card">
          <div className="kpi-header">
            <h2 className="kpi-title">Receitas do Mês</h2>
            <span className="kpi-icon-badge kpi-icon-income" aria-hidden="true">
              <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </span>
          </div>
          <p className="kpi-value tabular-nums" style={{ color: 'var(--color-income-text)' }}>
            {formatCentsToBrl(summary.totalIncomeCents)}
          </p>
          <p className="kpi-subtext">Total de entradas confirmadas</p>
        </article>

        <article className="card kpi-card">
          <div className="kpi-header">
            <h2 className="kpi-title">Despesas do Mês</h2>
            <span className="kpi-icon-badge kpi-icon-expense" aria-hidden="true">
              <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10" />
                <path d="M17 7v10H7" />
              </svg>
            </span>
          </div>
          <p className="kpi-value tabular-nums" style={{ color: 'var(--color-expense-text)' }}>
            {formatCentsToBrl(summary.totalExpenseCents)}
          </p>
          <p className="kpi-subtext">Total de saídas no período</p>
        </article>

        <article className="card kpi-card">
          <div className="kpi-header">
            <h2 className="kpi-title">Saldo Líquido</h2>
            <span className="kpi-icon-badge kpi-icon-balance" aria-hidden="true">
              <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
            </span>
          </div>
          <p
            className="kpi-value tabular-nums"
            style={{
              color:
                summary.netBalanceCents >= 0
                  ? 'var(--color-income-text)'
                  : 'var(--color-expense-text)',
            }}
          >
            {formatCentsToBrl(summary.netBalanceCents)}
          </p>
          <p className="kpi-subtext">
            {summary.netBalanceCents >= 0
              ? 'Superávit acumulado no mês'
              : 'Déficit acumulado no mês'}
          </p>
        </article>

        <article className="card kpi-card">
          <div className="kpi-header">
            <h2 className="kpi-title">Orçamento Comprometido</h2>
            <span className="kpi-icon-badge kpi-icon-budget" aria-hidden="true">
              <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </span>
          </div>
          <p className="kpi-value tabular-nums">
            {summary.totalBudgetedCents > 0 ? formatPercentagePtBr(budgetOverallPct) : '—'}
          </p>
          <p className="kpi-subtext tabular-nums">
            {summary.totalBudgetedCents > 0
              ? `${formatCentsToBrl(summary.totalBudgetSpentCents)} de ${formatCentsToBrl(summary.totalBudgetedCents)}`
              : 'Nenhuma meta ativa neste mês'}
          </p>
        </article>
      </section>

      {/* Smart Health Insights Bar */}
      {hasAnyTransactions && (
        <section className="smart-insights-bar" aria-label="Projeções financeiras do mês">
          <div className="insight-pill">
            <span className="insight-label">Média Diária de Gastos:</span>
            <strong className="insight-val tabular-nums">
              {formatCentsToBrl(dailyBurnRateCents)} / dia
            </strong>
          </div>
          <div className="insight-pill">
            <span className="insight-label">Projeção até Fechamento:</span>
            <strong className="insight-val tabular-nums">
              {formatCentsToBrl(projectedMonthExpenseCents)}
            </strong>
          </div>
          <div className="insight-pill">
            <span className="insight-label">Período:</span>
            <strong className="insight-val tabular-nums">
              {isCurrentPeriod
                ? `${daysRemaining} dias restantes`
                : `${totalDaysInMonth} dias apurados`}
            </strong>
          </div>
        </section>
      )}

      {/* Daily Evolution Trend Chart */}
      {dailyTrend.length > 0 && <DailyTrendChart month={month} year={year} items={dailyTrend} />}

      <div className="dashboard-split">
        <section className="card" aria-labelledby="cashflow-heading">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1.15rem',
            }}
          >
            <h2 id="cashflow-heading" style={{ margin: 0, fontSize: '1.125rem' }}>
              Fluxo de Caixa e Categorias
            </h2>
            {savingsRatePct !== null && (
              <span
                className="savings-rate-pill tabular-nums"
                style={{
                  background:
                    savingsRatePct >= 0 ? 'var(--color-income-bg)' : 'var(--color-expense-bg)',
                  color:
                    savingsRatePct >= 0 ? 'var(--color-income-text)' : 'var(--color-expense-text)',
                  border: `1px solid ${savingsRatePct >= 0 ? 'var(--color-income-border)' : 'var(--color-expense-border)'}`,
                }}
              >
                {savingsRatePct >= 0
                  ? `Taxa de poupança: +${formatPercentagePtBr(savingsRatePct)}`
                  : `Déficit sobre renda: ${formatPercentagePtBr(savingsRatePct)}`}
              </span>
            )}
          </div>

          {!hasAnyTransactions ? (
            <div className="empty-state-box">
              <p style={{ margin: 0, fontWeight: 700 }}>
                Nenhuma movimentação registrada em {periodLabel}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Registre sua primeira receita ou despesa para visualizar os gráficos de fluxo de
                caixa e participação por categoria.
              </p>
              <button type="button" className="btn btn-primary" onClick={onOpenNewTransaction}>
                + Registrar primeira transação
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <div
                    className="tabular-nums"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                      marginBottom: '0.3rem',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Entradas (Receitas)</span>
                    <strong style={{ color: 'var(--color-income-text)' }}>
                      {formatCentsToBrl(cashFlow.totalIncomeCents)}
                    </strong>
                  </div>
                  <div className="progress-track" style={{ margin: 0 }}>
                    <div
                      className="progress-fill progress-fill-normal"
                      style={{ width: `${incomeBarPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div
                    className="tabular-nums"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                      marginBottom: '0.3rem',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Saídas (Despesas)</span>
                    <strong style={{ color: 'var(--color-expense-text)' }}>
                      {formatCentsToBrl(cashFlow.totalExpenseCents)}
                    </strong>
                  </div>
                  <div className="progress-track" style={{ margin: 0 }}>
                    <div
                      className="progress-fill progress-fill-exceeded"
                      style={{ width: `${expenseBarPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Interactive Donut Breakdown */}
              <DonutChart
                items={categoryBreakdown}
                totalCents={cashFlow.totalExpenseCents}
                onSelectCategory={onFilterByCategory}
              />

              <div>
                <h3
                  style={{
                    fontSize: '0.8125rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    margin: '0.5rem 0 0.65rem 0',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Participação por Categoria (clique para filtrar)
                </h3>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gap: '0.5rem',
                  }}
                >
                  {categoryBreakdown.map((item) => (
                    <li key={`${item.type}-${item.categoryId}`}>
                      <button
                        type="button"
                        onClick={() => onFilterByCategory(item.categoryId, item.type)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.6rem 0.75rem',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--color-surface)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <CategoryBadge
                          name={item.categoryName}
                          color={item.categoryColor}
                          isArchived={item.isArchived}
                        />
                        <span
                          className="tabular-nums"
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            color:
                              item.type === 'INCOME'
                                ? 'var(--color-income-text)'
                                : 'var(--color-text-primary)',
                          }}
                        >
                          {formatCentsToBrl(item.totalAmountCents)}{' '}
                          <span
                            style={{
                              color: 'var(--color-text-muted)',
                              fontWeight: 600,
                              marginLeft: '0.25rem',
                            }}
                          >
                            ({formatPercentagePtBr(item.sharePercentage)})
                          </span>
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
              marginBottom: '1.15rem',
            }}
          >
            <h2 id="budgets-progress-heading" style={{ margin: 0, fontSize: '1.125rem' }}>
              Acompanhamento de Metas Mensais
            </h2>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem' }}
              onClick={onNavigateToBudgets}
            >
              Gerenciar metas
            </button>
          </div>

          {budgetProgress.length === 0 ? (
            <div className="empty-state-box">
              <p style={{ margin: 0, fontWeight: 700 }}>
                Nenhum orçamento configurado para {periodLabel}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Defina tetos mensais para suas categorias de despesa e receba alertas visuais ao
                atingir 80% do limite.
              </p>
              <button type="button" className="btn btn-primary" onClick={onNavigateToBudgets}>
                Definir metas de gastos
              </button>
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.875rem',
              }}
            >
              {budgetProgress.map((budget) => {
                const statusDescription = formatBudgetStatusText({
                  status: budget.status,
                  remainingCents: budget.remainingCents,
                  usagePercentage: budget.usagePercentage,
                });

                return (
                  <li
                    key={budget.id}
                    style={{
                      padding: '0.95rem 1rem',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface)',
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
                        Realizado: <strong>{formatCentsToBrl(budget.spentCents)}</strong> / Meta:{' '}
                        <strong>{formatCentsToBrl(budget.limitCents)}</strong>
                      </span>
                      <span style={{ fontWeight: 600 }}>{statusDescription}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Recent Transactions Widget */}
      {recentTransactions.length > 0 && (
        <section className="card" aria-labelledby="recent-tx-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <h2 id="recent-tx-heading" style={{ margin: 0, fontSize: '1.125rem' }}>
                Últimas Movimentações do Mês
              </h2>
              <p
                style={{
                  margin: '0.2rem 0 0 0',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                }}
              >
                Acompanhamento rápido dos últimos registros
              </p>
            </div>
            {onNavigateToTransactions && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem' }}
                onClick={onNavigateToTransactions}
              >
                Ver todas as transações →
              </button>
            )}
          </div>

          <div className="recent-tx-list">
            {recentTransactions.map((tx) => (
              <button
                type="button"
                key={tx.id}
                className="recent-tx-item"
                onClick={() => onEditTransaction?.(tx)}
                disabled={!onEditTransaction}
                style={{ cursor: onEditTransaction ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <span
                    className={`recent-tx-icon-badge ${tx.type === 'INCOME' ? 'text-income' : 'text-expense'}`}
                    style={{
                      background:
                        tx.type === 'INCOME' ? 'var(--color-income-bg)' : 'var(--color-expense-bg)',
                    }}
                    aria-hidden="true"
                  >
                    {tx.type === 'INCOME' ? '↗' : '↘'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tx.description}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span>{formatCivilDatePtBr(tx.date)}</span>
                      <span>•</span>
                      <CategoryBadge
                        name={tx.categoryName}
                        color={tx.categoryColor}
                        isArchived={tx.categoryIsArchived}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span
                    className={`tabular-nums ${tx.type === 'INCOME' ? 'text-income' : 'text-expense'}`}
                    style={{ fontWeight: 700, fontSize: '0.95rem' }}
                  >
                    {tx.type === 'INCOME' ? '+ ' : '- '}
                    {formatCentsToBrl(tx.amountCents)}
                  </span>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {tx.status === 'PAID' ? 'Pago' : 'Pendente'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
