# Skill: api-design

**Use when:** Adding or changing an HTTP or WebSocket endpoint.

**Read first:** `backend-engineering/22`, Rule 12

## Rules

1. Resource-oriented paths under `/api/v1/`; JSON only; versioned schemas.
2. Error envelope `{error:{code,message,requestId,details?}}`; codes from the catalogue.
3. Idempotency for POST where retry is possible (`Idempotency-Key`).
4. Document every route in `docs/API.md` with example and schema; generate JSON Schema.
5. Limit sizes, counts and depth; reject unknown fields on signed payloads.
6. Return `Retry-After` on 429.

## Good / Bad

- ✅ `POST /api/v1/evp/requests` → `202 {requestId}`
- ❌ Returning stack traces or raw zod errors.

## Landmines

- Never echo user input in error messages unescaped.
