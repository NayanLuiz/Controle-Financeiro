import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type NeonQueryFunction, neon } from '@neondatabase/serverless';
import type { EntryType } from '../../shared/contracts/index.js';
import { normalizeCategoryName } from '../../shared/domain/money.js';

export const DEFAULT_USER_ID = 'default-user';

export interface DbAdapter {
  readonly isPostgres: boolean;
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  queryOne<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function translateSqlToPostgres(sql: string): string {
  let paramIndex = 1;
  let inString = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
    } else if (char === '?' && !inString) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result.replace(/COLLATE\s+NOCASE/gi, '');
}

export class SqliteDbAdapter implements DbAdapter {
  public readonly isPostgres = false;

  constructor(public readonly rawDb: DatabaseSync) {}

  public async query<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.rawDb
      .prepare(sql)
      .all(...(params as Array<string | number | bigint | null | Uint8Array>)) as T[];
  }

  public async queryOne<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const row = this.rawDb
      .prepare(sql)
      .get(...(params as Array<string | number | bigint | null | Uint8Array>));
    return (row as T) ?? null;
  }

  public async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const result = this.rawDb
      .prepare(sql)
      .run(...(params as Array<string | number | bigint | null | Uint8Array>));
    return { changes: Number(result.changes) };
  }

  public async exec(sql: string): Promise<void> {
    this.rawDb.exec(sql);
  }

  public async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    this.rawDb.exec('BEGIN IMMEDIATE');
    try {
      const res = await fn(this);
      this.rawDb.exec('COMMIT');
      return res;
    } catch (err) {
      this.rawDb.exec('ROLLBACK');
      throw err;
    }
  }

  public async close(): Promise<void> {
    this.rawDb.close();
  }
}

export class NeonDbAdapter implements DbAdapter {
  public readonly isPostgres = true;
  private readonly client: NeonQueryFunction<false, false>;

  constructor(connectionString: string) {
    this.client = neon(connectionString);
  }

  public async query<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const pgSql = translateSqlToPostgres(sql);
    const rows = await this.client.query(pgSql, params as unknown[]);
    return rows as T[];
  }

  public async queryOne<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  public async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const pgSql = translateSqlToPostgres(sql);
    const result = await this.client.query(pgSql, params as unknown[], { fullResults: true });
    return { changes: result.rowCount ?? (Array.isArray(result.rows) ? result.rows.length : 1) };
  }

  public async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await this.client.query(statement);
    }
  }

  public async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  public async close(): Promise<void> {
    // Stateless HTTP client, no connection to close
  }
}

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

const POSTGRES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  date TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PAID',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurring_group_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  limit_cents BIGINT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category_id, year, month)
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default-user';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default-user';
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default-user';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PAID';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_group_id TEXT NULL;
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

export async function seedDefaultCategoriesForAdapter(
  db: DbAdapter,
  userId: string = DEFAULT_USER_ID,
): Promise<void> {
  const countRow = await db.queryOne<{ total: number | string | bigint }>(
    'SELECT COUNT(*) AS total FROM categories WHERE user_id = ?',
    [userId],
  );
  const total = Number(countRow?.total ?? 0);
  if (total > 0) {
    return;
  }

  const now = new Date().toISOString();
  for (const category of DEFAULT_CATEGORIES) {
    await db.run(
      `INSERT INTO categories (
        id,
        user_id,
        name,
        name_normalized,
        type,
        color,
        is_archived,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        randomUUID(),
        userId,
        category.name,
        normalizeCategoryName(category.name),
        category.type,
        category.color,
        now,
        now,
      ],
    );
  }
}

export async function initDatabase(db: DbAdapter, userId: string = DEFAULT_USER_ID): Promise<void> {
  if (db.isPostgres) {
    await db.exec(POSTGRES_SCHEMA_SQL);
    await db.exec(INDEXES_SQL);
    await seedDefaultCategoriesForAdapter(db, userId);
    return;
  }

  if (db instanceof SqliteDbAdapter) {
    runMigrations(db.rawDb);
    seedDefaultCategories(db.rawDb, userId);
  }
}

export function createDatabaseAdapter(params: {
  databasePath?: string;
  databaseUrl?: string;
}): DbAdapter {
  if (
    params.databaseUrl &&
    (params.databaseUrl.startsWith('postgres://') || params.databaseUrl.startsWith('postgresql://'))
  ) {
    return new NeonDbAdapter(params.databaseUrl);
  }

  const dbPath = params.databasePath ?? './data/finance.db';
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db);
  seedDefaultCategories(db, DEFAULT_USER_ID);

  return new SqliteDbAdapter(db);
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
