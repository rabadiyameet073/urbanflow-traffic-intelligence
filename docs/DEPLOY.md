# UrbanFlow AI — Deployment Guide

## 1. Edge Gateway (Cloudflare Workers)

Deploy the serverless Edge Gateway to Cloudflare Workers:

```bash
cd packages/edge
# Set secret keys
wrangler secret put META_API_KEY
wrangler secret put EVP_HMAC_SECRET

# Deploy Worker & SQLite Durable Object
wrangler deploy
```

Verify deployment:
```bash
curl https://urbanflow-edge.<your-subdomain>.workers.dev/api/health
```

## 2. Web Application (Cloudflare Pages or Vercel)

Build the static frontend bundle:
```bash
pnpm --filter @urbanflow/web build
```
The output directory is `packages/web/dist/`.

Deploy via Wrangler Pages:
```bash
npx wrangler pages deploy packages/web/dist --project-name=urbanflow-ai
```

## 3. Streaming Pipeline (Docker Mode)

Start Kafka and Apache Spark:
```bash
cd pipeline
make up
make demo
```
