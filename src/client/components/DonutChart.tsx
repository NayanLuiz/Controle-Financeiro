import { useState } from 'react';
import type { CategoryShareDto, EntryType } from '../../shared/contracts/index.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';
import { formatPercentagePtBr } from './StatusBadge.js';

export interface DonutChartProps {
  readonly items: readonly CategoryShareDto[];
  readonly totalCents: number;
  readonly onSelectCategory?: (categoryId: string, type: EntryType) => void;
}

export function DonutChart({ items, totalCents, onSelectCategory }: DonutChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const expenseItems = items.filter((item) => item.type === 'EXPENSE' && item.totalAmountCents > 0);

  if (expenseItems.length === 0 || totalCents === 0) {
    return (
      <div className="donut-chart-empty" aria-label="Sem dados de despesa para exibir no gráfico">
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Nenhuma despesa registrada para composição visual no período.
        </p>
      </div>
    );
  }

  const radius = 70;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const slices = expenseItems.map((item) => {
    const percent = item.sharePercentage;
    const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += percent;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const activeSlice = hoveredId ? expenseItems.find((s) => s.categoryId === hoveredId) : null;

  return (
    <div className="donut-chart-container">
      <div className="donut-svg-wrapper">
        <svg
          viewBox="0 0 200 200"
          className="donut-svg"
          role="img"
          aria-label="Gráfico de distribuição de despesas por categoria"
        >
          {/* Base track */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="var(--color-surface-muted)"
            strokeWidth={strokeWidth}
          />

          {/* Slices */}
          {slices.map((slice) => {
            const isHovered = hoveredId === slice.categoryId;
            return (
              <circle
                key={slice.categoryId}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={slice.categoryColor}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="butt"
                transform="rotate(-90 100 100)"
                className="donut-slice"
                tabIndex={onSelectCategory ? 0 : undefined}
                role={onSelectCategory ? 'button' : undefined}
                aria-label={slice.categoryName}
                onMouseEnter={() => setHoveredId(slice.categoryId)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelectCategory?.(slice.categoryId, 'EXPENSE')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCategory?.(slice.categoryId, 'EXPENSE');
                  }
                }}
                style={{
                  cursor: onSelectCategory ? 'pointer' : 'default',
                  opacity: hoveredId && !isHovered ? 0.45 : 1,
                  transition: 'stroke-width 180ms ease, opacity 180ms ease',
                }}
              />
            );
          })}
        </svg>

        {/* Center label */}
        <div className="donut-center-content" aria-hidden="true">
          {activeSlice ? (
            <>
              <span className="donut-center-badge" style={{ color: activeSlice.categoryColor }}>
                {activeSlice.categoryName}
              </span>
              <strong className="donut-center-val tabular-nums">
                {formatPercentagePtBr(activeSlice.sharePercentage)}
              </strong>
              <span className="donut-center-sub tabular-nums">
                {formatCentsToBrl(activeSlice.totalAmountCents)}
              </span>
            </>
          ) : (
            <>
              <span className="donut-center-label">Total Despesas</span>
              <strong className="donut-center-val tabular-nums">
                {formatCentsToBrl(totalCents)}
              </strong>
              <span className="donut-center-sub">
                {expenseItems.length} {expenseItems.length === 1 ? 'categoria' : 'categorias'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend list */}
      <div className="donut-legend-grid">
        {expenseItems.map((item) => {
          const isHovered = hoveredId === item.categoryId;
          return (
            <button
              key={item.categoryId}
              type="button"
              className={`donut-legend-item ${isHovered ? 'donut-legend-active' : ''}`}
              onMouseEnter={() => setHoveredId(item.categoryId)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectCategory?.(item.categoryId, 'EXPENSE')}
              title={`Clique para ver transações de ${item.categoryName}`}
            >
              <span
                className="donut-legend-dot"
                style={{ backgroundColor: item.categoryColor }}
                aria-hidden="true"
              />
              <span className="donut-legend-name">{item.categoryName}</span>
              <span className="donut-legend-pct tabular-nums">
                {formatPercentagePtBr(item.sharePercentage)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
