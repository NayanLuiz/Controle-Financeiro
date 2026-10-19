import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  NeonDbAdapter,
  SqliteDbAdapter,
  createDatabase,
  createDatabaseAdapter,
  runMigrations,
  seedDefaultCategories,
  translateSqlToPostgres,
} from '../../src/server/db/database.js';

describe('SQLite persistence layer, migrations, indexes and idempotent seed (T-2)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('CA-6: seeds the 9 default active categories (3 INCOME, 6 EXPENSE) idempotently without duplicates', () => {
    seedDefaultCategories(db);
    seedDefaultCategories(db);
    runMigrations(db);

    const rows = db
      .prepare(
        'SELECT name, name_normalized, type, color, is_archived FROM categories ORDER BY type ASC, name ASC',
      )
      .all() as Array<{
      name: string;
      name_normalized: string;
      type: string;
      color: string;
      is_archived: number;
    }>;

    expect(rows).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(rows).toHaveLength(9);

    const incomeRows = rows.filter((row) => row.type === 'INCOME');
    const expenseRows = rows.filter((row) => row.type === 'EXPENSE');

    expect(incomeRows).toHaveLength(3);
    expect(expenseRows).toHaveLength(6);

    for (const row of rows) {
      expect(row.is_archived).toBe(0);
      expect(row.color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('enforces foreign_keys ON and ON DELETE RESTRICT when category is linked to transactions or budgets', () => {
    const fkPragma = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fkPragma.foreign_keys).toBe(1);

    const category = db
      .prepare("SELECT id FROM categories WHERE type = 'EXPENSE' LIMIT 1")
      .get() as { id: string };

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO transactions (
        id, type, amount_cents, date, year, month, description, category_id, created_at, updated_at
      ) VALUES (?, 'EXPENSE', 4590, '2026-10-15', 2026, 10, 'Almoço', ?, ?, ?)`,
    ).run(randomUUID(), category.id, now, now);

    expect(() => {
      db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
    }).toThrow();
  });

  it('RNF-4: uses composite indexes for monthly transaction listing and dashboard aggregations without full table scan', () => {
    const listingPlan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id, type, amount_cents, date, description, category_id, created_at
         FROM transactions
         WHERE year = ? AND month = ?
         ORDER BY date DESC, created_at DESC
         LIMIT 20 OFFSET 0`,
      )
      .all(2026, 10) as Array<{ detail: string }>;

    const listingDetails = listingPlan.map((step) => step.detail).join(' | ');
    expect(listingDetails).toContain('idx_transactions_period_sort');
    expect(listingDetails).not.toContain('SCAN transactions');

    const aggregationPlan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT type, category_id, SUM(amount_cents) AS total_cents
         FROM transactions
         WHERE year = ? AND month = ? AND type = ?
         GROUP BY category_id`,
      )
      .all(2026, 10, 'EXPENSE') as Array<{ detail: string }>;

    const aggregationDetails = aggregationPlan.map((step) => step.detail).join(' | ');
    expect(aggregationDetails).toContain('idx_transactions_period_type_category');
    expect(aggregationDetails).not.toContain('SCAN transactions');
  });
});

describe('Database Adapter and Postgres Translation (Neon / Vercel)', () => {
  it('translates ? parameters into $1, $2, etc., and strips COLLATE NOCASE for Postgres', () => {
    const sql =
      "SELECT * FROM categories WHERE user_id = ? AND type = ? AND name != 'What?' ORDER BY name COLLATE NOCASE ASC";
    const translated = translateSqlToPostgres(sql);

    expect(translated).toBe(
      "SELECT * FROM categories WHERE user_id = $1 AND type = $2 AND name != 'What?' ORDER BY name  ASC",
    );
  });

  it('creates NeonDbAdapter when databaseUrl starts with postgres:// or postgresql://', () => {
    const adapter = createDatabaseAdapter({
      databaseUrl: 'postgresql://user:password@ep-cool-project.us-east-2.aws.neon.tech/neondb',
    });

    expect(adapter).toBeInstanceOf(NeonDbAdapter);
    expect(adapter.isPostgres).toBe(true);
  });

  it('creates SqliteDbAdapter when databaseUrl is absent', async () => {
    const adapter = createDatabaseAdapter({
      databasePath: ':memory:',
    });

    expect(adapter).toBeInstanceOf(SqliteDbAdapter);
    expect(adapter.isPostgres).toBe(false);

    const categories = await adapter.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE is_archived = 0',
    );
    expect(categories.length).toBe(9);

    const single = await adapter.queryOne<{ total: number }>(
      'SELECT COUNT(*) as total FROM categories',
    );
    expect(single?.total).toBe(9);

    const runResult = await adapter.run('UPDATE categories SET updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      categories[0]?.id,
    ]);
    expect(runResult.changes).toBe(1);

    await adapter.close();
  });
});
