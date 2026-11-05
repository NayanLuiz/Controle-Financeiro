import { useEffect, useState } from 'react';
import type {
  DashboardResponseDto,
  EntryType,
  TransactionDto,
} from '../../shared/contracts/index.js';
import { formatCivilDatePtBr } from '../../shared/domain/civil-date.js';
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
  const [liquidatingId, setLiquidatingId] = useState<string | null>(null);

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

  const handleLiquidate = async (txId: string) => {
    setLiquidatingId(txId);
    try {
      await apiClient.updateTransactionStatus(txId, 'PAID');
      const updated = await apiClient.getDashboard({ month, year });
      setData(updated);
    } catch {
      // Falha silenciosa ou log
    } finally {
      setLiquidatingId(null);
    }
  };

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

  const periodLabel = formatMonthYearLabel(month, year);
  const hasAnyTransactions = summary.totalIncomeCents > 0 || summary.totalExpenseCents > 0;

  // Stitch: Contas Pendentes Próximas do Vencimento
  const pendingBills = recentTransactions.filter(
    (tx) => tx.status === 'PENDING' && tx.type === 'EXPENSE',
  );
  const pendingIncomes = recentTransactions.filter(
    (tx) => tx.status === 'PENDING' && tx.type === 'INCOME',
  );

  // Stitch: Alerta de Meta Próxima do Limite (>= 80%)
  const warningBudget = budgetProgress.find((b) => b.usagePercentage >= 80);

  const pendingExpenseCents = pendingBills.reduce((acc, tx) => acc + tx.amountCents, 0);
  const pendingIncomeCents = pendingIncomes.reduce((acc, tx) => acc + tx.amountCents, 0);
  const receivedIncomeCents = Math.max(0, summary.totalIncomeCents - pendingIncomeCents);
  const paidExpenseCents = Math.max(0, summary.totalExpenseCents - pendingExpenseCents);
  const currentBalanceCents = receivedIncomeCents - paidExpenseCents;
  const projectedBalanceCents = summary.netBalanceCents;

  const expensePaidPct =
    summary.totalExpenseCents > 0
      ? Math.round((paidExpenseCents / summary.totalExpenseCents) * 100)
      : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stitch: Card Principal de Balanço do Mês (Real vs Projeção) */}
      <section className="stitch-balance-card" aria-label="Balanço e Projeção do Mês">
        <div className="stitch-balance-header">
          <div className="stitch-balance-title">
            <span
              className="material-symbols-outlined"
              style={{ color: 'var(--color-primary)', fontSize: '20px' }}
            >
              account_balance_wallet
            </span>
            <span>Balanço do Mês</span>
          </div>
          <span
            className="stitch-balance-badge"
            style={{
              background: 'var(--color-surface-high)',
              color: 'var(--color-on-surface)',
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
            Previsão Ativa
          </span>
        </div>

        <div className="stitch-balance-grid">
          {/* Saldo em Conta Real (Consolidado) */}
          <div className="stitch-subcard-low">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                Saldo em Conta Real
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  background: 'rgba(0, 108, 74, 0.12)',
                  color: 'var(--color-secondary)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                Consolidado
              </span>
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: 'clamp(1.5rem, 2.8vw, 2.2rem)',
                fontWeight: 800,
                color: 'var(--color-on-surface)',
                margin: '0.35rem 0 0.15rem',
              }}
            >
              {formatCentsToBrl(currentBalanceCents)}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Disponível em contas vinculadas
            </span>
          </div>

          {/* Projeção Final de Mês */}
          <div className="stitch-subcard-high">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                Projeção Final de Mês
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  background: 'rgba(0, 74, 198, 0.12)',
                  color: 'var(--color-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                  auto_graph
                </span>
                Previsto
              </span>
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: 'clamp(1.4rem, 2.4vw, 1.85rem)',
                fontWeight: 800,
                color: 'var(--color-primary)',
                margin: '0.35rem 0 0.15rem',
              }}
            >
              {formatCentsToBrl(projectedBalanceCents)}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Após deduzir compromissos pendentes
            </span>
          </div>
        </div>

        {/* Aviso de compromissos pendentes (se houver) */}
        {pendingExpenseCents > 0 && (
          <div className="stitch-alert-amber">
            <span
              className="material-symbols-outlined"
              style={{ color: 'var(--color-tertiary-container)', fontSize: '20px' }}
            >
              schedule
            </span>
            <div style={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Compromissos a liquidar:
              </span>{' '}
              Existe um montante de{' '}
              <strong className="tabular-nums" style={{ color: 'var(--color-on-surface)' }}>
                {formatCentsToBrl(pendingExpenseCents)}
              </strong>{' '}
              agendado para saída até o fechamento de {periodLabel}.
            </div>
          </div>
        )}
      </section>

      {/* Stitch: Grade de Métricas do Mês (Receitas e Despesas) */}
      <section className="stitch-metrics-grid" aria-label="Métricas de Receitas e Despesas">
        {/* Receitas */}
        <div className="stitch-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(0, 108, 74, 0.12)',
                color: 'var(--color-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                trending_up
              </span>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                background: 'rgba(0, 108, 74, 0.12)',
                color: 'var(--color-secondary)',
                fontSize: '0.7rem',
                fontWeight: 700,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
              >
                check
              </span>
              {pendingIncomeCents === 0 ? '100% recebido' : 'Em andamento'}
            </span>
          </div>

          <div style={{ marginTop: '0.65rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Receitas Totais
            </span>
            <div
              className="tabular-nums"
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--color-on-surface)',
                marginTop: '0.15rem',
              }}
            >
              {formatCentsToBrl(summary.totalIncomeCents)}
            </div>
          </div>

          <div
            style={{
              marginTop: '0.65rem',
              padding: '0.45rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--color-surface-low)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>Recebido:</span>
            <strong className="tabular-nums" style={{ color: 'var(--color-secondary)' }}>
              {formatCentsToBrl(receivedIncomeCents)}
            </strong>
          </div>
        </div>

        {/* Despesas */}
        <div className="stitch-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(213, 32, 34, 0.12)',
                color: 'var(--color-tertiary-container)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                trending_down
              </span>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                background: 'var(--color-surface-high)',
                color: 'var(--color-text-secondary)',
                fontSize: '0.7rem',
                fontWeight: 700,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                hourglass_top
              </span>
              {expensePaidPct}% pago
            </span>
          </div>

          <div style={{ marginTop: '0.65rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Despesas Previstas
            </span>
            <div
              className="tabular-nums"
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--color-on-surface)',
                marginTop: '0.15rem',
              }}
            >
              {formatCentsToBrl(summary.totalExpenseCents)}
            </div>
          </div>

          <div
            style={{
              marginTop: '0.65rem',
              padding: '0.45rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--color-surface-low)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              fontSize: '0.72rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Pago:</span>
              <strong className="tabular-nums" style={{ color: 'var(--color-on-surface)' }}>
                {formatCentsToBrl(paidExpenseCents)}
              </strong>
            </div>
            {pendingExpenseCents > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-tertiary-container)', fontWeight: 600 }}>
                  Pendente:
                </span>
                <strong
                  className="tabular-nums"
                  style={{ color: 'var(--color-tertiary-container)' }}
                >
                  {formatCentsToBrl(pendingExpenseCents)}
                </strong>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Stitch: Alerta de Contas Pendentes Próximas do Vencimento */}
      {pendingBills.length > 0 && (
        <section className="stitch-card" aria-label="Contas Pendentes">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                className="material-symbols-outlined"
                style={{ color: 'var(--color-tertiary-container)', fontSize: '20px' }}
              >
                notification_important
              </span>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Próximos Vencimentos</h2>
            </div>
            <span
              style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}
            >
              {pendingBills.length} pendente{pendingBills.length > 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingBills.map((bill) => (
              <div key={bill.id} className="stitch-bill-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'var(--color-surface-high)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      schedule
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditTransaction?.(bill)}
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      textAlign: 'left',
                      cursor: onEditTransaction ? 'pointer' : 'default',
                      minWidth: 0,
                    }}
                    title={onEditTransaction ? 'Editar lançamento' : undefined}
                  >
                    <div
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--color-on-surface)',
                      }}
                    >
                      {bill.description}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--color-tertiary-container)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                        alarm
                      </span>
                      <span>Vencimento: {formatCivilDatePtBr(bill.date)}</span>
                    </div>
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '0.25rem',
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    {formatCentsToBrl(bill.amountCents)}
                  </span>
                  <button
                    type="button"
                    className="stitch-liquidar-btn"
                    onClick={() => void handleLiquidate(bill.id)}
                    disabled={liquidatingId === bill.id}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}
                    >
                      check
                    </span>
                    <span>{liquidatingId === bill.id ? 'Liquidando...' : 'Liquidar'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stitch: Fluxo Cumulativo Diário */}
      {dailyTrend.length > 0 && (
        <section className="stitch-card" aria-label="Fluxo Cumulativo">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Fluxo Cumulativo</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Evolução diária ao longo de {periodLabel}
              </span>
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.75rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--color-secondary)',
                  }}
                />
                <span style={{ color: 'var(--color-text-secondary)' }}>Entradas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--color-tertiary-container)',
                  }}
                />
                <span style={{ color: 'var(--color-text-secondary)' }}>Saídas</span>
              </div>
            </div>
          </div>
          <DailyTrendChart month={month} year={year} items={dailyTrend} />
        </section>
      )}

      {/* Split: Gastos por Categoria & Metas */}
      <div className="dashboard-split">
        {/* Gastos por Categoria */}
        <section className="stitch-card" aria-labelledby="category-breakdown-heading">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <h2
              id="category-breakdown-heading"
              style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}
            >
              Gastos por Categoria
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--color-primary)',
              }}
            >
              Top {Math.min(4, categoryBreakdown.length)}
            </span>
          </div>

          {!hasAnyTransactions || categoryBreakdown.length === 0 ? (
            <div className="empty-state-box">
              <p style={{ margin: 0, fontWeight: 700 }}>Nenhum gasto registrado em {periodLabel}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onOpenNewTransaction}
                style={{ marginTop: '0.5rem' }}
              >
                + Adicionar lançamento
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Donut interativo */}
              <DonutChart
                items={categoryBreakdown}
                totalCents={cashFlow.totalExpenseCents}
                onSelectCategory={onFilterByCategory}
              />

              {/* Barras de progresso com porcentagens Stitch */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  marginTop: '0.25rem',
                }}
              >
                {categoryBreakdown.slice(0, 4).map((item) => (
                  <div
                    key={`${item.type}-${item.categoryId}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onFilterByCategory(item.categoryId, item.type)}
                        style={{
                          background: 'none',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          textAlign: 'left',
                        }}
                      >
                        <CategoryBadge
                          name={item.categoryName}
                          color={item.categoryColor}
                          isArchived={item.isArchived}
                        />
                      </button>
                      <div
                        className="tabular-nums"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <strong style={{ color: 'var(--color-on-surface)' }}>
                          {formatCentsToBrl(item.totalAmountCents)}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          ({formatPercentagePtBr(item.sharePercentage)})
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '7px',
                        borderRadius: '9999px',
                        background: 'var(--color-surface-high)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.round(item.sharePercentage))}%`,
                          height: '100%',
                          borderRadius: '9999px',
                          background: item.categoryColor || 'var(--color-primary-container)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Metas Próximas do Limite & Orçamentos */}
        <section className="stitch-card" aria-labelledby="budgets-progress-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2
              id="budgets-progress-heading"
              style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}
            >
              Metas e Orçamentos
            </h2>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '34px', padding: '0.2rem 0.65rem', fontSize: '0.75rem' }}
              onClick={onNavigateToBudgets}
            >
              Gerenciar metas
            </button>
          </div>

          {/* Stitch: Card de Atenção ao Orçamento em destaque (se houver meta >= 80%) */}
          {warningBudget && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.85rem',
                borderRadius: '12px',
                background: 'var(--color-surface-low)',
                border: '1px solid var(--color-border-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--color-tertiary-container)', fontSize: '18px' }}
                  >
                    warning
                  </span>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>
                    Atenção ao Orçamento: {warningBudget.categoryName}
                  </strong>
                </div>
                <span
                  style={{
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    background: 'rgba(213, 32, 34, 0.12)',
                    color: 'var(--color-tertiary-container)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  {formatPercentagePtBr(warningBudget.usagePercentage)} consumido
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '9999px',
                  background: 'var(--color-surface-high)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.round(warningBudget.usagePercentage))}%`,
                    height: '100%',
                    borderRadius: '9999px',
                    background: 'var(--color-tertiary-container)',
                  }}
                />
              </div>
              <div
                className="tabular-nums"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span>
                  Gasto: <strong>{formatCentsToBrl(warningBudget.spentCents)}</strong>
                </span>
                <span>
                  Limite: <strong>{formatCentsToBrl(warningBudget.limitCents)}</strong>
                </span>
              </div>
            </div>
          )}

          {budgetProgress.length === 0 ? (
            <div className="empty-state-box">
              <p style={{ margin: 0, fontWeight: 700 }}>
                Nenhum orçamento configurado para {periodLabel}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNavigateToBudgets}
                style={{ marginTop: '0.5rem' }}
              >
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
                gap: '0.75rem',
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
                      padding: '0.75rem 0.85rem',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: '12px',
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
                        fontSize: '0.75rem',
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

      {/* Stitch: Atalho Rápido para Todas as Transações */}
      {onNavigateToTransactions && (
        <div style={{ paddingTop: '0.25rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '14px',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-sm)',
            }}
            onClick={onNavigateToTransactions}
          >
            <span>Ver todas as transações de {periodLabel}</span>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              arrow_forward
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
