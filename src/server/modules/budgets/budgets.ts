import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import {
  type BudgetProgressDto,
  type BudgetsResponseDto,
  type EntryType,
  type UnbudgetedCategoryDto,
  periodQuerySchema,
  upsertBudgetSchema,
} from '../../../shared/contracts/index.js';
import {
  calculateBudgetMetrics,
  compareBudgetSeverity,
} from '../../../shared/domain/budget-status.js';

interface BudgetAggregatedRow {
  id: string;
  category_id: string;
  category_name: string;
  category_color: string;
  is_archived: number;
  month: number;
  year: number;
  limit_cents: number;
  spent_cents: number;
}

interface UnbudgetedCategoryRow {
  category_id: string;
  category_name: string;
  category_color: string;
  spent_cents: number;
}

function mapBudgetRowToDto(row: BudgetAggregatedRow): BudgetProgressDto {
  const limitCents = Number(row.limit_cents);
  const spentCents = Number(row.spent_cents);
  const metrics = calculateBudgetMetrics(limitCents, spentCents);

  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    isArchived: row.is_archived === 1,
    month: Number(row.month),
    year: Number(row.year),
    limitCents: metrics.limitCents,
    spentCents: metrics.spentCents,
    remainingCents: metrics.remainingCents,
    usagePercentage: metrics.usagePercentage,
    status: metrics.status,
  };
}

export function getBudgetProgressItems(
  db: DatabaseSync,
  year: number,
  month: number,
): BudgetProgressDto[] {
  const rows = db
    .prepare(
      `SELECT
        b.id,
        b.category_id,
        c.name AS category_name,
        c.color AS category_color,
        c.is_archived,
        b.month,
        b.year,
        b.limit_cents,
        COALESCE(SUM(t.amount_cents), 0) AS spent_cents
      FROM budgets b
      INNER JOIN categories c ON c.id = b.category_id
      LEFT JOIN transactions t
        ON t.category_id = b.category_id
        AND t.year = b.year
        AND t.month = b.month
        AND t.type = 'EXPENSE'
      WHERE b.year = ? AND b.month = ?
      GROUP BY b.id, b.category_id, c.name, c.color, c.is_archived, b.month, b.year, b.limit_cents`,
    )
    .all(year, month) as unknown as BudgetAggregatedRow[];

  return rows.map(mapBudgetRowToDto).sort(compareBudgetSeverity);
}

export function registerBudgetsModule(app: FastifyInstance, db: DatabaseSync): void {
  app.get('/api/budgets', async (request) => {
    const query = periodQuerySchema.parse(request.query);
    const items = getBudgetProgressItems(db, query.year, query.month);

    const unbudgetedRows = db
      .prepare(
        `SELECT
          c.id AS category_id,
          c.name AS category_name,
          c.color AS category_color,
          COALESCE(SUM(t.amount_cents), 0) AS spent_cents
        FROM categories c
        LEFT JOIN transactions t
          ON t.category_id = c.id
          AND t.year = ?
          AND t.month = ?
          AND t.type = 'EXPENSE'
        WHERE c.type = 'EXPENSE'
          AND c.is_archived = 0
          AND NOT EXISTS (
            SELECT 1 FROM budgets b
            WHERE b.category_id = c.id AND b.year = ? AND b.month = ?
          )
        GROUP BY c.id, c.name, c.color
        ORDER BY spent_cents DESC, c.name COLLATE NOCASE ASC`,
      )
      .all(query.year, query.month, query.year, query.month) as unknown as UnbudgetedCategoryRow[];

    const unbudgetedExpenseCategories: UnbudgetedCategoryDto[] = unbudgetedRows.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      spentCents: Number(row.spent_cents),
    }));

    const response: BudgetsResponseDto = {
      month: query.month,
      year: query.year,
      items,
      unbudgetedExpenseCategories,
    };

    return response;
  });

  app.put('/api/budgets', async (request, reply) => {
    const input = upsertBudgetSchema.parse(request.body ?? {});

    const category = db
      .prepare('SELECT id, name, type, color, is_archived FROM categories WHERE id = ?')
      .get(input.categoryId) as
      | { id: string; name: string; type: EntryType; color: string; is_archived: number }
      | undefined;

    if (!category) {
      return reply.code(400).send({
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'A categoria informada não existe.',
        },
      });
    }

    if (category.type !== 'EXPENSE' || category.is_archived === 1) {
      return reply.code(422).send({
        error: {
          code: 'INVALID_BUDGET_CATEGORY',
          message:
            'Informe um limite mensal maior que R$ 0,00 para uma categoria de despesa ativa.',
        },
      });
    }

    const existing = db
      .prepare('SELECT id FROM budgets WHERE category_id = ? AND year = ? AND month = ?')
      .get(input.categoryId, input.year, input.month) as { id: string } | undefined;

    const now = new Date().toISOString();
    const budgetId = existing ? existing.id : randomUUID();

    if (existing) {
      db.prepare('UPDATE budgets SET limit_cents = ?, updated_at = ? WHERE id = ?').run(
        input.limitCents,
        now,
        budgetId,
      );
    } else {
      db.prepare(
        `INSERT INTO budgets (id, category_id, year, month, limit_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(budgetId, input.categoryId, input.year, input.month, input.limitCents, now, now);
    }

    const spentRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS spent_cents
         FROM transactions
         WHERE category_id = ? AND year = ? AND month = ? AND type = 'EXPENSE'`,
      )
      .get(input.categoryId, input.year, input.month) as
      | { spent_cents: number | bigint }
      | undefined;

    const spentCents = Number(spentRow?.spent_cents ?? 0);
    const metrics = calculateBudgetMetrics(input.limitCents, spentCents);

    const dto: BudgetProgressDto = {
      id: budgetId,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      isArchived: false,
      month: input.month,
      year: input.year,
      limitCents: metrics.limitCents,
      spentCents: metrics.spentCents,
      remainingCents: metrics.remainingCents,
      usagePercentage: metrics.usagePercentage,
      status: metrics.status,
    };

    return reply.code(200).send(dto);
  });

  app.delete<{ Params: { id: string } }>('/api/budgets/:id', async (request, reply) => {
    const { id } = request.params;
    const result = db.prepare('DELETE FROM budgets WHERE id = ?').run(id);
    if (result.changes === 0) {
      return reply.code(404).send({
        error: {
          code: 'BUDGET_NOT_FOUND',
          message: 'Meta de orçamento não encontrada.',
        },
      });
    }
    return reply.code(204).send();
  });
}
