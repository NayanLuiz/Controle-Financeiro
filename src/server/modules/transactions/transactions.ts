import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import {
  type EntryType,
  type PaginatedTransactionsDto,
  type PeriodPendingSummaryDto,
  type TransactionDto,
  type TransactionStatus,
  deleteTransactionQuerySchema,
  listTransactionsQuerySchema,
  updateTransactionStatusSchema,
  upsertTransactionSchema,
} from '../../../shared/contracts/index.js';
import { addYearsCivilDate, parseCivilDate } from '../../../shared/domain/civil-date.js';
import { generateMonthlyRecurringDates } from '../../../shared/domain/recurrence.js';
import { getRequestUserId } from '../auth/auth.js';

interface TransactionJoinedRow {
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

interface ExistingTxRow {
  id: string;
  category_id: string;
  date: string;
  status: TransactionStatus;
  is_recurring: number;
  recurring_group_id: string | null;
  created_at: string;
}

interface CategoryLookupRow {
  id: string;
  name: string;
  type: EntryType;
  color: string;
  is_archived: number;
}

function mapTransactionRow(row: TransactionJoinedRow): TransactionDto {
  return {
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
    recurringGroupId: row.recurring_group_id ?? null,
    createdAt: row.created_at,
  };
}

export function registerTransactionsModule(app: FastifyInstance, db: DatabaseSync): void {
  const findCategoryStmt = db.prepare(
    'SELECT id, name, type, color, is_archived FROM categories WHERE id = ? AND user_id = ?',
  );
  const findTxByIdStmt = db.prepare(
    `SELECT id, category_id, date, status, is_recurring, recurring_group_id, created_at
     FROM transactions
     WHERE id = ? AND user_id = ?`,
  );

  app.get('/api/transactions', async (request) => {
    const userId = getRequestUserId(request);
    const query = listTransactionsQuerySchema.parse(request.query);
    const conditions: string[] = ['t.user_id = ?', 't.year = ?', 't.month = ?'];
    const params: Array<string | number> = [userId, query.year, query.month];

    if (query.type) {
      conditions.push('t.type = ?');
      params.push(query.type);
    }
    if (query.status) {
      conditions.push('t.status = ?');
      params.push(query.status);
    }
    if (query.categoryId) {
      conditions.push('t.category_id = ?');
      params.push(query.categoryId);
    }
    if (query.search && query.search.length > 0) {
      conditions.push('LOWER(t.description) LIKE ?');
      params.push(`%${query.search.toLocaleLowerCase('pt-BR')}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM transactions t ${whereClause}`)
      .get(...params) as { total: number | bigint } | undefined;

    const totalItems = Number(countRow?.total ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const rows = db
      .prepare(
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
        ${whereClause}
        ORDER BY t.date DESC, t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      )
      .all(...params, query.pageSize, offset) as unknown as TransactionJoinedRow[];

    const pendingSummaryRow = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'EXPENSE' AND status = 'PENDING' THEN amount_cents ELSE 0 END), 0) AS pending_expense_cents,
          COALESCE(SUM(CASE WHEN type = 'INCOME' AND status = 'PENDING' THEN amount_cents ELSE 0 END), 0) AS pending_income_cents,
          COALESCE(SUM(CASE WHEN type = 'EXPENSE' AND status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_expense_count,
          COALESCE(SUM(CASE WHEN type = 'INCOME' AND status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_income_count
        FROM transactions
        WHERE user_id = ? AND year = ? AND month = ?`,
      )
      .get(userId, query.year, query.month) as
      | {
          pending_expense_cents: number;
          pending_income_cents: number;
          pending_expense_count: number;
          pending_income_count: number;
        }
      | undefined;

    const pendingSummary: PeriodPendingSummaryDto = {
      pendingExpenseCents: Number(pendingSummaryRow?.pending_expense_cents ?? 0),
      pendingIncomeCents: Number(pendingSummaryRow?.pending_income_cents ?? 0),
      pendingExpenseCount: Number(pendingSummaryRow?.pending_expense_count ?? 0),
      pendingIncomeCount: Number(pendingSummaryRow?.pending_income_count ?? 0),
    };

    const response: PaginatedTransactionsDto = {
      items: rows.map(mapTransactionRow),
      meta: {
        totalItems,
        totalPages,
        currentPage: query.page,
        pageSize: query.pageSize,
      },
      pendingSummary,
    };

    return response;
  });

  const validateTransactionInput = (
    userId: string,
    input: { type: EntryType; date: string; categoryId: string },
    allowedArchivedCategoryId?: string,
  ):
    | {
        ok: true;
        dateParts: { year: number; month: number; day: number };
        category: CategoryLookupRow;
      }
    | { ok: false; statusCode: number; code: string; message: string } => {
    const dateParts = parseCivilDate(input.date);
    if (!dateParts) {
      return {
        ok: false,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Informe uma data válida (DD/MM/AAAA).',
      };
    }

    const category = findCategoryStmt.get(input.categoryId, userId) as
      | CategoryLookupRow
      | undefined;
    if (!category) {
      return {
        ok: false,
        statusCode: 400,
        code: 'CATEGORY_NOT_FOUND',
        message: 'A categoria selecionada não existe.',
      };
    }
    if (category.type !== input.type) {
      return {
        ok: false,
        statusCode: 422,
        code: 'CATEGORY_TYPE_MISMATCH',
        message: 'Selecione uma categoria ativa compatível com o tipo da transação.',
      };
    }
    if (category.is_archived === 1 && category.id !== allowedArchivedCategoryId) {
      return {
        ok: false,
        statusCode: 422,
        code: 'CATEGORY_ARCHIVED',
        message: 'Selecione uma categoria ativa compatível com o tipo da transação.',
      };
    }

    return { ok: true, dateParts, category };
  };

  app.post('/api/transactions', async (request, reply) => {
    const userId = getRequestUserId(request);
    const input = upsertTransactionSchema.parse(request.body ?? {});
    const validation = validateTransactionInput(userId, input);
    if (!validation.ok) {
      return reply.code(validation.statusCode).send({
        error: {
          code: validation.code,
          message: validation.message,
        },
      });
    }
    const { dateParts, category } = validation;
    const status: TransactionStatus = input.status ?? 'PAID';
    const isRecurring = Boolean(input.isRecurring);
    const now = new Date().toISOString();

    const insertStmt = db.prepare(
      `INSERT INTO transactions (
        id, user_id, type, amount_cents, date, year, month, description, category_id,
        status, is_recurring, recurring_group_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const initialId = randomUUID();

    if (isRecurring) {
      const recurrenceEndDate = input.recurrenceEndDate || addYearsCivilDate(input.date, 1);
      const occurrences = generateMonthlyRecurringDates(input.date, recurrenceEndDate);
      const recurringGroupId = randomUUID();

      db.exec('BEGIN IMMEDIATE');
      try {
        insertStmt.run(
          initialId,
          userId,
          input.type,
          input.amountCents,
          input.date,
          dateParts.year,
          dateParts.month,
          input.description,
          input.categoryId,
          status,
          1,
          recurringGroupId,
          now,
          now,
        );

        for (const occDate of occurrences) {
          const occParts = parseCivilDate(occDate);
          if (occParts) {
            insertStmt.run(
              randomUUID(),
              userId,
              input.type,
              input.amountCents,
              occDate,
              occParts.year,
              occParts.month,
              input.description,
              input.categoryId,
              'PENDING',
              1,
              recurringGroupId,
              now,
              now,
            );
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const created: TransactionDto = {
        id: initialId,
        type: input.type,
        amountCents: input.amountCents,
        date: input.date,
        description: input.description,
        categoryId: category.id,
        categoryName: category.name,
        categoryColor: category.color,
        categoryIsArchived: false,
        status,
        isRecurring: true,
        recurringGroupId,
        createdAt: now,
      };

      return reply.code(201).send(created);
    }

    insertStmt.run(
      initialId,
      userId,
      input.type,
      input.amountCents,
      input.date,
      dateParts.year,
      dateParts.month,
      input.description,
      input.categoryId,
      status,
      0,
      null,
      now,
      now,
    );

    const created: TransactionDto = {
      id: initialId,
      type: input.type,
      amountCents: input.amountCents,
      date: input.date,
      description: input.description,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIsArchived: false,
      status,
      isRecurring: false,
      recurringGroupId: null,
      createdAt: now,
    };

    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/api/transactions/:id/status', async (request, reply) => {
    const userId = getRequestUserId(request);
    const { id } = request.params;
    const input = updateTransactionStatusSchema.parse(request.body ?? {});

    const existing = db
      .prepare(
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
        WHERE t.id = ? AND t.user_id = ?`,
      )
      .get(id, userId) as TransactionJoinedRow | undefined;

    if (!existing) {
      return reply.code(404).send({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transação não encontrada.',
        },
      });
    }

    const now = new Date().toISOString();
    db.prepare(
      'UPDATE transactions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    ).run(input.status, now, id, userId);

    const updated: TransactionDto = {
      ...mapTransactionRow(existing),
      status: input.status,
    };

    return reply.code(200).send(updated);
  });

  app.put<{ Params: { id: string } }>('/api/transactions/:id', async (request, reply) => {
    const userId = getRequestUserId(request);
    const { id } = request.params;
    const existingTx = findTxByIdStmt.get(id, userId) as ExistingTxRow | undefined;

    if (!existingTx) {
      return reply.code(404).send({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transação não encontrada.',
        },
      });
    }

    const input = upsertTransactionSchema.parse(request.body ?? {});
    const validation = validateTransactionInput(userId, input, existingTx.category_id);
    if (!validation.ok) {
      return reply.code(validation.statusCode).send({
        error: {
          code: validation.code,
          message: validation.message,
        },
      });
    }
    const { dateParts, category } = validation;
    const nextStatus = input.status ?? existingTx.status;

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE transactions
       SET type = ?, amount_cents = ?, date = ?, year = ?, month = ?, description = ?,
           category_id = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      input.type,
      input.amountCents,
      input.date,
      dateParts.year,
      dateParts.month,
      input.description,
      input.categoryId,
      nextStatus,
      now,
      id,
      userId,
    );

    const updated: TransactionDto = {
      id,
      type: input.type,
      amountCents: input.amountCents,
      date: input.date,
      description: input.description,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIsArchived: category.is_archived === 1,
      status: nextStatus,
      isRecurring: existingTx.is_recurring === 1,
      recurringGroupId: existingTx.recurring_group_id,
      createdAt: existingTx.created_at,
    };

    return reply.code(200).send(updated);
  });

  app.delete<{ Params: { id: string } }>('/api/transactions/:id', async (request, reply) => {
    const userId = getRequestUserId(request);
    const { id } = request.params;
    const { scope } = deleteTransactionQuerySchema.parse(request.query ?? {});

    const existingTx = findTxByIdStmt.get(id, userId) as ExistingTxRow | undefined;
    if (!existingTx) {
      return reply.code(404).send({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transação não encontrada.',
        },
      });
    }

    if (scope === 'following' && existingTx.recurring_group_id) {
      db.prepare(
        `DELETE FROM transactions
         WHERE user_id = ? AND recurring_group_id = ? AND date >= ?`,
      ).run(userId, existingTx.recurring_group_id, existingTx.date);
      return reply.code(204).send();
    }

    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
    return reply.code(204).send();
  });
}
