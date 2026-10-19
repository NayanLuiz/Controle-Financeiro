import {
  budgetStatusSchema,
  categoryQuerySchema,
  createCategorySchema,
  deleteTransactionQuerySchema,
  listTransactionsQuerySchema,
  loginRequestSchema,
  periodQuerySchema,
  transactionStatusSchema,
  updateCategorySchema,
  updateTransactionStatusSchema,
  upsertBudgetSchema,
  upsertTransactionSchema,
} from '../../src/shared/contracts/index.js';
import {
  calculateBudgetMetrics,
  calculateSharePercentage,
  compareBudgetSeverity,
} from '../../src/shared/domain/budget-status.js';
import {
  addYearsCivilDate,
  formatCivilDatePtBr,
  getTodayCivilDate,
  isValidCivilDate,
  parseCivilDate,
  stepMonthYear,
} from '../../src/shared/domain/civil-date.js';
import { generateMonthlyRecurringDates } from '../../src/shared/domain/recurrence.js';

import {
  formatCentsToBrl,
  isValidAmountCents,
  normalizeCategoryName,
  parseDigitsToCents,
} from '../../src/shared/domain/money.js';

describe('Domain: Money in integer cents (RNF-1, CA-13, CA-14)', () => {
  it('validates safe integer cents strictly between 1 and 99_999_999_999', () => {
    expect(isValidAmountCents(1)).toBe(true);
    expect(isValidAmountCents(4590)).toBe(true);
    expect(isValidAmountCents(0)).toBe(false);
    expect(isValidAmountCents(-100)).toBe(false);
    expect(isValidAmountCents(45.9)).toBe(false);
  });

  it('formats cents to BRL currency string with negative sign support', () => {
    expect(formatCentsToBrl(0)).toBe('R$ 0,00');
    expect(formatCentsToBrl(4590)).toBe('R$ 45,90');
    expect(formatCentsToBrl(800000)).toBe('R$ 8.000,00');
    expect(formatCentsToBrl(-15000)).toBe('- R$ 150,00');
    expect(() => formatCentsToBrl(12.34)).toThrow(RangeError);
  });

  it('parses numeric user digits into integer cents', () => {
    expect(parseDigitsToCents('R$ 45,90')).toBe(4590);
    expect(parseDigitsToCents('0001')).toBe(1);
    expect(parseDigitsToCents('')).toBe(0);
    expect(parseDigitsToCents('abc')).toBe(0);
  });

  it('normalizes category names with Unicode pt-BR lowercasing (CA-8)', () => {
    expect(normalizeCategoryName('  Alimentação ')).toBe('alimentação');
    expect(normalizeCategoryName('EDUCAÇÃO')).toBe('educação');
  });
});

