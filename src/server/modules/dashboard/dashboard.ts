import type { FastifyInstance } from 'fastify';
import {
  type CategoryShareDto,
  type DailyFlowDto,
  type DashboardResponseDto,
  type EntryType,
  type TransactionDto,
  type TransactionStatus,
  periodQuerySchema,
} from '../../../shared/contracts/index.js';
import { calculateSharePercentage } from '../../../shared/domain/budget-status.js';
import type { DbAdapter } from '../../db/database.js';
import { getRequestUserId } from '../auth/auth.js';
import { getBudgetProgressItems } from '../budgets/budgets.js';

interface CategoryAggregateRow {
  category_id: string;
  category_name: string;
  category_color: string;
  is_archived: number;
  type: EntryType;
  total_amount_cents: number;
}

interface DailyTrendRow {
  day: number;
  income_cents: number;
  expense_cents: number;
}

interface RecentTxRow {
  id: string;
  type: EntryType;
  amount_cents: number;
  date: string;
  description: string;
  category_id: string;
  category_name: string;
  category_color: string;
  category_is_archived: number;
  status: TransactionStatus;
  is_recurring: number;
  recurring_group_id: string | null;
  created_at: string;
}

export function registerDashboardModule(app: FastifyInstance, db: DbAdapter): void {
  app.get('/api/dashboard', async (request) => {
    const userId = getRequestUserId(request);
    const query = periodQuerySchema.parse(request.query);

    const categoryRows = await db.query<CategoryAggregateRow>(
      `SELECT
        c.id AS category_id,
        c.name AS category_name,
        c.color AS category_color,
        c.is_archived,
        t.type,
        SUM(t.amount_cents) AS total_amount_cents
      FROM transactions t
      INNER JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.year = ? AND t.month = ?
      GROUP BY c.id, c.name, c.color, c.is_archived, t.type
      ORDER BY total_amount_cents DESC, c.name COLLATE NOCASE ASC`,
      [userId, query.year, query.month],
    );

    let totalIncomeCents = 0;
    let totalExpenseCents = 0;

    for (const row of categoryRows) {
      const amount = Number(row.total_amount_cents);
      if (row.type === 'INCOME') {
        totalIncomeCents += amount;
      } else {
        totalExpenseCents += amount;
      }
    }

    const categoryBreakdown: CategoryShareDto[] = categoryRows.map((row) => {
      const totalAmountCents = Number(row.total_amount_cents);
      const totalOfType = row.type === 'INCOME' ? totalIncomeCents : totalExpenseCents;

      return {
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryColor: row.category_color,
        isArchived: row.is_archived === 1,
        type: row.type,
        totalAmountCents,
        sharePercentage: calculateSharePercentage(totalAmountCents, totalOfType),
      };
    });

    const budgetProgress = await getBudgetProgressItems(db, userId, query.year, query.month);

    let totalBudgetedCents = 0;
    let totalBudgetSpentCents = 0;
    for (const budget of budgetProgress) {
      totalBudgetedCents += budget.limitCents;
      totalBudgetSpentCents += budget.spentCents;
    }

    const dailyRows = await db.query<DailyTrendRow>(
      `SELECT
        CAST(SUBSTR(t.date, 9, 2) AS INTEGER) AS day,
        SUM(CASE WHEN t.type = 'INCOME' THEN t.amount_cents ELSE 0 END) AS income_cents,
        SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount_cents ELSE 0 END) AS expense_cents
      FROM transactions t
      WHERE t.user_id = ? AND t.year = ? AND t.month = ?
      GROUP BY CAST(SUBSTR(t.date, 9, 2) AS INTEGER)
      ORDER BY day ASC`,
      [userId, query.year, query.month],
    );

    const dailyTrend: DailyFlowDto[] = dailyRows.map((row) => ({
      day: Number(row.day),
      incomeCents: Number(row.income_cents),
      expenseCents: Number(row.expense_cents),
    }));

    const recentRows = await db.query<RecentTxRow>(
      `SELECT
        t.id,
        t.type,
        t.amount_cents,
        t.date,
        t.description,
        t.category_id,
        c.name AS category_name,
        c.color AS category_color,
        c.is_archived AS category_is_archived,
        t.status,
        t.is_recurring,
        t.recurring_group_id,
        t.created_at
      FROM transactions t
      INNER JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.year = ? AND t.month = ?
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT 5`,
      [userId, query.year, query.month],
    );

    const recentTransactions: TransactionDto[] = recentRows.map((row) => ({
      id: row.id,
      type: row.type,
      amountCents: Number(row.amount_cents),
      date: row.date,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      categoryIsArchived: row.category_is_archived === 1,
      status: row.status ?? 'PAID',
      isRecurring: row.is_recurring === 1,
      recurringGroupId: row.recurring_group_id,
      createdAt: row.created_at,
    }));

    const response: DashboardResponseDto = {
      month: query.month,
      year: query.year,
      summary: {
        totalIncomeCents,
        totalExpenseCents,
        netBalanceCents: totalIncomeCents - totalExpenseCents,
        totalBudgetedCents,
        totalBudgetSpentCents,
      },
      cashFlow: {
        totalIncomeCents,
        totalExpenseCents,
      },
      categoryBreakdown,
      budgetProgress,
      dailyTrend,
      recentTransactions,
    };

    return response;
  });
}
