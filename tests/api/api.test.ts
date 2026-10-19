import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDatabase } from '../../src/server/db/database.js';
import type {
  BudgetProgressDto,
  BudgetsResponseDto,
  CategoryDto,
  DashboardResponseDto,
  PaginatedTransactionsDto,
  TransactionDto,
} from '../../src/shared/contracts/index.js';

describe('Personal Finance API Integration (CA-1 to CA-25)', () => {
  let app: FastifyInstance;
  let authCookie = '';

  beforeEach(async () => {
    app = buildApp({
      env: {
        NODE_ENV: 'test',
        PORT: 0,
        APP_PASSWORD: 'correct-horse-battery',
        SESSION_SECRET: 'test-session-secret-with-at-least-32-characters!!',
        DATABASE_PATH: ':memory:',
      },
    });
    await app.ready();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'correct-horse-battery' },
    });
    const setCookieHeader = loginRes.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    authCookie = (rawCookie ?? '').split(';')[0] ?? '';
  });

  afterEach(async () => {
    await app.close();
  });

  async function getCategories(): Promise<CategoryDto[]> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { cookie: authCookie },
    });
    return (res.json() as { items: CategoryDto[] }).items;
  }

  describe('T-3: Auth, Session & Rate Limiting (CA-1 to CA-5)', () => {
    it('CA-1: authenticates with exact APP_PASSWORD and sets HttpOnly session cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'correct-horse-battery' },
        remoteAddress: '10.0.0.10',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ authenticated: true });
      const setCookie = String(res.headers['set-cookie'] ?? '');
      expect(setCookie).toContain('pf_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
    });

    it('CA-2: rejects wrong password with 401 and "Senha inválida" without setting cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'wrong-password' },
        remoteAddress: '10.0.0.20',
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Senha inválida',
        },
      });
    });

    it('CA-3: blocks 6th login attempt after 5 failures within 15 min with HTTP 429 and retryAfterSeconds', async () => {
      const clientIp = '10.0.0.30';
      for (let i = 0; i < 5; i++) {
        const failRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { password: 'bad-password' },
          remoteAddress: clientIp,
        });
        expect(failRes.statusCode).toBe(401);
      }

      const sixthRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'correct-horse-battery' },
        remoteAddress: clientIp,
      });

      expect(sixthRes.statusCode).toBe(429);
      expect(sixthRes.headers['retry-after']).toBeDefined();
      const body = sixthRes.json() as {
        error: { code: string; message: string; retryAfterSeconds: number };
      };
      expect(body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('CA-4: blocks unauthenticated requests to protected API routes with HTTP 401 while allowing /api/health', async () => {
      const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
      expect(healthRes.statusCode).toBe(200);

      for (const url of [
        '/api/auth/session',
        '/api/categories',
        '/api/transactions?month=10&year=2026',
        '/api/budgets?month=10&year=2026',
        '/api/dashboard?month=10&year=2026',
      ]) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode).toBe(401);
      }
    });

    it('CA-5: logs out by clearing the session cookie and rejects tampered cookies', async () => {
      const sessionBefore = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: authCookie },
      });
      expect(sessionBefore.statusCode).toBe(200);

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: authCookie },
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(String(logoutRes.headers['set-cookie'] ?? '')).toContain('pf_session=;');

      const tamperedRes = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: `${authCookie}tampered` },
      });
      expect(tamperedRes.statusCode).toBe(401);
    });
  });

  describe('T-4: Categories CRUD, Uniqueness & Link Protection (CA-6 to CA-12)', () => {
    it('CA-6 & CA-7: returns seeded categories and creates/updates custom category', async () => {
      const initial = await getCategories();
      expect(initial).toHaveLength(9);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { cookie: authCookie },
        payload: { name: 'Educação', type: 'EXPENSE', color: '#2563eb' },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json() as CategoryDto;
      expect(created.name).toBe('Educação');
      expect(created.color).toBe('#2563EB');
      expect(created.isArchived).toBe(false);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/categories/${created.id}`,
        headers: { cookie: authCookie },
        payload: { name: 'Educação Superior', color: '#1D4ED8' },
      });
      expect(patchRes.statusCode).toBe(200);
      expect((patchRes.json() as CategoryDto).name).toBe('Educação Superior');
    });

    it('CA-8: rejects case-insensitive Unicode duplicate name with 409 and invalid fields with 400', async () => {
      const dupRes = await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { cookie: authCookie },
        payload: { name: '  alimentação ', type: 'EXPENSE', color: '#EA580C' },
      });
      expect(dupRes.statusCode).toBe(409);

      const invalidNameRes = await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { cookie: authCookie },
        payload: { name: 'A', type: 'EXPENSE', color: '#EA580C' },
      });
      expect(invalidNameRes.statusCode).toBe(400);

      const invalidColorRes = await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { cookie: authCookie },
        payload: { name: 'Viagem', type: 'EXPENSE', color: 'blue' },
      });
      expect(invalidColorRes.statusCode).toBe(400);
    });

    it('CA-9, CA-10, CA-11, CA-12: enforces link protection on type change/delete and supports archive/delete', async () => {
      const categories = await getCategories();
      const alimentacao = categories.find((c) => c.name === 'Alimentação');
      expect(alimentacao).toBeDefined();
      if (!alimentacao) return;

      const txRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 3500,
          date: '2026-10-10',
          description: 'Padaria',
          categoryId: alimentacao.id,
        },
      });
      expect(txRes.statusCode).toBe(201);

      const changeTypeRes = await app.inject({
        method: 'PATCH',
        url: `/api/categories/${alimentacao.id}`,
        headers: { cookie: authCookie },
        payload: { type: 'INCOME' },
      });
      expect(changeTypeRes.statusCode).toBe(409);

      const deleteLinkedRes = await app.inject({
        method: 'DELETE',
        url: `/api/categories/${alimentacao.id}`,
        headers: { cookie: authCookie },
      });
      expect(deleteLinkedRes.statusCode).toBe(409);

      const archiveRes = await app.inject({
        method: 'PATCH',
        url: `/api/categories/${alimentacao.id}`,
        headers: { cookie: authCookie },
        payload: { isArchived: true },
      });
      expect(archiveRes.statusCode).toBe(200);
      expect((archiveRes.json() as CategoryDto).isArchived).toBe(true);

      const activeOnlyRes = await app.inject({
        method: 'GET',
        url: '/api/categories?type=EXPENSE&includeArchived=false',
        headers: { cookie: authCookie },
      });
      const activeIds = (activeOnlyRes.json() as { items: CategoryDto[] }).items.map((c) => c.id);
      expect(activeIds).not.toContain(alimentacao.id);

      const createUnlinkedRes = await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { cookie: authCookie },
        payload: { name: 'Temporária', type: 'EXPENSE', color: '#64748B' },
      });
      const unlinked = createUnlinkedRes.json() as CategoryDto;

      const deleteUnlinkedRes = await app.inject({
        method: 'DELETE',
        url: `/api/categories/${unlinked.id}`,
        headers: { cookie: authCookie },
      });
      expect(deleteUnlinkedRes.statusCode).toBe(204);
    });
  });

  describe('T-5: Transactions CRUD, Validation & Pagination (CA-11, CA-13 to CA-17)', () => {
    it('CA-13 & CA-14: persists integer cents and exact civil date, rejecting invalid payloads', async () => {
      const categories = await getCategories();
      const alimentacao = categories.find((c) => c.name === 'Alimentação');
      expect(alimentacao).toBeDefined();
      if (!alimentacao) return;

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 4590,
          date: '2026-10-15',
          description: 'Almoço executivo',
          categoryId: alimentacao.id,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json() as TransactionDto;
      expect(created.amountCents).toBe(4590);
      expect(created.date).toBe('2026-10-15');

      for (const badPayload of [
        {
          type: 'EXPENSE',
          amountCents: 0,
          date: '2026-10-15',
          description: 'Zero',
          categoryId: alimentacao.id,
        },
        {
          type: 'EXPENSE',
          amountCents: -100,
          date: '2026-10-15',
          description: 'Negativo',
          categoryId: alimentacao.id,
        },
        {
          type: 'EXPENSE',
          amountCents: 1000,
          date: '2026-02-30',
          description: 'Data inválida',
          categoryId: alimentacao.id,
        },
        {
          type: 'EXPENSE',
          amountCents: 1000,
          date: '2026-10-15',
          description: '   ',
          categoryId: alimentacao.id,
        },
      ]) {
        const badRes = await app.inject({
          method: 'POST',
          url: '/api/transactions',
          headers: { cookie: authCookie },
          payload: badPayload,
        });
        expect(badRes.statusCode).toBe(400);
      }
    });

    it('CA-11 & CA-15: rejects mismatched category type or archived category on create, but allows editing a transaction keeping its already-linked archived category', async () => {
      const categories = await getCategories();
      const salario = categories.find((c) => c.name === 'Salário');
      const lazer = categories.find((c) => c.name === 'Lazer');
      expect(salario).toBeDefined();
      expect(lazer).toBeDefined();
      if (!salario || !lazer) return;

      const mismatchRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 5000,
          date: '2026-10-15',
          description: 'Erro de tipo',
          categoryId: salario.id,
        },
      });
      expect(mismatchRes.statusCode).toBe(422);

      const txRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 8000,
          date: '2026-10-12',
          description: 'Cinema',
          categoryId: lazer.id,
        },
      });
      const existingTx = txRes.json() as TransactionDto;

      await app.inject({
        method: 'PATCH',
        url: `/api/categories/${lazer.id}`,
        headers: { cookie: authCookie },
        payload: { isArchived: true },
      });

      const newWithArchivedRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 4000,
          date: '2026-10-16',
          description: 'Teatro',
          categoryId: lazer.id,
        },
      });
      expect(newWithArchivedRes.statusCode).toBe(422);

      const updateKeepingArchivedRes = await app.inject({
        method: 'PUT',
        url: `/api/transactions/${existingTx.id}`,
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 8500,
          date: '2026-10-12',
          description: 'Cinema IMAX',
          categoryId: lazer.id,
        },
      });
      expect(updateKeepingArchivedRes.statusCode).toBe(200);
      expect((updateKeepingArchivedRes.json() as TransactionDto).categoryIsArchived).toBe(true);
    });

    it('CA-16 & CA-17: filters by month/year/type/category with accurate pagination metadata and empty state', async () => {
      const categories = await getCategories();
      const alimentacao = categories.find((c) => c.name === 'Alimentação');
      const transporte = categories.find((c) => c.name === 'Transporte');
      const salario = categories.find((c) => c.name === 'Salário');
      if (!alimentacao || !transporte || !salario) return;

      for (let i = 1; i <= 15; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/transactions',
          headers: { cookie: authCookie },
          payload: {
            type: 'EXPENSE',
            amountCents: 1000 * i,
            date: `2026-10-${String(i).padStart(2, '0')}`,
            description: `Refeição ${i}`,
            categoryId: alimentacao.id,
          },
        });
      }

      for (let i = 1; i <= 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/transactions',
          headers: { cookie: authCookie },
          payload: {
            type: 'EXPENSE',
            amountCents: 2000,
            date: '2026-10-10',
            description: `Uber ${i}`,
            categoryId: transporte.id,
          },
        });
        await app.inject({
          method: 'POST',
          url: '/api/transactions',
          headers: { cookie: authCookie },
          payload: {
            type: 'INCOME',
            amountCents: 100000,
            date: '2026-10-05',
            description: `Salário ${i}`,
            categoryId: salario.id,
          },
        });
      }

      for (let i = 1; i <= 10; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/transactions',
          headers: { cookie: authCookie },
          payload: {
            type: 'EXPENSE',
            amountCents: 1500,
            date: '2026-09-15',
            description: `Setembro ${i}`,
            categoryId: alimentacao.id,
          },
        });
      }

      const page1Res = await app.inject({
        method: 'GET',
        url: `/api/transactions?month=10&year=2026&type=EXPENSE&categoryId=${alimentacao.id}&pageSize=10&page=1`,
        headers: { cookie: authCookie },
      });
      expect(page1Res.statusCode).toBe(200);
      const page1 = page1Res.json() as PaginatedTransactionsDto;
      expect(page1.items).toHaveLength(10);
      expect(page1.items[0]?.date).toBe('2026-10-15');
      expect(page1.meta).toEqual({
        totalItems: 15,
        totalPages: 2,
        currentPage: 1,
        pageSize: 10,
      });

      const emptyRes = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=11&year=2026',
        headers: { cookie: authCookie },
      });
      expect(emptyRes.statusCode).toBe(200);
      const emptyBody = emptyRes.json() as PaginatedTransactionsDto;
      expect(emptyBody.items).toHaveLength(0);
      expect(emptyBody.meta.totalItems).toBe(0);
      expect(emptyBody.meta.totalPages).toBe(0);
    });
  });

  describe('T-6: Monthly Budgets & Dashboard Aggregations (CA-18 to CA-25)', () => {
    it('CA-18 & CA-19: upserts and deletes monthly budget for active EXPENSE category and rejects INCOME or <= 0', async () => {
      const categories = await getCategories();
      const alimentacao = categories.find((c) => c.name === 'Alimentação');
      const salario = categories.find((c) => c.name === 'Salário');
      if (!alimentacao || !salario) return;

      const createBudgetRes = await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: alimentacao.id, month: 10, year: 2026, limitCents: 120000 },
      });
      expect(createBudgetRes.statusCode).toBe(200);
      expect((createBudgetRes.json() as BudgetProgressDto).limitCents).toBe(120000);

      const updateBudgetRes = await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: alimentacao.id, month: 10, year: 2026, limitCents: 150000 },
      });
      expect(updateBudgetRes.statusCode).toBe(200);

      const listBudgetsRes = await app.inject({
        method: 'GET',
        url: '/api/budgets?month=10&year=2026',
        headers: { cookie: authCookie },
      });
      const listBudgets = listBudgetsRes.json() as BudgetsResponseDto;
      expect(listBudgets.items).toHaveLength(1);
      expect(listBudgets.items[0]?.limitCents).toBe(150000);

      const incomeBudgetRes = await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: salario.id, month: 10, year: 2026, limitCents: 100000 },
      });
      expect(incomeBudgetRes.statusCode).toBe(422);

      const zeroBudgetRes = await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: alimentacao.id, month: 10, year: 2026, limitCents: 0 },
      });
      expect(zeroBudgetRes.statusCode).toBe(400);

      const budgetId = listBudgets.items[0]?.id;
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/budgets/${budgetId}`,
        headers: { cookie: authCookie },
      });
      expect(deleteRes.statusCode).toBe(204);
    });

    it('CA-20, CA-21, CA-22, CA-23, CA-24, CA-25: computes dashboard KPIs, category shares and exact budget status thresholds', async () => {
      const emptyDashRes = await app.inject({
        method: 'GET',
        url: '/api/dashboard?month=11&year=2026',
        headers: { cookie: authCookie },
      });
      expect(emptyDashRes.statusCode).toBe(200);
      const emptyDash = emptyDashRes.json() as DashboardResponseDto;
      expect(emptyDash.summary).toEqual({
        totalIncomeCents: 0,
        totalExpenseCents: 0,
        netBalanceCents: 0,
        totalBudgetedCents: 0,
        totalBudgetSpentCents: 0,
      });

      const categories = await getCategories();
      const salario = categories.find((c) => c.name === 'Salário');
      const alimentacao = categories.find((c) => c.name === 'Alimentação');
      const saude = categories.find((c) => c.name === 'Saúde');
      const transporte = categories.find((c) => c.name === 'Transporte');
      const lazer = categories.find((c) => c.name === 'Lazer');
      if (!salario || !alimentacao || !saude || !transporte || !lazer) return;

      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'INCOME',
          amountCents: 800000,
          date: '2026-10-05',
          description: 'Salário Mensal',
          categoryId: salario.id,
        },
      });
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 90000,
          date: '2026-10-10',
          description: 'Supermercado',
          categoryId: alimentacao.id,
        },
      });
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 30000,
          date: '2026-10-12',
          description: 'Farmácia',
          categoryId: saude.id,
        },
      });

      await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: alimentacao.id, month: 10, year: 2026, limitCents: 100000 },
      });

      const dashRes = await app.inject({
        method: 'GET',
        url: '/api/dashboard?month=10&year=2026',
        headers: { cookie: authCookie },
      });
      expect(dashRes.statusCode).toBe(200);
      const dash = dashRes.json() as DashboardResponseDto;
      expect(dash.summary).toEqual({
        totalIncomeCents: 800000,
        totalExpenseCents: 120000,
        netBalanceCents: 680000,
        totalBudgetedCents: 100000,
        totalBudgetSpentCents: 90000,
      });

      const expenseBreakdown = dash.categoryBreakdown.filter((b) => b.type === 'EXPENSE');
      expect(expenseBreakdown[0]?.categoryName).toBe('Alimentação');
      expect(expenseBreakdown[0]?.sharePercentage).toBe(75);
      expect(expenseBreakdown[1]?.categoryName).toBe('Saúde');
      expect(expenseBreakdown[1]?.sharePercentage).toBe(25);

      await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: transporte.id, month: 10, year: 2026, limitCents: 50000 },
      });
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 40000,
          date: '2026-10-14',
          description: 'Combustível',
          categoryId: transporte.id,
        },
      });

      await app.inject({
        method: 'PUT',
        url: '/api/budgets',
        headers: { cookie: authCookie },
        payload: { categoryId: lazer.id, month: 10, year: 2026, limitCents: 30000 },
      });
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 30003,
          date: '2026-10-18',
          description: 'Show',
          categoryId: lazer.id,
        },
      });

      const dashWithAlerts = (
        await app.inject({
          method: 'GET',
          url: '/api/dashboard?month=10&year=2026',
          headers: { cookie: authCookie },
        })
      ).json() as DashboardResponseDto;

      expect(dashWithAlerts.budgetProgress[0]?.categoryName).toBe('Lazer');
      expect(dashWithAlerts.budgetProgress[0]?.status).toBe('EXCEEDED');
      expect(dashWithAlerts.budgetProgress[0]?.usagePercentage).toBe(100.01);
      expect(dashWithAlerts.budgetProgress[0]?.remainingCents).toBe(-3);

      const transpProgress = dashWithAlerts.budgetProgress.find(
        (b) => b.categoryName === 'Transporte',
      );
      expect(transpProgress?.status).toBe('WARNING');
      expect(transpProgress?.usagePercentage).toBe(80);
    });

    it('RNF-4: responds in < 200ms for /api/transactions and /api/dashboard with 10,000 stored transactions', async () => {
      const perfDb = createDatabase(':memory:');
      const perfApp = buildApp({
        db: perfDb,
        env: {
          NODE_ENV: 'test',
          PORT: 0,
          APP_PASSWORD: 'correct-horse-battery',
          SESSION_SECRET: 'test-session-secret-with-at-least-32-characters!!',
          DATABASE_PATH: ':memory:',
        },
      });
      await perfApp.ready();

      try {
        const loginRes = await perfApp.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { password: 'correct-horse-battery' },
        });
        const setCookieHeader = loginRes.headers['set-cookie'];
        const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
        const cookie = (rawCookie ?? '').split(';')[0] ?? '';

        const catRows = perfDb
          .prepare('SELECT id, type FROM categories WHERE is_archived = 0')
          .all() as Array<{ id: string; type: 'INCOME' | 'EXPENSE' }>;
        const expenseCatId = catRows.find((c) => c.type === 'EXPENSE')?.id ?? '';
        const incomeCatId = catRows.find((c) => c.type === 'INCOME')?.id ?? '';

        const insertStmt = perfDb.prepare(
          `INSERT INTO transactions (
            id, type, amount_cents, date, year, month, description, category_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        perfDb.exec('BEGIN IMMEDIATE TRANSACTION;');
        const now = '2026-10-19T12:00:00.000Z';
        for (let i = 0; i < 10000; i += 1) {
          const isIncome = i % 5 === 0;
          const month = (i % 12) + 1;
          const day = (i % 28) + 1;
          const dateStr = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          insertStmt.run(
            `perf-tx-${i}`,
            isIncome ? 'INCOME' : 'EXPENSE',
            1500 + (i % 5000),
            dateStr,
            2026,
            month,
            `Lancamento #${i}`,
            isIncome ? incomeCatId : expenseCatId,
            now,
            now,
          );
        }
        perfDb.exec('COMMIT;');

        const txStart = performance.now();
        const txRes = await perfApp.inject({
          method: 'GET',
          url: '/api/transactions?month=10&year=2026&page=1&pageSize=20',
          headers: { cookie },
        });
        const txDurationMs = performance.now() - txStart;
        expect(txRes.statusCode).toBe(200);
        expect(txDurationMs).toBeLessThan(200);

        const dashStart = performance.now();
        const dashRes = await perfApp.inject({
          method: 'GET',
          url: '/api/dashboard?month=10&year=2026',
          headers: { cookie },
        });
        const dashDurationMs = performance.now() - dashStart;
        expect(dashRes.statusCode).toBe(200);
        expect(dashDurationMs).toBeLessThan(200);
      } finally {
        await perfApp.close();
        perfDb.close();
      }
    });

    it('Multi-User Isolation: registers a separate account with its own seeded categories and isolated transactions/dashboard', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Maria',
          username: 'maria',
          password: 'maria-password-123',
        },
      });
      expect(regRes.statusCode).toBe(201);
      const setCookie = regRes.headers['set-cookie'];
      const rawMariaCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const mariaCookie = (rawMariaCookie ?? '').split(';')[0] ?? '';

      const mariaCatsRes = await app.inject({
        method: 'GET',
        url: '/api/categories',
        headers: { cookie: mariaCookie },
      });
      const mariaCats = (mariaCatsRes.json() as { items: CategoryDto[] }).items;
      expect(mariaCats).toHaveLength(9);

      const mariaSalary = mariaCats.find((c) => c.name === 'Salário');
      expect(mariaSalary).toBeDefined();

      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: mariaCookie },
        payload: {
          type: 'INCOME',
          amountCents: 650000,
          date: '2026-10-10',
          description: 'Salário Maria',
          categoryId: mariaSalary?.id ?? '',
        },
      });

      const defaultDash = (
        await app.inject({
          method: 'GET',
          url: '/api/dashboard?month=10&year=2026',
          headers: { cookie: authCookie },
        })
      ).json() as DashboardResponseDto;
      expect(defaultDash.summary.totalIncomeCents).toBe(0);

      const mariaDash = (
        await app.inject({
          method: 'GET',
          url: '/api/dashboard?month=10&year=2026',
          headers: { cookie: mariaCookie },
        })
      ).json() as DashboardResponseDto;
      expect(mariaDash.summary.totalIncomeCents).toBe(650000);
    });
  });

  describe('T-14: Status de Pagamento e Contas Recorrentes (CA-26 a CA-32)', () => {
    it('CA-26 & CA-27: toggles payment status between PAID and PENDING via PATCH /api/transactions/:id/status', async () => {
      const categories = await getCategories();
      const moradia = categories.find((c) => c.name === 'Moradia');
      expect(moradia).toBeDefined();

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 150000,
          date: '2026-10-10',
          description: 'Aluguel Outubro',
          categoryId: moradia?.id,
          status: 'PENDING',
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json() as TransactionDto;
      expect(created.status).toBe('PENDING');

      const patchToPaid = await app.inject({
        method: 'PATCH',
        url: `/api/transactions/${created.id}/status`,
        headers: { cookie: authCookie },
        payload: { status: 'PAID' },
      });
      expect(patchToPaid.statusCode).toBe(200);
      expect((patchToPaid.json() as TransactionDto).status).toBe('PAID');

      const patchBackToPending = await app.inject({
        method: 'PATCH',
        url: `/api/transactions/${created.id}/status`,
        headers: { cookie: authCookie },
        payload: { status: 'PENDING' },
      });
      expect(patchBackToPending.statusCode).toBe(200);
      expect((patchBackToPending.json() as TransactionDto).status).toBe('PENDING');
    });

    it('CA-28, CA-29 & CA-30: creates 12 subsequent monthly transactions when isRecurring is true', async () => {
      const categories = await getCategories();
      const moradia = categories.find((c) => c.name === 'Moradia');
      expect(moradia).toBeDefined();

      const recRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 200000,
          date: '2026-10-15',
          description: 'Condomínio',
          categoryId: moradia?.id,
          status: 'PAID',
          isRecurring: true,
          recurrenceEndDate: '2027-10-15',
        },
      });
      expect(recRes.statusCode).toBe(201);
      const initial = recRes.json() as TransactionDto;
      expect(initial.isRecurring).toBe(true);
      expect(initial.status).toBe('PAID');
      expect(initial.recurringGroupId).toBeDefined();

      const nextMonthRes = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=11&year=2026',
        headers: { cookie: authCookie },
      });
      const nextMonthData = nextMonthRes.json() as PaginatedTransactionsDto;
      const novTx = nextMonthData.items.find((t) => t.description === 'Condomínio');
      expect(novTx).toBeDefined();
      expect(novTx?.date).toBe('2026-11-15');
      expect(novTx?.status).toBe('PENDING');
      expect(novTx?.isRecurring).toBe(true);
      expect(novTx?.recurringGroupId).toBe(initial.recurringGroupId);

      const oneYearRes = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=10&year=2027',
        headers: { cookie: authCookie },
      });
      const oneYearData = oneYearRes.json() as PaginatedTransactionsDto;
      const oct27Tx = oneYearData.items.find((t) => t.description === 'Condomínio');
      expect(oct27Tx).toBeDefined();
      expect(oct27Tx?.date).toBe('2027-10-15');
      expect(oct27Tx?.status).toBe('PENDING');
    });

    it('CA-31: filters transactions by status and provides pendingSummary', async () => {
      const categories = await getCategories();
      const alimentacao = categories.find((c) => c.name === 'Alimentação');
      expect(alimentacao).toBeDefined();

      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 5000,
          date: '2026-10-01',
          description: 'Restaurante Pago',
          categoryId: alimentacao?.id,
          status: 'PAID',
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 7500,
          date: '2026-10-02',
          description: 'Restaurante Pendente',
          categoryId: alimentacao?.id,
          status: 'PENDING',
        },
      });

      const pendingOnly = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=10&year=2026&status=PENDING',
        headers: { cookie: authCookie },
      });
      expect(pendingOnly.statusCode).toBe(200);
      const pendingData = pendingOnly.json() as PaginatedTransactionsDto;
      expect(pendingData.items.every((t) => t.status === 'PENDING')).toBe(true);
      expect(pendingData.pendingSummary?.pendingExpenseCents).toBeGreaterThanOrEqual(7500);
      expect(pendingData.pendingSummary?.pendingExpenseCount).toBeGreaterThanOrEqual(1);
    });

    it('CA-32: deletes following occurrences of a recurring group with scope=following', async () => {
      const categories = await getCategories();
      const moradia = categories.find((c) => c.name === 'Moradia');
      expect(moradia).toBeDefined();

      const recRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { cookie: authCookie },
        payload: {
          type: 'EXPENSE',
          amountCents: 12000,
          date: '2026-10-05',
          description: 'Internet Fibra',
          categoryId: moradia?.id,
          status: 'PAID',
          isRecurring: true,
          recurrenceEndDate: '2027-02-05',
        },
      });
      const initial = recRes.json() as TransactionDto;

      const decRes = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=12&year=2026',
        headers: { cookie: authCookie },
      });
      const decTx = (decRes.json() as PaginatedTransactionsDto).items.find(
        (t) => t.recurringGroupId === initial.recurringGroupId,
      );
      expect(decTx).toBeDefined();

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/transactions/${decTx?.id}?scope=following`,
        headers: { cookie: authCookie },
      });
      expect(deleteRes.statusCode).toBe(204);

      const checkOctRes = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=10&year=2026',
        headers: { cookie: authCookie },
      });
      const octItems = (checkOctRes.json() as PaginatedTransactionsDto).items;
      expect(octItems.some((t) => t.id === initial.id)).toBe(true);

      const checkJanRes = await app.inject({
        method: 'GET',
        url: '/api/transactions?month=1&year=2027',
        headers: { cookie: authCookie },
      });
      const janItems = (checkJanRes.json() as PaginatedTransactionsDto).items;
      expect(janItems.some((t) => t.recurringGroupId === initial.recurringGroupId)).toBe(false);
    });
  });
});