describe('Domain: Civil dates YYYY-MM-DD (ADR-0002, CA-13, CA-14)', () => {
  it('parses valid civil dates without timezone shift and rejects invalid calendar dates', () => {
    expect(parseCivilDate('2026-10-15')).toEqual({ year: 2026, month: 10, day: 15 });
    expect(parseCivilDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseCivilDate('2026-02-29')).toBeNull();
    expect(parseCivilDate('2026-02-30')).toBeNull();
    expect(parseCivilDate('1999-12-31')).toBeNull();
    expect(isValidCivilDate('2026-10-01')).toBe(true);
    expect(isValidCivilDate('2026-13-01')).toBe(false);
  });

  it('formats civil dates to DD/MM/YYYY and steps months accurately', () => {
    expect(formatCivilDatePtBr('2026-10-01')).toBe('01/10/2026');
    expect(getTodayCivilDate(new Date(2026, 9, 19))).toBe('2026-10-19');
    expect(stepMonthYear(1, 2026, -1)).toEqual({ month: 12, year: 2025 });
    expect(stepMonthYear(12, 2026, 1)).toEqual({ month: 1, year: 2027 });
  });

  it('adds civil years accurately handling leap years (CA-28)', () => {
    expect(addYearsCivilDate('2026-10-19', 1)).toBe('2027-10-19');
    expect(addYearsCivilDate('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYearsCivilDate('2024-02-29', 4)).toBe('2028-02-29');
  });
});

describe('Domain: Monthly Recurring Dates Generator (RF-15, CA-28..CA-30)', () => {
  it('generates 12 subsequent monthly dates for 1 year period (CA-28, CA-29)', () => {
    const dates = generateMonthlyRecurringDates('2026-10-19', '2027-10-19');
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-11-19');
    expect(dates[11]).toBe('2027-10-19');
  });

  it('clamps day on shorter months such as February and April (CA-30)', () => {
    const dates = generateMonthlyRecurringDates('2026-01-31', '2026-05-31');
    expect(dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('returns empty array when endDate is before or equal to startDate', () => {
    expect(generateMonthlyRecurringDates('2026-10-19', '2026-10-19')).toEqual([]);
    expect(generateMonthlyRecurringDates('2026-10-19', '2026-05-19')).toEqual([]);
  });
});

describe('Domain: Budget status and share percentage (RF-11, RF-12, CA-22..CA-25)', () => {
  it('classifies < 80.00% as NORMAL (CA-23)', () => {
    const metrics = calculateBudgetMetrics(100000, 79990);
    expect(metrics).toEqual({
      limitCents: 100000,
      spentCents: 79990,
      remainingCents: 20010,
      usagePercentage: 79.99,
      status: 'NORMAL',
    });
  });

  it('classifies inclusive boundaries 80.00% and 100.00% as WARNING (CA-24)', () => {
    const at80 = calculateBudgetMetrics(50000, 40000);
    expect(at80.usagePercentage).toBe(80);
    expect(at80.status).toBe('WARNING');

    const at100 = calculateBudgetMetrics(50000, 50000);
    expect(at100.usagePercentage).toBe(100);
    expect(at100.remainingCents).toBe(0);
    expect(at100.status).toBe('WARNING');
  });

  it('classifies > 100.00% (100.01% and 150.00%) as EXCEEDED with negative remainingCents (CA-25)', () => {
    const at100Point01 = calculateBudgetMetrics(30000, 30003);
    expect(at100Point01.usagePercentage).toBe(100.01);
    expect(at100Point01.remainingCents).toBe(-3);
    expect(at100Point01.status).toBe('EXCEEDED');

    const at150 = calculateBudgetMetrics(30000, 45000);
    expect(at150.usagePercentage).toBe(150);
    expect(at150.remainingCents).toBe(-15000);
    expect(at150.status).toBe('EXCEEDED');
  });

  it('calculates category share percentage safely without division by zero (CA-21, CA-22)', () => {
    expect(calculateSharePercentage(60000, 100000)).toBe(60);
    expect(calculateSharePercentage(40000, 100000)).toBe(40);
    expect(calculateSharePercentage(0, 0)).toBe(0);
  });

  it('orders budgets by severity descending (EXCEEDED -> WARNING -> NORMAL)', () => {
    const items = [
      { status: 'NORMAL' as const, usagePercentage: 60, categoryName: 'Alimentação' },
      { status: 'EXCEEDED' as const, usagePercentage: 150, categoryName: 'Lazer' },
      { status: 'WARNING' as const, usagePercentage: 85, categoryName: 'Transporte' },
    ];
    items.sort(compareBudgetSeverity);
    expect(items.map((item) => item.categoryName)).toEqual(['Lazer', 'Transporte', 'Alimentação']);
  });
});

describe('Contracts: Shared Zod schemas (RF-1..RF-9)', () => {
  it('validates login, category, transaction, budget, and query schemas', () => {
    expect(loginRequestSchema.safeParse({ password: 'secret' }).success).toBe(true);
    expect(budgetStatusSchema.safeParse('WARNING').success).toBe(true);
    expect(periodQuerySchema.parse({ month: '10', year: '2026' })).toEqual({
      month: 10,
      year: 2026,
    });
    expect(categoryQuerySchema.parse({ includeArchived: 'false' })).toEqual({
      includeArchived: false,
    });
    expect(
      createCategorySchema.parse({ name: ' Educação ', type: 'EXPENSE', color: '#2563eb' }),
    ).toEqual({
      name: 'Educação',
      type: 'EXPENSE',
      color: '#2563EB',
    });
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
    expect(transactionStatusSchema.safeParse('PAID').success).toBe(true);
    expect(transactionStatusSchema.safeParse('PENDING').success).toBe(true);
    expect(transactionStatusSchema.safeParse('OTHER').success).toBe(false);
    expect(updateTransactionStatusSchema.safeParse({ status: 'PAID' }).success).toBe(true);
    expect(deleteTransactionQuerySchema.parse({})).toEqual({ scope: 'single' });
    expect(
      upsertTransactionSchema.safeParse({
        type: 'EXPENSE',
        amountCents: 4590,
        date: '2026-10-15',
        description: 'Almoço executivo',
        categoryId: 'cat-1',
        status: 'PENDING',
        isRecurring: true,
        recurrenceEndDate: '2027-10-15',
      }).success,
    ).toBe(true);
    expect(
      listTransactionsQuerySchema.parse({
        month: '10',
        year: '2026',
        pageSize: '10',
        status: 'PENDING',
      }),
    ).toEqual({
      month: 10,
      year: 2026,
      page: 1,
      pageSize: 10,
      status: 'PENDING',
    });
    expect(
      upsertBudgetSchema.safeParse({
        categoryId: 'cat-1',
        month: 10,
        year: 2026,
        limitCents: 120000,
      }).success,
    ).toBe(true);
  });
});
