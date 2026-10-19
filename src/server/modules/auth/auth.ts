import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  type UserDto,
  loginRequestSchema,
  registerRequestSchema,
} from '../../../shared/contracts/index.js';
import { normalizeCategoryName } from '../../../shared/domain/money.js';
import type { AppEnv } from '../../config/env.js';
import { DEFAULT_USER_ID, seedDefaultCategories } from '../../db/database.js';

const SESSION_COOKIE_NAME = 'pf_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

interface RateLimitEntry {
  failures: number;
  windowStartMs: number;
}

interface SessionPayload {
  readonly userId: string;
  readonly name: string;
  readonly username: string;
  readonly iatMs: number;
  readonly exp: number;
}

interface UserRow {
  id: string;
  name: string;
  username: string;
  password_hash: string;
}

const requestUserMap = new WeakMap<FastifyRequest, UserDto>();

export function getRequestUserId(request: FastifyRequest): string {
  return requestUserMap.get(request)?.id ?? DEFAULT_USER_ID;
}

function comparePasswordsConstantTime(inputPassword: string, expectedPassword: string): boolean {
  const inputDigest = createHash('sha256').update(inputPassword, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expectedPassword, 'utf8').digest();
  return timingSafeEqual(inputDigest, expectedDigest);
}

function hashUserPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyUserPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) {
    return false;
  }
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(keyHex, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}

