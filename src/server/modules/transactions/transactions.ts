import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import {
  type EntryType,
  type PaginatedTransactionsDto,
  type TransactionDto,
  listTransactionsQuerySchema,
  upsertTransactionSchema,
} from '../../../shared/contracts/index.js';
import { parseCivilDate } from '../../../shared/domain/civil-date.js';

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
    createdAt: row.created_at,
  };
}

export function registerTransactionsModule(app: FastifyInstance, db: DatabaseSync): void {
  const findCategoryStmt = db.prepare(
    'SELECT id, name, type, color, is_archived FROM categories WHERE id = ?',
  );
  const findTxByIdStmt = db.prepare(
    'SELECT id, category_id, created_at FROM transactions WHERE id = ?',
  );

  app.get('/api/transactions', async (request) => {
    const query = listTransactionsQuerySchema.parse(request.query);
    const conditions: string[] = ['t.year = ?', 't.month = ?'];
    const params: Array<string | number> = [query.year, query.month];

    if (query.type) {
      conditions.push('t.type = ?');
      params.push(query.type);
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
          t.created_at
        FROM transactions t
        INNER JOIN categories c ON c.id = t.category_id
        ${whereClause}
        ORDER BY t.date DESC, t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      )
      .all(...params, query.pageSize, offset) as unknown as TransactionJoinedRow[];

    const response: PaginatedTransactionsDto = {
      items: rows.map(mapTransactionRow),
      meta: {
        totalItems,
        totalPages,
        currentPage: query.page,
        pageSize: query.pageSize,
      },
    };

    return response;
  });

  const validateTransactionInput = (
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

    const category = findCategoryStmt.get(input.categoryId) as CategoryLookupRow | undefined;
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
    const input = upsertTransactionSchema.parse(request.body ?? {});
    const validation = validateTransactionInput(input);
    if (!validation.ok) {
      return reply.code(validation.statusCode).send({
        error: {
          code: validation.code,
          message: validation.message,
        },
      });
    }
    const { dateParts, category } = validation;

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO transactions (
        id, type, amount_cents, date, year, month, description, category_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.type,
      input.amountCents,
      input.date,
      dateParts.year,
      dateParts.month,
      input.description,
      input.categoryId,
      now,
      now,
    );

    const created: TransactionDto = {
      id,
      type: input.type,
      amountCents: input.amountCents,
      date: input.date,
      description: input.description,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIsArchived: false,
      createdAt: now,
    };

    return reply.code(201).send(created);
  });

  app.put<{ Params: { id: string } }>('/api/transactions/:id', async (request, reply) => {
    const { id } = request.params;
    const existingTx = findTxByIdStmt.get(id) as
      | { id: string; category_id: string; created_at: string }
      | undefined;

    if (!existingTx) {
      return reply.code(404).send({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transação não encontrada.',
        },
      });
    }

    const input = upsertTransactionSchema.parse(request.body ?? {});
    const validation = validateTransactionInput(input, existingTx.category_id);
    if (!validation.ok) {
      return reply.code(validation.statusCode).send({
        error: {
          code: validation.code,
          message: validation.message,
        },
      });
    }
    const { dateParts, category } = validation;

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE transactions
       SET type = ?, amount_cents = ?, date = ?, year = ?, month = ?, description = ?, category_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.type,
      input.amountCents,
      input.date,
      dateParts.year,
      dateParts.month,
      input.description,
      input.categoryId,
      now,
      id,
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
      createdAt: existingTx.created_at,
    };

    return reply.code(200).send(updated);
  });

  app.delete<{ Params: { id: string } }>('/api/transactions/:id', async (request, reply) => {
    const { id } = request.params;
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    if (result.changes === 0) {
      return reply.code(404).send({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transação não encontrada.',
        },
      });
    }
    return reply.code(204).send();
  });
}
