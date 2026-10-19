import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function startServer(): Promise<void> {
  const env = loadEnv();
  const app = buildApp({ env });

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
