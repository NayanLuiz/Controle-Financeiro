import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/server/app.js';

const app = buildApp();
let isReady = false;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isReady) {
    await app.ready();
    isReady = true;
  }

  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  await new Promise<void>((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    app.server.emit('request', req, res);
  });
}
