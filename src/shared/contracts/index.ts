import { z } from 'zod';
import { MAX_YEAR, MIN_YEAR, isValidCivilDate } from '../domain/civil-date.js';
import { MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS } from '../domain/money.js';

export const entryTypeSchema = z.enum(['INCOME', 'EXPENSE']);
export type EntryType = z.infer<typeof entryTypeSchema>;

export const budgetStatusSchema = z.enum(['NORMAL', 'WARNING', 'EXCEEDED']);

export const hexColorSchema = z
  .string()
  .trim()
  .regex(
    /^#[0-9A-Fa-f]{6}$/,
    'Selecione uma cor da paleta ou informe um código hexadecimal válido (ex.: #2563EB).',
  )
  .transform((val) => val.toUpperCase());

export const amountCentsSchema = z
  .number({
    required_error: 'Informe um valor maior que R$ 0,00.',
    invalid_type_error: 'Informe um valor maior que R$ 0,00.',
  })
  .int('O valor deve ser expresso em centavos inteiros.')
  .min(MIN_AMOUNT_CENTS, 'Informe um valor maior que R$ 0,00.')
  .max(MAX_AMOUNT_CENTS, 'O valor excede o limite máximo permitido.');

export const civilDateSchema = z
  .string({ required_error: 'Informe uma data válida (DD/MM/AAAA).' })
  .trim()
  .refine(isValidCivilDate, 'Informe uma data válida (DD/MM/AAAA).');

export const monthQuerySchema = z.coerce.number().int().min(1).max(12);
export const yearQuerySchema = z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR);

export const periodQuerySchema = z.object({
  month: monthQuerySchema,
  year: yearQuerySchema,
});
export type PeriodQuery = z.infer<typeof periodQuerySchema>;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(60).optional(),
  password: z.string().min(1, 'Informe a senha de acesso.'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const registerRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe seu nome (entre 2 e 60 caracteres).')
    .max(60, 'Informe seu nome (entre 2 e 60 caracteres).'),
  username: z
    .string()
    .trim()
    .min(3, 'O usuário deve ter entre 3 e 40 caracteres.')
    .max(40, 'O usuário deve ter entre 3 e 40 caracteres.'),
  password: z
    .string()
    .min(4, 'A senha deve ter pelo menos 4 caracteres.')
    .max(120, 'A senha deve ter no máximo 120 caracteres.'),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export interface UserDto {
  readonly id: string;
  readonly name: string;
  readonly username: string;
}

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome da categoria deve ter entre 2 e 50 caracteres.')
    .max(50, 'O nome da categoria deve ter entre 2 e 50 caracteres.'),
  type: entryTypeSchema,
  color: hexColorSchema,
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'O nome da categoria deve ter entre 2 e 50 caracteres.')
      .max(50, 'O nome da categoria deve ter entre 2 e 50 caracteres.')
      .optional(),
    type: entryTypeSchema.optional(),
    color: hexColorSchema.optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.type !== undefined ||
      data.color !== undefined ||
      data.isArchived !== undefined,
    { message: 'Informe ao menos um campo para atualizar a categoria.' },
  );
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryQuerySchema = z.object({
  type: entryTypeSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? true : val === 'true')),
});

export interface CategoryDto {
  readonly id: string;
  readonly name: string;
  readonly type: EntryType;
  readonly color: string;
  readonly isArchived: boolean;
  readonly hasLinkedRecords: boolean;
}

export const transactionStatusSchema = z.enum(['PAID', 'PENDING']);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const upsertTransactionSchema = z.object({
  type: entryTypeSchema,
  amountCents: amountCentsSchema,
  date: civilDateSchema,
  description: z
    .string()
    .trim()
    .min(1, 'Informe uma descrição entre 1 e 120 caracteres.')
    .max(120, 'Informe uma descrição entre 1 e 120 caracteres.'),
  categoryId: z.string().trim().min(1, 'Selecione uma categoria válida.'),
  status: transactionStatusSchema.default('PAID').optional(),
  isRecurring: z.boolean().optional(),
  recurrenceEndDate: civilDateSchema.optional(),
});
export type UpsertTransactionInput = z.infer<typeof upsertTransactionSchema>;

export const updateTransactionStatusSchema = z.object({
  status: transactionStatusSchema,
});
export type UpdateTransactionStatusInput = z.infer<typeof updateTransactionStatusSchema>;

