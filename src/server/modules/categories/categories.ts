import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  type CategoryDto,
  type EntryType,
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '../../../shared/contracts/index.js';
import { normalizeCategoryName } from '../../../shared/domain/money.js';
import type { DbAdapter } from '../../db/database.js';
import { getRequestUserId } from '../auth/auth.js';

interface CategoryRow {
  id: string;
  name: string;
  type: EntryType;
  color: string;
  is_archived: number;
  has_linked_records: number;
}

const SELECT_CATEGORIES_BASE_SQL = `
  SELECT
    c.id,
    c.name,
    c.type,
    c.color,
    c.is_archived,
    CASE
      WHEN EXISTS (SELECT 1 FROM transactions t WHERE t.category_id = c.id)
        OR EXISTS (SELECT 1 FROM budgets b WHERE b.category_id = c.id)
      THEN 1
      ELSE 0
    END AS has_linked_records
  FROM categories c
`;

function mapCategoryRow(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    isArchived: row.is_archived === 1,
    hasLinkedRecords: row.has_linked_records === 1,
  };
}

export function registerCategoriesModule(app: FastifyInstance, db: DbAdapter): void {
  app.get('/api/categories', async (request) => {
    const userId = getRequestUserId(request);
    const query = categoryQuerySchema.parse(request.query);
    const conditions: string[] = ['c.user_id = ?'];
    const params: Array<string | number> = [userId];

    if (query.type) {
      conditions.push('c.type = ?');
      params.push(query.type);
    }
    if (!query.includeArchived) {
      conditions.push('c.is_archived = 0');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const sql = `${SELECT_CATEGORIES_BASE_SQL} ${whereClause} ORDER BY c.is_archived ASC, c.name COLLATE NOCASE ASC`;
    const rows = await db.query<CategoryRow>(sql, params);

    return {
      items: rows.map(mapCategoryRow),
    };
  });

  app.post('/api/categories', async (request, reply) => {
    const userId = getRequestUserId(request);
    const input = createCategorySchema.parse(request.body ?? {});
    const nameNormalized = normalizeCategoryName(input.name);

    const existing = await db.queryOne<{ id: string }>(
      'SELECT id FROM categories WHERE user_id = ? AND type = ? AND name_normalized = ? AND id != ?',
      [userId, input.type, nameNormalized, ''],
    );
    if (existing) {
      return reply.code(409).send({
        error: {
          code: 'CATEGORY_DUPLICATE',
          message: 'Já existe uma categoria deste tipo com este nome.',
        },
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO categories (id, user_id, name, name_normalized, type, color, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, userId, input.name, nameNormalized, input.type, input.color, now, now],
    );

    const created: CategoryDto = {
      id,
      name: input.name,
      type: input.type,
      color: input.color,
      isArchived: false,
      hasLinkedRecords: false,
    };

    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/api/categories/:id', async (request, reply) => {
    const userId = getRequestUserId(request);
    const { id } = request.params;
    const input = updateCategorySchema.parse(request.body ?? {});

    const current = await db.queryOne<CategoryRow>(
      `${SELECT_CATEGORIES_BASE_SQL} WHERE c.id = ? AND c.user_id = ?`,
      [id, userId],
    );
    if (!current) {
      return reply.code(404).send({
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Categoria não encontrada.',
        },
      });
    }

    const nextName = input.name ?? current.name;
    const nextType = input.type ?? current.type;
    const nextColor = input.color ?? current.color;
    const nextIsArchived =
      input.isArchived !== undefined ? (input.isArchived ? 1 : 0) : current.is_archived;

    if (nextType !== current.type && current.has_linked_records === 1) {
      return reply.code(409).send({
        error: {
          code: 'CATEGORY_HAS_LINKS',
          message:
            'O tipo não pode ser alterado porque esta categoria já possui transações ou orçamentos vinculados.',
        },
      });
    }

    const nextNameNormalized = normalizeCategoryName(nextName);
    const duplicate = await db.queryOne<{ id: string }>(
      'SELECT id FROM categories WHERE user_id = ? AND type = ? AND name_normalized = ? AND id != ?',
      [userId, nextType, nextNameNormalized, id],
    );
    if (duplicate) {
      return reply.code(409).send({
        error: {
          code: 'CATEGORY_DUPLICATE',
          message: 'Já existe uma categoria deste tipo com este nome.',
        },
      });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE categories
       SET name = ?, name_normalized = ?, type = ?, color = ?, is_archived = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [nextName, nextNameNormalized, nextType, nextColor, nextIsArchived, now, id, userId],
    );

    const updated = await db.queryOne<CategoryRow>(
      `${SELECT_CATEGORIES_BASE_SQL} WHERE c.id = ? AND c.user_id = ?`,
      [id, userId],
    );
    return reply.code(200).send(mapCategoryRow(updated as CategoryRow));
  });

  app.delete<{ Params: { id: string } }>('/api/categories/:id', async (request, reply) => {
    const userId = getRequestUserId(request);
    const { id } = request.params;
    const current = await db.queryOne<CategoryRow>(
      `${SELECT_CATEGORIES_BASE_SQL} WHERE c.id = ? AND c.user_id = ?`,
      [id, userId],
    );
    if (!current) {
      return reply.code(404).send({
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Categoria não encontrada.',
        },
      });
    }

    if (current.has_linked_records === 1) {
      return reply.code(409).send({
        error: {
          code: 'CATEGORY_HAS_LINKS',
          message:
            'Esta categoria possui transações ou orçamentos vinculados e não pode ser excluída permanentemente. Arquive-a para ocultá-la de novos lançamentos sem perder seu histórico.',
        },
      });
    }

    await db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, userId]);
    return reply.code(204).send();
  });
}
