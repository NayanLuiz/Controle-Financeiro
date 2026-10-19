import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import {
  type CategoryShareDto,
  type DashboardResponseDto,
  type EntryType,
  periodQuerySchema,
} from '../../../shared/contracts/index.js';
import { calculateSharePercentage } from '../../../shared/domain/budget-status.js';
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

export function registerDashboardModule(app: FastifyInstance, db: DatabaseSync): void {
  app.get('/api/dashboard', async (request) => {
    const userId = getRequestUserId(request);
    const query = periodQuerySchema.parse(request.query);

    const categoryRows = db
      .prepare(
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
      )
      .all(userId, query.year, query.month) as unknown as CategoryAggregateRow[];

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

    const budgetProgress = getBudgetProgressItems(db, userId, query.year, query.month);

    let totalBudgetedCents = 0;
    let totalBudgetSpentCents = 0;
    for (const budget of budgetProgress) {
      totalBudgetedCents += budget.limitCents;
      totalBudgetSpentCents += budget.spentCents;
    }

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
    };

    return response;
  });
}
