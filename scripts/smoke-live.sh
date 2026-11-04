#!/usr/bin/env bash
# Pre-submission smoke test for a deployed UrbanFlow AI instance.
#
# Checks the things a judge will hit first: the page loads, the health route
# answers with the documented shape, security headers are present, the cache
# policy is what we claim, and an unknown route is a 404 rather than a crash.
#
# Usage:
#   bash scripts/smoke-live.sh --url https://urbanflow-ai.pages.dev
#   bash scripts/smoke-live.sh --url https://urbanflow-edge.example.workers.dev --api
#
# Exit code 0 means every check passed. Non-zero means at least one failed and
# the failing check is named in the output. Do not mark the audit item done
# without pasting this output into docs/validation/AUDIT_LOG.md.

set -uo pipefail

URL=""
API_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --api) API_ONLY=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$URL" ]; then
  echo "usage: $0 --url <base-url> [--api]" >&2
  exit 2
fi

BASE="${URL%/}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf '  PASS  %-46s %s\n' "$name" "$actual"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %-46s expected %s, got %s\n' "$name" "$expected" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qi -- "$needle"; then
    printf '  PASS  %-46s contains %s\n' "$name" "$needle"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %-46s missing %s\n' "$name" "$needle"
    FAIL=$((FAIL + 1))
  fi
}

code() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"
}

echo "Smoke test: $BASE"
echo

if [ "$API_ONLY" -eq 0 ]; then
  echo "Page"
  check "GET /" "200" "$(code "$BASE/")"
  BODY="$(curl -s --max-time 15 "$BASE/")"
  contains "GET / includes app markup" "urbanflow" "$BODY"
fi

echo
echo "Health"
HEALTH_CODE="$(code "$BASE/api/health")"
check "GET /api/health" "200" "$HEALTH_CODE"
if [ "$HEALTH_CODE" = "200" ]; then
  HEALTH="$(curl -s --max-time 15 "$BASE/api/health")"
  for field in '"status"' '"version"' '"time"' '"aiProviders"' '"budget"' '"aiCostUsdToday"'; do
    contains "health field $field" "$field" "$HEALTH"
  done
  contains "health cache policy" "max-age=5" "$(curl -sI --max-time 15 "$BASE/api/health")"
fi

echo
echo "Error contract"
check "GET /api/does-not-exist" "404" "$(code "$BASE/api/does-not-exist")"
check "POST /api/health (wrong method)" "405" "$(code -X POST "$BASE/api/health")"

echo
echo "Headers"
HEADERS="$(curl -sI --max-time 15 "$BASE/api/health")"
contains "X-Content-Type-Options" "nosniff" "$HEADERS"
contains "X-Robots-Tag" "noindex" "$HEADERS"
contains "CSP present" "content-security-policy" "$HEADERS"

echo
echo "CORS refuses an unlisted origin"
CORS_HEADERS="$(curl -sI --max-time 15 -H 'Origin: https://evil.example' "$BASE/api/health")"
if printf '%s' "$CORS_HEADERS" | grep -qi 'access-control-allow-origin'; then
  printf '  FAIL  %-46s ACAO must be absent for an unlisted origin\n' "CORS allow-list"
  FAIL=$((FAIL + 1))
else
  printf '  PASS  %-46s no ACAO for unlisted origin\n' "CORS allow-list"
  PASS=$((PASS + 1))
fi

echo
echo "Summary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
