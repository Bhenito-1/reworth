#!/usr/bin/env bash
# Time machine for manual testing. Run while `run.sh manual` is up.
#   bash scripts/dry-run/clock.sh help
cd "$(dirname "$0")/../.."
DR="$(pwd)/scripts/dry-run"
export DRYRUN_OUT="$DR/out"
if [ ! -f "$DR/out/manual-psp" ]; then
  echo "Start the app first: bash scripts/dry-run/run.sh manual"
  exit 1
fi
PSP="$(cat "$DR/out/manual-psp")"
# shellcheck source=/dev/null
. "$DR/env.sh"
cd apps/api && exec node "$DR/clock.mjs" "$@"