export const deleteTransactionQuerySchema = z.object({
  scope: z.enum(['single', 'following']).default('single'),
});
export type DeleteTransactionQuery = z.infer<typeof deleteTransactionQuerySchema>;

export const listTransactionsQuerySchema = z.object({
  month: monthQuerySchema,
  year: yearQuerySchema,
  type: entryTypeSchema.optional(),
  status: transactionStatusSchema.optional(),
  categoryId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export interface TransactionDto {
  readonly id: string;
  readonly type: EntryType;
  readonly amountCents: number;
  readonly date: string;
  readonly description: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
  readonly categoryIsArchived: boolean;
  readonly status: TransactionStatus;
  readonly isRecurring: boolean;
  readonly recurringGroupId: string | null;
  readonly createdAt: string;
}

export interface PeriodPendingSummaryDto {
  readonly pendingExpenseCents: number;
  readonly pendingIncomeCents: number;
  readonly pendingExpenseCount: number;
  readonly pendingIncomeCount: number;
}

export interface FilteredTransactionSummaryDto {
  readonly incomeCents: number;
  readonly expenseCents: number;
}

export interface PaginationMetaDto {
  readonly totalItems: number;
  readonly totalPages: number;
  readonly currentPage: number;
  readonly pageSize: number;
}

export interface PaginatedTransactionsDto {
  readonly items: readonly TransactionDto[];
  readonly meta: PaginationMetaDto;
  readonly filteredSummary: FilteredTransactionSummaryDto;
  readonly pendingSummary?: PeriodPendingSummaryDto;
}

export const upsertBudgetSchema = z.object({
  categoryId: z.string().trim().min(1, 'Selecione uma categoria de despesa ativa.'),
  month: monthQuerySchema,
  year: yearQuerySchema,
  limitCents: z
    .number({
      required_error:
        'Informe um limite mensal maior que R$ 0,00 para uma categoria de despesa ativa.',
      invalid_type_error:
        'Informe um limite mensal maior que R$ 0,00 para uma categoria de despesa ativa.',
    })
    .int()
    .min(
      MIN_AMOUNT_CENTS,
      'Informe um limite mensal maior que R$ 0,00 para uma categoria de despesa ativa.',
    )
    .max(MAX_AMOUNT_CENTS, 'O limite mensal excede o valor máximo permitido.'),
});
export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;

export interface BudgetProgressDto {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
  readonly isArchived: boolean;
  readonly month: number;
  readonly year: number;
  readonly limitCents: number;
  readonly spentCents: number;
  readonly remainingCents: number;
  readonly usagePercentage: number;
  readonly status: z.infer<typeof budgetStatusSchema>;
}

export interface UnbudgetedCategoryDto {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
  readonly spentCents: number;
}

export interface BudgetsResponseDto {
  readonly month: number;
  readonly year: number;
  readonly items: readonly BudgetProgressDto[];
  readonly unbudgetedExpenseCategories: readonly UnbudgetedCategoryDto[];
}

export interface CategoryShareDto {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
  readonly isArchived: boolean;
  readonly type: EntryType;
  readonly totalAmountCents: number;
  readonly sharePercentage: number;
}

export const copyPreviousBudgetsSchema = z.object({
  month: monthQuerySchema,
  year: yearQuerySchema,
});
export type CopyPreviousBudgetsInput = z.infer<typeof copyPreviousBudgetsSchema>;

export interface CopyPreviousBudgetsResponseDto {
  readonly copiedCount: number;
  readonly items: readonly BudgetProgressDto[];
}

export interface DailyFlowDto {
  readonly day: number;
  readonly incomeCents: number;
  readonly expenseCents: number;
}

export interface DashboardResponseDto {
  readonly month: number;
  readonly year: number;
  readonly summary: {
    readonly totalIncomeCents: number;
    readonly totalExpenseCents: number;
    readonly netBalanceCents: number;
    readonly totalBudgetedCents: number;
    readonly totalBudgetSpentCents: number;
  };
  readonly cashFlow: {
    readonly totalIncomeCents: number;
    readonly totalExpenseCents: number;
  };
  readonly categoryBreakdown: readonly CategoryShareDto[];
  readonly budgetProgress: readonly BudgetProgressDto[];
  readonly dailyTrend?: readonly DailyFlowDto[];
  readonly recentTransactions?: readonly TransactionDto[];
}
