import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EntryType } from '../../shared/contracts/index.js';
import { normalizeCategoryName } from '../../shared/domain/money.js';

export const DEFAULT_USER_ID = 'default-user';

interface DefaultCategorySeed {
  readonly name: string;
  readonly type: EntryType;
  readonly color: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategorySeed[] = [
  { name: 'Salário', type: 'INCOME', color: '#059669' },
  { name: 'Rendimentos', type: 'INCOME', color: '#0D9488' },
  { name: 'Outras Receitas', type: 'INCOME', color: '#0284C7' },
  { name: 'Alimentação', type: 'EXPENSE', color: '#EA580C' },
  { name: 'Moradia', type: 'EXPENSE', color: '#2563EB' },
  { name: 'Transporte', type: 'EXPENSE', color: '#7C3AED' },
  { name: 'Saúde', type: 'EXPENSE', color: '#E11D48' },
  { name: 'Lazer', type: 'EXPENSE', color: '#D97706' },
  { name: 'Outras Despesas', type: 'EXPENSE', color: '#475569' },
];

const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 50),
  name_normalized TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  color TEXT NOT NULL CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 1 AND amount_cents <= 99999999999),
  date TEXT NOT NULL CHECK (length(date) = 10),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 120),
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'PENDING')),
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1)),
  recurring_group_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  limit_cents INTEGER NOT NULL CHECK (limit_cents >= 1 AND limit_cents <= 99999999999),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category_id, year, month)
);
`;

const INDEXES_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_type_name_norm
  ON categories (user_id, type, name_normalized);

CREATE INDEX IF NOT EXISTS idx_categories_type_archived
  ON categories (user_id, type, is_archived);

CREATE INDEX IF NOT EXISTS idx_transactions_period_sort
  ON transactions (year, month, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_period_sort
  ON transactions (user_id, year, month, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_period_status
  ON transactions (user_id, year, month, status);

CREATE INDEX IF NOT EXISTS idx_transactions_recurring_group
  ON transactions (recurring_group_id);

CREATE INDEX IF NOT EXISTS idx_transactions_period_type_category
  ON transactions (year, month, type, category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON transactions (category_id);

CREATE INDEX IF NOT EXISTS idx_budgets_period
  ON budgets (year, month, category_id);
`;

function ensureColumnExists(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(INITIAL_SCHEMA_SQL);
  ensureColumnExists(db, 'categories', 'user_id', "TEXT NOT NULL DEFAULT 'default-user'");
  ensureColumnExists(db, 'transactions', 'user_id', "TEXT NOT NULL DEFAULT 'default-user'");
  ensureColumnExists(db, 'budgets', 'user_id', "TEXT NOT NULL DEFAULT 'default-user'");
  ensureColumnExists(db, 'transactions', 'status', "TEXT NOT NULL DEFAULT 'PAID'");
  ensureColumnExists(db, 'transactions', 'is_recurring', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumnExists(db, 'transactions', 'recurring_group_id', 'TEXT NULL');
  db.exec('DROP INDEX IF EXISTS idx_categories_type_name_norm;');
  db.exec(INDEXES_SQL);
}

export function seedDefaultCategories(db: DatabaseSync, userId: string = DEFAULT_USER_ID): void {
  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM categories WHERE user_id = ?');
  const row = countStmt.get(userId) as { total: number | bigint } | undefined;
  const total = Number(row?.total ?? 0);

  if (total > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO categories (
      id,
      user_id,
      name,
      name_normalized,
      type,
      color,
      is_archived,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const category of DEFAULT_CATEGORIES) {
      insertStmt.run(
        randomUUID(),
        userId,
        category.name,
        normalizeCategoryName(category.name),
        category.type,
        category.color,
        now,
        now,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db);
  seedDefaultCategories(db, DEFAULT_USER_ID);

  return db;
}