function signSessionToken(user: UserDto, secret: string, nowMs: number = Date.now()): string {
  const nowSec = Math.floor(nowMs / 1000);
  const payload: SessionPayload = {
    userId: user.id,
    name: user.name,
    username: user.username,
    iatMs: nowMs,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signatureB64 = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signatureB64}`;
}

function verifySessionToken(
  token: string | undefined,
  secret: string,
  revokedBeforeMs: number,
  nowMs: number = Date.now(),
): UserDto | null {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) {
    return null;
  }

  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  const providedSig = Buffer.from(signatureB64, 'base64url');
  if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    const nowSec = Math.floor(nowMs / 1000);
    if (
      typeof decoded.exp !== 'number' ||
      decoded.exp <= nowSec ||
      typeof decoded.iatMs !== 'number' ||
      decoded.iatMs <= revokedBeforeMs
    ) {
      return null;
    }
    return {
      id: typeof decoded.userId === 'string' ? decoded.userId : DEFAULT_USER_ID,
      name: typeof decoded.name === 'string' ? decoded.name : 'Conta Principal',
      username: typeof decoded.username === 'string' ? decoded.username : 'admin',
    };
  } catch {
    return null;
  }
}

export function registerAuthModule(app: FastifyInstance, env: AppEnv, db: DatabaseSync): void {
  const attemptsByIp = new Map<string, RateLimitEntry>();
  const isSecureCookie = env.NODE_ENV === 'production';
  let revokedBeforeMs = 0;

  const findUserByUsernameStmt = db.prepare(
    'SELECT id, name, username, password_hash FROM users WHERE username_normalized = ?',
  );
  const insertUserStmt = db.prepare(
    'INSERT INTO users (id, name, username, username_normalized, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  app.get('/api/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  app.post('/api/auth/register', async (request, reply) => {
    const input = registerRequestSchema.parse(request.body ?? {});
    const usernameNorm = normalizeCategoryName(input.username);

    const existing = findUserByUsernameStmt.get(usernameNorm) as UserRow | undefined;
    if (existing || usernameNorm === 'admin') {
      return reply.code(409).send({
        error: {
          code: 'USERNAME_CONFLICT',
          message: 'Este usuário já está em uso. Faça login ou escolha outro identificador.',
        },
      });
    }

    const userId = randomUUID();
    const nowIso = new Date().toISOString();
    const passwordHash = hashUserPassword(input.password);

    insertUserStmt.run(
      userId,
      input.name.trim(),
      input.username.trim(),
      usernameNorm,
      passwordHash,
      nowIso,
    );

    seedDefaultCategories(db, userId);

    const user: UserDto = {
      id: userId,
      name: input.name.trim(),
      username: input.username.trim(),
    };

    const nowMs = Date.now();
    const tokenIssuedAtMs = Math.max(nowMs, revokedBeforeMs + 1);
    const token = signSessionToken(user, env.SESSION_SECRET, tokenIssuedAtMs);
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureCookie,
      maxAge: SESSION_TTL_SECONDS,
    });

    return reply.code(201).send({ authenticated: true, user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';
    const nowMs = Date.now();

    if (attemptsByIp.size > 1000) {
      for (const [ipKey, entry] of attemptsByIp.entries()) {
        if (nowMs - entry.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
          attemptsByIp.delete(ipKey);
        }
      }
    }

    const existingEntry = attemptsByIp.get(clientIp);

    if (existingEntry && nowMs - existingEntry.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      attemptsByIp.delete(clientIp);
    }

    const activeEntry = attemptsByIp.get(clientIp);
    if (activeEntry && activeEntry.failures >= MAX_LOGIN_ATTEMPTS) {
      const remainingMs = activeEntry.windowStartMs + RATE_LIMIT_WINDOW_MS - nowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

      reply.header('Retry-After', String(retryAfterSeconds));
      return reply.code(429).send({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: `Muitas tentativas de acesso. Por segurança, aguarde ${retryMinutes} minutos antes de tentar novamente.`,
          retryAfterSeconds,
        },
      });
    }

    const body = loginRequestSchema.parse(request.body ?? {});
    const usernameNorm = body.username ? normalizeCategoryName(body.username) : 'admin';

    let authenticatedUser: UserDto | null = null;

    if (usernameNorm !== 'admin') {
      const dbUser = findUserByUsernameStmt.get(usernameNorm) as UserRow | undefined;
      if (dbUser && verifyUserPassword(body.password, dbUser.password_hash)) {
        authenticatedUser = {
          id: dbUser.id,
          name: dbUser.name,
          username: dbUser.username,
        };
      }
    } else if (comparePasswordsConstantTime(body.password, env.APP_PASSWORD)) {
      authenticatedUser = {
        id: DEFAULT_USER_ID,
        name: 'Conta Principal',
        username: 'admin',
      };
    }

    if (!authenticatedUser) {
      if (!activeEntry) {
        attemptsByIp.set(clientIp, { failures: 1, windowStartMs: nowMs });
      } else {
        activeEntry.failures += 1;
      }

      return reply.code(401).send({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Senha inválida',
        },
      });
    }

    attemptsByIp.delete(clientIp);
    seedDefaultCategories(db, authenticatedUser.id);

    const tokenIssuedAtMs = Math.max(nowMs, revokedBeforeMs + 1);
    const token = signSessionToken(authenticatedUser, env.SESSION_SECRET, tokenIssuedAtMs);
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureCookie,
      maxAge: SESSION_TTL_SECONDS,
    });

    return reply.code(200).send({ authenticated: true, user: authenticatedUser });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    revokedBeforeMs = Math.max(Date.now(), revokedBeforeMs + 1);
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureCookie,
    });
    return reply.code(200).send({ authenticated: false });
  });

  app.get('/api/auth/session', async (request) => {
    const user = requestUserMap.get(request) ?? {
      id: DEFAULT_USER_ID,
      name: 'Conta Principal',
      username: 'admin',
    };
    return { authenticated: true, user };
  });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (!pathname.startsWith('/api/')) {
      return;
    }
    if (
      pathname === '/api/health' ||
      pathname === '/api/auth/login' ||
      pathname === '/api/auth/register' ||
      pathname === '/api/auth/logout'
    ) {
      return;
    }

    const token = request.cookies[SESSION_COOKIE_NAME];
    const user = verifySessionToken(token, env.SESSION_SECRET, revokedBeforeMs);
    if (!user) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sessão não autenticada ou expirada.',
        },
      });
    }
    requestUserMap.set(request, user);
  });
}
