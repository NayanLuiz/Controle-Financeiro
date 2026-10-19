import { z } from 'zod';

const DEFAULT_DEV_SECRET = 'dev-session-secret-must-be-at-least-32-chars!!';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  DATABASE_PATH: z.string().trim().min(1).default('./data/finance.db'),
});

export interface AppEnv {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly PORT: number;
  readonly APP_PASSWORD: string;
  readonly SESSION_SECRET: string;
  readonly DATABASE_PATH: string;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = rawEnvSchema.parse(raw);

  const appPassword = parsed.APP_PASSWORD?.trim() ?? '';
  if (
    parsed.NODE_ENV === 'production' &&
    (appPassword.length < 4 || appPassword === 'change-me-strong-password')
  ) {
    throw new Error(
      'APP_PASSWORD must be configured with a non-placeholder password of at least 4 characters in production.',
    );
  }

  const sessionSecret = parsed.SESSION_SECRET?.trim() ?? '';
  if (
    parsed.NODE_ENV === 'production' &&
    (sessionSecret.length < 32 || sessionSecret === 'change-me-32-chars-minimum-secret-key')
  ) {
    throw new Error(
      'SESSION_SECRET must be configured with a non-placeholder secret of at least 32 characters in production.',
    );
  }

  return {
    NODE_ENV: parsed.NODE_ENV,
    PORT: parsed.PORT,
    APP_PASSWORD: appPassword.length > 0 ? appPassword : 'admin123',
    SESSION_SECRET: sessionSecret.length >= 32 ? sessionSecret : DEFAULT_DEV_SECRET,
    DATABASE_PATH: parsed.DATABASE_PATH,
  };
}
