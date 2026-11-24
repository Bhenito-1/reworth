#!/usr/bin/env bash
# ReWorth payments dry run.
#
#   bash scripts/dry-run/run.sh            # setup + mock PSP + Paystack test mode (automated)
#   bash scripts/dry-run/run.sh mock       # setup + mock PSP only (automated)
#   bash scripts/dry-run/run.sh paystack   # setup + Paystack test mode only (automated)
#   bash scripts/dry-run/run.sh manual            # setup, then leave the app running to click through (mock payments)
#   bash scripts/dry-run/run.sh manual paystack   # same, with real Paystack test-mode checkouts
#   SKIP_SETUP=1 ...                       # reuse running infra/DB/build
#   KEEP_UP=1 ...                          # leave everything running at the end
#
# Uses its own Docker project (reworth-dryrun, ports 55432/56379, tmpfs) and a
# fresh database. Your .env is read but never changed. Output: scripts/dry-run/out/.
# In manual mode, move the clock with: bash scripts/dry-run/clock.sh help
set -u
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
DR="$REPO/scripts/dry-run"
OUT="$DR/out"
export DRYRUN_OUT="$OUT"
PHASES="${1:-all}"
MANUAL_PSP="${2:-mock}"
mkdir -p "$OUT"
LOG="$OUT/run.log"
: > "$LOG"

say() { printf '\n\033[1m[dry-run] %s\033[0m\n' "$*" | tee -a "$LOG"; }
fail() { say "FAILED: $*"; echo "FAILED: $*" > "$OUT/status.txt"; exit 1; }
status() { echo "$(date -u +%FT%TZ) $*" > "$OUT/status.txt"; }

PNPM="pnpm"
command -v pnpm >/dev/null 2>&1 || PNPM="corepack pnpm"
COMPOSE="docker compose -f $DR/docker-compose.yml"

PSP=mock
# shellcheck source=/dev/null
. "$DR/env.sh"

PIDS=""
cleanup() {
  if [ "${KEEP_UP:-0}" = "1" ]; then
    say "KEEP_UP=1: leaving servers and infra running (pids:$PIDS)"
    return
  fi
  for p in $PIDS; do kill "$p" 2>/dev/null; done
  sleep 1
  for p in $PIDS; do kill -9 "$p" 2>/dev/null; done
  # next dev spawns children; free the ports explicitly.
  for port in 3100 3101 3102; do
    lsof -ti tcp:$port 2>/dev/null | xargs kill 2>/dev/null
  done
  $COMPOSE down -v >/dev/null 2>&1
  rm -f "$OUT/manual-psp" 2>/dev/null
  say "Stopped servers and removed the dry-run containers."
}
trap cleanup EXIT
trap 'exit 130' INT TERM

wait_http() { # url seconds
  local i=0
  while [ "$i" -lt "$2" ]; do
    curl -s -o /dev/null -m 3 "$1" && return 0
    sleep 1; i=$((i + 1))
  done
  return 1
}

start_api() { # psp
  lsof -ti tcp:3101 2>/dev/null | xargs kill 2>/dev/null
  (cd apps/api && PAYMENTS_PROVIDER="$1" exec node dist/main.js) > "$OUT/api-$1.log" 2>&1 &
  API_PID=$!
  PIDS="$PIDS $API_PID"
  wait_http "http://localhost:3101/api/v1/healthz" 90 || {
    tail -40 "$OUT/api-$1.log" | tee -a "$LOG"
    fail "API ($1) did not become healthy; see out/api-$1.log"
  }
  say "API up with PAYMENTS_PROVIDER=$1"
}
stop_api() {
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null
  sleep 2
  lsof -ti tcp:3101 2>/dev/null | xargs kill 2>/dev/null
  API_PID=""
}
run_runner() { # psp
  status "runner $1 starting"
  (cd apps/api && PAYMENTS_PROVIDER="$1" node "$DR/runner.mjs" --psp "$1") 2>&1 | tee -a "$LOG"
  return "${PIPESTATUS[0]}"
}

# ---------- setup ----------
{
  echo "date: $(date)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null) ($(git status --porcelain | wc -l | tr -d ' ') changed files uncommitted)"
  echo "node: $(node -v)  pnpm: $($PNPM -v 2>/dev/null)"
  echo "docker: $(docker --version 2>/dev/null)"
  case "${NODE_OPTIONS:-}" in *experimental-require-module*)
    echo "note: node $(node -v) needs --experimental-require-module for otplib; enabled for this run";;
  esac
} | tee "$OUT/env.txt" | tee -a "$LOG"

