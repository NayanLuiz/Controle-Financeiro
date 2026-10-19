import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loginRequestSchema } from '../../../shared/contracts/index.js';
import type { AppEnv } from '../../config/env.js';

const SESSION_COOKIE_NAME = 'pf_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

interface RateLimitEntry {
  failures: number;
  windowStartMs: number;
}

interface SessionPayload {
  readonly iatMs: number;
  readonly exp: number;
}

function comparePasswordsConstantTime(inputPassword: string, expectedPassword: string): boolean {
  const inputDigest = createHash('sha256').update(inputPassword, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expectedPassword, 'utf8').digest();
  return timingSafeEqual(inputDigest, expectedDigest);
}

function signSessionToken(secret: string, nowMs: number = Date.now()): string {
  const nowSec = Math.floor(nowMs / 1000);
  const payload: SessionPayload = {
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
): boolean {
  if (!token) {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }
  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) {
    return false;
  }

  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  const providedSig = Buffer.from(signatureB64, 'base64url');
  if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
    return false;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    const nowSec = Math.floor(nowMs / 1000);
    return (
      typeof decoded.exp === 'number' &&
      decoded.exp > nowSec &&
      typeof decoded.iatMs === 'number' &&
      decoded.iatMs > revokedBeforeMs
    );
  } catch {
    return false;
  }
}

export function registerAuthModule(app: FastifyInstance, env: AppEnv): void {
  const attemptsByIp = new Map<string, RateLimitEntry>();
  const isSecureCookie = env.NODE_ENV === 'production';
  let revokedBeforeMs = 0;

  app.get('/api/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
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

    if (!comparePasswordsConstantTime(body.password, env.APP_PASSWORD)) {
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

    const tokenIssuedAtMs = Math.max(nowMs, revokedBeforeMs + 1);
    const token = signSessionToken(env.SESSION_SECRET, tokenIssuedAtMs);
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureCookie,
      maxAge: SESSION_TTL_SECONDS,
    });

    return reply.code(200).send({ authenticated: true });
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

  app.get('/api/auth/session', async () => {
    return { authenticated: true };
  });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (!pathname.startsWith('/api/')) {
      return;
    }
    if (
      pathname === '/api/health' ||
      pathname === '/api/auth/login' ||
      pathname === '/api/auth/logout'
    ) {
      return;
    }

    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!verifySessionToken(token, env.SESSION_SECRET, revokedBeforeMs)) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sessão não autenticada ou expirada.',
        },
      });
    }
  });
}
