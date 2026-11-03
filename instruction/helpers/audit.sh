#!/usr/bin/env bash
# UrbanFlow grep audits (module 62 §3). Usage: bash helpers/audit.sh [repo-root]
# Exit 0 = every audit clean; 1 = at least one finding; 2 = usage error.
# A finding on a line carrying "AUDIT-OK(" is accepted (human-reviewed justification).
set -euo pipefail
IFS=$'\n\t'

root="${1:-.}"
[[ -d "$root" ]] || { echo "Usage: $0 [repo-root]" >&2; exit 2; }
cd "$root"

fail=0
EXCL=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.wrangler)

# run <id> <description> <command...>: prints findings (minus AUDIT-OK lines); marks failure if any.
run() {
  local id="$1" desc="$2"; shift 2
  local out
  out="$("$@" 2>/dev/null | grep -v 'AUDIT-OK(' || true)"
  if [[ -n "$out" ]]; then
    echo "FAIL $id: $desc"
    echo "$out" | sed 's/^/    /'
    fail=1
  else
    echo "PASS $id: $desc"
  fi
}

exists() { [[ -e "$1" ]]; }

# A1 nondeterminism in core
run A1 "no Math.random/Date/timers in core" \
  grep -rnE 'Math\.random|Date\.now|new Date\(|performance\.now|setTimeout|setInterval' packages/core/src "${EXCL[@]}" --include='*.ts' --exclude='*.test.ts'
# A2 platform leaks into core
run A2 "no platform APIs in core" \
  grep -rnE "from '(node:|fs|path|crypto)|document\.|window\.|fetch\(" packages/core/src "${EXCL[@]}" --include='*.ts' --exclude='*.test.ts'
# A3 non-portable math in sim/control
run A3 "no transcendental Math.* or ** in sim/control" \
  grep -rnE 'Math\.(pow|exp|log|sin|cos|tan|atan2?)\(|[A-Za-z0-9_)\]] ?\*\* ?[A-Za-z0-9_(]' packages/core/src/sim packages/core/src/control "${EXCL[@]}" --include='*.ts' --exclude='*.test.ts'
# A4 controllers writing signal state
a4() { grep -rnE 'signalState\s*=[^=]|\.phase\s*=[^=]' packages/core/src/control "${EXCL[@]}" --include='*.ts' --exclude='*.test.ts' | grep -v '/kernel/'; }
run A4 "only the Kernel writes SignalState" a4
# A5 any / ts-ignore
run A5 "no any / @ts-ignore" \
  grep -rnE ':\s*any\b|\bas any\b|@ts-ignore' packages "${EXCL[@]}" --include='*.ts'
# A6 secrets patterns
run A6 "no secret-like strings" \
  grep -rnIE '(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|Bearer [A-Za-z0-9._-]{20,}|hf_[A-Za-z0-9]{20,})' . "${EXCL[@]}"
# A7 model output parsed without validation
a7() { grep -rnE 'JSON\.parse\(.*(completion|choices|content)' packages/edge packages/web "${EXCL[@]}" --include='*.ts' | grep -v -E 'safeParse|Schema'; }
run A7 "LLM output validated before use" a7
# A8 raw colours outside tokens
a8() { grep -rnE '#[0-9A-Fa-f]{3,8}\b' packages/web/src "${EXCL[@]}" --include='*.ts' --include='*.css' | grep -v -E 'tokens|\.test\.'; }
run A8 "no raw colours outside tokens" a8
# A9 inline handlers/styles
run A9 "no inline handlers or style attributes" \
  grep -rnE 'onclick=|onload=|style="' packages/web/index.html packages/web/src "${EXCL[@]}"
# A10 console.log in shipped code
a10() { grep -rn 'console\.log' packages/*/src "${EXCL[@]}" --include='*.ts' | grep -v -E '\.test\.|/bench/|/cli'; }
run A10 "no console.log in shipped code" a10
# A11 TODO/FIXME without task id
run A11 "TODO/FIXME carry a task id" \
  grep -rnP '(TODO|FIXME)(?!\(T[0-9]+\))' packages docs "${EXCL[@]}" --include='*.ts' --include='*.md' --include='*.py'
# A12 unsupported superlatives in public docs
run A12 "no unsupported superlatives" \
  grep -rniE 'production-ready|blazing|revolutionary|100 ?% safe|guaranteed' README.md docs "${EXCL[@]}" --include='*.md'
# A13 analytics/tracking
run A13 "no analytics/tracking SDKs" \
  grep -rniE 'google-analytics|gtag\(|mixpanel|hotjar|sentry\.io|segment\.com' packages package.json "${EXCL[@]}"
# A14 forbidden vendors
run A14 "no non-approved model vendors" \
  grep -rniE 'api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis' packages docs "${EXCL[@]}"

# grep returns 2 when a path does not exist; the run() wrapper treats that as "no findings"
# so audits are safe to run early in the project before every package exists.
if exists packages/core; then :; else echo "NOTE: packages/core not found; core audits had nothing to scan."; fi

if [[ "$fail" -eq 0 ]]; then echo "audit: all clean"; else echo "audit: FAILED"; fi
exit "$fail"