if [ "$PHASES" = "manual" ] || [ "$PHASES" = "paystack" ] || [ "$PHASES" = "all" ]; then
  if [ "$PHASES" != "manual" ] || [ "$MANUAL_PSP" = "paystack" ]; then
    grep -qE '^PAYSTACK_SECRET_KEY=sk_test_' .env || {
      [ "$PHASES" = "manual" ] && fail "manual paystack needs PAYSTACK_SECRET_KEY=sk_test_… in .env (refusing anything else)"
    }
  fi
fi

if [ "${SKIP_SETUP:-0}" != "1" ]; then
  status "setup"
  docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker Desktop and re-run."
  [ -f .env ] || fail "No .env at the repo root."
  [ -d node_modules ] || { say "Installing dependencies"; $PNPM install 2>&1 | tee -a "$LOG" || fail "pnpm install"; }

  say "Starting throwaway Postgres + Redis (project reworth-dryrun)"
  $COMPOSE down -v >/dev/null 2>&1
  $COMPOSE up -d 2>&1 | tee -a "$LOG" || fail "docker compose up"
  i=0
  until $COMPOSE exec -T postgres pg_isready -U reworth -d reworth_dryrun >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 60 ] && fail "Postgres did not start"; sleep 1
  done

  say "Migrating + seeding the dry-run database"
  $PNPM db:deploy 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" = 0 ] || fail "prisma migrate deploy"
  $PNPM db:seed 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" = 0 ] || fail "db seed"
  SEED_STAGING_SKIP_HEAVY=1 $PNPM seed:staging 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" = 0 ] || fail "seed:staging"

  say "Building the API (current working tree)"
  $PNPM --filter @reworth/api build 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" = 0 ] || fail "API build"
fi

say "Starting web (3100) and admin (3102)"
lsof -ti tcp:3100 2>/dev/null | xargs kill 2>/dev/null
lsof -ti tcp:3102 2>/dev/null | xargs kill 2>/dev/null
($PNPM --filter @reworth/web exec next dev -p 3100) > "$OUT/web.log" 2>&1 &
PIDS="$PIDS $!"
($PNPM --filter @reworth/admin exec next dev -p 3102) > "$OUT/admin.log" 2>&1 &
PIDS="$PIDS $!"

# ---------- manual mode: leave it all running ----------
if [ "$PHASES" = "manual" ]; then
  start_api "$MANUAL_PSP"
  echo "$MANUAL_PSP" > "$OUT/manual-psp"
  say "Warming up web and admin (first page compile takes a minute)"
  wait_http "http://localhost:3100/" 180 || say "web not answering yet (see out/web.log)"
  wait_http "http://localhost:3102/" 120 || say "admin not answering yet (see out/admin.log)"
  status "MANUAL running psp=$MANUAL_PSP"
  cat <<EOF | tee -a "$LOG"

  ReWorth is running for manual testing  (payments: $MANUAL_PSP)

    Web app      http://localhost:3100
    Admin        http://localhost:3102
    API health   http://localhost:3101/api/v1/healthz

    Seller  ori@demo.reworth.ng       / DemoOri!2026
    Buyer   ayo@demo.reworth.ng       / DemoAyo!2026
    Admin   dryrun-admin@reworth.test / DryRun!Admin2026

    Move the clock / run background jobs (in a second Terminal tab):
      bash scripts/dry-run/clock.sh help

    Fresh, throwaway database. Press Ctrl+C here to stop everything
    and delete it.

EOF
  while kill -0 "$API_PID" 2>/dev/null; do sleep 5; done
  say "API stopped unexpectedly; see out/api-$MANUAL_PSP.log"
  exit 1
fi

MOCK_RC=skip
PS_RC=skip
if [ "$PHASES" = "all" ] || [ "$PHASES" = "mock" ]; then
  start_api mock
  wait_http "http://localhost:3100/" 120 || say "web not answering yet (see out/web.log)"
  wait_http "http://localhost:3102/" 60 || say "admin not answering yet (see out/admin.log)"
  say "Phase 1: mock PSP scenarios"
  run_runner mock; MOCK_RC=$?
  stop_api
fi
if [ "$PHASES" = "all" ] || [ "$PHASES" = "paystack" ]; then
  start_api paystack
  say "Phase 2: Paystack test-mode scenarios (pay the checkouts it prints in a browser)"
  run_runner paystack; PS_RC=$?
  stop_api
fi

{
  echo "# ReWorth payments dry run"
  echo
  sed 's/^/    /' "$OUT/env.txt"
  echo
  [ -f "$OUT/report-mock.md" ] && [ "$MOCK_RC" != skip ] && cat "$OUT/report-mock.md"
  [ -f "$OUT/report-paystack.md" ] && [ "$PS_RC" != skip ] && cat "$OUT/report-paystack.md"
} > "$OUT/report.md"
status "FINISHED mock=$MOCK_RC paystack=$PS_RC"
say "Finished. mock=$MOCK_RC paystack=$PS_RC — report: scripts/dry-run/out/report.md"
