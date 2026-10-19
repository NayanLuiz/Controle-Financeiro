import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { type AppEnv, loadEnv } from './config/env.js';
import {
  type DbAdapter,
  SqliteDbAdapter,
  createDatabaseAdapter,
  initDatabase,
} from './db/database.js';
import { registerAuthModule } from './modules/auth/auth.js';
import { registerBudgetsModule } from './modules/budgets/budgets.js';
import { registerCategoriesModule } from './modules/categories/categories.js';
import { registerDashboardModule } from './modules/dashboard/dashboard.js';
import { registerTransactionsModule } from './modules/transactions/transactions.js';

export interface BuildAppOptions {
  readonly env?: Partial<AppEnv>;
  readonly db?: DbAdapter | DatabaseSync;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const baseEnv = loadEnv();
  const env: AppEnv = {
    ...baseEnv,
    ...options.env,
  };

  let db: DbAdapter;
  let ownsDatabase = false;

  if (options.db) {
    if ('query' in options.db) {
      db = options.db;
    } else {
      db = new SqliteDbAdapter(options.db);
    }
  } else {
    db = createDatabaseAdapter({
      databasePath: env.DATABASE_PATH,
      databaseUrl: env.DATABASE_URL,
    });
    ownsDatabase = true;
  }

  const app = Fastify({
    logger: env.NODE_ENV === 'production',
    trustProxy: true,
  });

  app.register(fastifyCookie);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message ?? 'Dados de entrada inválidos.',
          details: error.flatten().fieldErrors,
        },
      });
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;

    return reply.code(statusCode).send({
      error: {
        code: statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
        message:
          statusCode === 400
            ? 'Requisição malformada.'
            : 'Ocorreu um erro interno ao processar a solicitação.',
      },
    });
  });

  app.addHook('onReady', async () => {
    await initDatabase(db);
  });

  registerAuthModule(app, env, db);
  registerCategoriesModule(app, db);
  registerTransactionsModule(app, db);
  registerBudgetsModule(app, db);
  registerDashboardModule(app, db);

  const clientDistPath = resolve(process.cwd(), 'dist/client');
  if (env.NODE_ENV !== 'test' && existsSync(clientDistPath)) {
    app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Rota da API não encontrada.',
          },
        });
      }
      return reply.sendFile('index.html');
    });
  }

  let isDbClosed = false;
  app.addHook('onClose', async () => {
    if (ownsDatabase && !isDbClosed) {
      isDbClosed = true;
      await db.close();
    }
  });

  return app;
}
