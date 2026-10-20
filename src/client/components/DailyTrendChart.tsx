import { useState } from 'react';
import type { DailyFlowDto } from '../../shared/contracts/index.js';
import { getDaysInMonth } from '../../shared/domain/civil-date.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';

export interface DailyTrendChartProps {
  readonly month: number;
  readonly year: number;
  readonly items: readonly DailyFlowDto[];
}

export function DailyTrendChart({ month, year, items }: DailyTrendChartProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const now = new Date();
  const isCurrentMonthYear = now.getFullYear() === year && now.getMonth() + 1 === month;
  const currentDay = isCurrentMonthYear ? now.getDate() : null;

  const dataMap = new Map<number, DailyFlowDto>();
  for (const item of items) {
    dataMap.set(item.day, item);
  }

  let maxAmount = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    const entry = dataMap.get(day);
    if (entry) {
      if (entry.incomeCents > maxAmount) maxAmount = entry.incomeCents;
      if (entry.expenseCents > maxAmount) maxAmount = entry.expenseCents;
    }
  }

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const hoveredData = hoveredDay !== null ? dataMap.get(hoveredDay) : null;

  return (
    <div className="daily-trend-card">
      <div className="daily-trend-header">
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Fluxo Diário do Mês</h3>
          <p
            style={{
              margin: '0.15rem 0 0 0',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
            }}
          >
            Evolução de entradas e saídas dia a dia
          </p>
        </div>

        <div className="daily-trend-legend">
          <span className="legend-indicator">
            <span
              className="legend-color-dot"
              style={{ backgroundColor: 'var(--color-income-fill)' }}
            />
            Receitas
          </span>
          <span className="legend-indicator">
            <span
              className="legend-color-dot"
              style={{ backgroundColor: 'var(--color-expense-fill)' }}
            />
            Despesas
          </span>
        </div>
      </div>

      <section className="daily-trend-bars-wrapper" aria-label="Gráfico de barras diárias">
        {days.map((day) => {
          const entry = dataMap.get(day);
          const income = entry?.incomeCents ?? 0;
          const expense = entry?.expenseCents ?? 0;
          const incomeHeight = maxAmount > 0 ? Math.round((income / maxAmount) * 100) : 0;
          const expenseHeight = maxAmount > 0 ? Math.round((expense / maxAmount) * 100) : 0;
          const isToday = day === currentDay;
          const isHovered = day === hoveredDay;

          return (
            <button
              type="button"
              key={day}
              className={`daily-bar-col ${isToday ? 'daily-bar-today' : ''} ${isHovered ? 'daily-bar-active' : ''}`}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              onFocus={() => setHoveredDay(day)}
              onBlur={() => setHoveredDay(null)}
              aria-label={`Dia ${day}: Receita ${formatCentsToBrl(income)}, Despesa ${formatCentsToBrl(expense)}`}
            >
              <div className="daily-bar-track">
                {incomeHeight > 0 && (
                  <div
                    className="daily-bar-income"
                    style={{ height: `${Math.max(6, incomeHeight)}%` }}
                  />
                )}
                {expenseHeight > 0 && (
                  <div
                    className="daily-bar-expense"
                    style={{ height: `${Math.max(6, expenseHeight)}%` }}
                  />
                )}
                {incomeHeight === 0 && expenseHeight === 0 && <div className="daily-bar-empty" />}
              </div>
              <span className="daily-bar-label tabular-nums">
                {day % 5 === 1 || day === daysInMonth || isToday ? day : ''}
              </span>
            </button>
          );
        })}
      </section>

      {hoveredDay !== null && (
        <div className="daily-trend-tooltip" aria-live="polite">
          <strong className="tabular-nums">Dia {hoveredDay}</strong>:{' '}
          <span style={{ color: 'var(--color-income-text)', fontWeight: 600 }}>
            + {formatCentsToBrl(hoveredData?.incomeCents ?? 0)}
          </span>
          {' | '}
          <span style={{ color: 'var(--color-expense-text)', fontWeight: 600 }}>
            - {formatCentsToBrl(hoveredData?.expenseCents ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}
