import type { BudgetAlertStatus } from '../../shared/domain/budget-status.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';

export interface StatusBadgeProps {
  readonly status: BudgetAlertStatus;
}

export function formatPercentagePtBr(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}%`;
}

export function formatBudgetStatusText(params: {
  status: BudgetAlertStatus;
  remainingCents: number;
  usagePercentage: number;
}): string {
  const pct = formatPercentagePtBr(params.usagePercentage);
  if (params.status === 'EXCEEDED') {
    const exceededAmount = formatCentsToBrl(Math.abs(params.remainingCents));
    return `Excedido em ${exceededAmount} (${pct} utilizado)`;
  }
  const remainingAmount = formatCentsToBrl(Math.max(0, params.remainingCents));
  if (params.status === 'WARNING') {
    return `Restam ${remainingAmount} (${pct} utilizado — próximo ao limite)`;
  }
  return `Restam ${remainingAmount} (${pct} utilizado)`;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'EXCEEDED') {
    return (
      <span className="status-badge status-badge-exceeded">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>Estourado</span>
      </span>
    );
  }

  if (status === 'WARNING') {
    return (
      <span className="status-badge status-badge-warning">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Atenção</span>
      </span>
    );
  }

  return (
    <span className="status-badge status-badge-normal">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>Dentro da meta</span>
    </span>
  );
}
