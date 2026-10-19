export type BudgetAlertStatus = 'NORMAL' | 'WARNING' | 'EXCEEDED';

export interface BudgetMetrics {
  readonly limitCents: number;
  readonly spentCents: number;
  readonly remainingCents: number;
  readonly usagePercentage: number;
  readonly status: BudgetAlertStatus;
}

export function calculateBudgetMetrics(limitCents: number, spentCents: number): BudgetMetrics {
  if (!Number.isSafeInteger(limitCents) || limitCents < 1) {
    throw new RangeError('Budget limitCents must be a positive integer >= 1.');
  }
  if (!Number.isSafeInteger(spentCents) || spentCents < 0) {
    throw new RangeError('Budget spentCents must be a non-negative safe integer.');
  }

  const remainingCents = limitCents - spentCents;
  const usagePercentage = Math.round((spentCents * 10000) / limitCents) / 100;

  let status: BudgetAlertStatus = 'NORMAL';
  if (usagePercentage > 100) {
    status = 'EXCEEDED';
  } else if (usagePercentage >= 80) {
    status = 'WARNING';
  }

  return {
    limitCents,
    spentCents,
    remainingCents,
    usagePercentage,
    status,
  };
}

export function calculateSharePercentage(partCents: number, totalCents: number): number {
  if (totalCents <= 0 || partCents <= 0) {
    return 0;
  }
  return Math.round((partCents * 10000) / totalCents) / 100;
}

export function compareBudgetSeverity(
  a: { status: BudgetAlertStatus; usagePercentage: number; categoryName: string },
  b: { status: BudgetAlertStatus; usagePercentage: number; categoryName: string },
): number {
  const rank: Record<BudgetAlertStatus, number> = {
    EXCEEDED: 3,
    WARNING: 2,
    NORMAL: 1,
  };
  const rankDiff = rank[b.status] - rank[a.status];
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (b.usagePercentage !== a.usagePercentage) {
    return b.usagePercentage - a.usagePercentage;
  }
  return a.categoryName.localeCompare(b.categoryName, 'pt-BR');
}
