/**
 * Local development runner for UrbanFlow Edge Gateway Worker
 * Runs the fetch handler in Node.js on port 8787 with SQLite / in-memory fallback
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Automatically load .env if present
try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
} catch {
  // Ignore missing or malformed .env
}

import worker from '../packages/edge/dist/index.js';

const env = {
  EVP_HMAC_SECRET: process.env.EVP_HMAC_SECRET || 'local_development_secret_32_characters_long',
  META_API_KEY: process.env.META_API_KEY || '',
  META_MODEL: process.env.META_MODEL || 'muse-spark-1.3',
  META_API_BASE: process.env.META_API_BASE || 'https://api.meta.ai/v1',
  AI_DAILY_CAP: process.env.AI_DAILY_CAP || '1500',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173',
};

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || 'localhost:8787';
    const url = new URL(req.url, `http://${host}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const item of v) headers.append(k, item);
      } else if (v) {
        headers.set(k, v);
      }
    }

    const request = new Request(url.href, {
      method: req.method,
      headers,
      body,
      // @ts-ignore
      duplex: 'half',
    });

    const response = await worker.fetch(request, env, {});
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    const resBody = await response.arrayBuffer();
    res.end(Buffer.from(resBody));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: String(err) } }));
  }
});

const PORT = 8787;
server.listen(PORT, () => {
  console.log(`[UrbanFlow Edge] Gateway running on http://localhost:${PORT}`);
});
