import type { BudgetAlertStatus } from '../../shared/domain/budget-status.js';

export interface BudgetProgressBarProps {
  readonly categoryName: string;
  readonly usagePercentage: number;
  readonly status: BudgetAlertStatus;
  readonly statusDescription: string;
}

export function BudgetProgressBar({
  categoryName,
  usagePercentage,
  status,
  statusDescription,
}: BudgetProgressBarProps) {
  const clampedFill = Math.min(100, Math.max(0, usagePercentage));
  const fillClass =
    status === 'EXCEEDED'
      ? 'progress-fill-exceeded'
      : status === 'WARNING'
        ? 'progress-fill-warning'
        : 'progress-fill-normal';

  return (
    <div
      className="progress-track"
      role="progressbar"
      tabIndex={0}
      aria-label={`Consumo do orçamento de ${categoryName}`}
      aria-valuenow={usagePercentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={statusDescription}
    >
      <div className={`progress-fill ${fillClass}`} style={{ width: `${clampedFill}%` }} />
    </div>
  );
}
