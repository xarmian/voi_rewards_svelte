#!/usr/bin/env bash
# Pre-deploy check for the fetch-market-data edge function (TASK-47).
#
# Serves the REAL supabase/functions/fetch-market-data/index.ts under the edge runtime's Deno major
# against a local PostgREST stub, calls it once, and passes only if the response reports
# snapshots_count > 0 AND the stub received exactly that many rows.
#
# Why: on 2026-10-30 a deploy that passed every unit test inserted 0 rows in prod. The Supabase edge
# runtime runs Deno 1.x, where a timer called with a foreign `this` throws "Illegal invocation"; the
# tests ran on Deno 2. Run this at the commit you are about to deploy, before `supabase functions deploy`.
#
# Usage: scripts/precheck-fetch-market-data.sh [deno-major]   (default 1 = the edge runtime's major)
# Needs: npx (downloads deno@<major>), python3, curl, network access to the market sources.
set -u
DENO_MAJOR=${1:-1} # Supabase edge runtime: Deno 1.x
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
STUB_PORT=${STUB_PORT:-58471}
INSERTS=$WORK/inserts.log
SERVE_LOG=$WORK/serve.log
: > "$INSERTS"

python3 -I "$ROOT/scripts/postgrest-stub.py" "$STUB_PORT" "$INSERTS" &
STUB_PID=$!
cd "$ROOT/supabase/functions/fetch-market-data" || exit 1
# setsid gives the function its own process group, so cleanup also stops the deno child npx spawns.
SUPABASE_URL=http://127.0.0.1:$STUB_PORT SUPABASE_SERVICE_ROLE_KEY=precheck \
	setsid npx -y "deno@$DENO_MAJOR" run --no-lock --no-config -A index.ts > "$SERVE_LOG" 2>&1 &
FN_PID=$!
cleanup() {
	kill -- "-$FN_PID" 2>/dev/null
	kill "$STUB_PID" 2>/dev/null
}
trap cleanup EXIT

# std/http serve() listens on :8000.
for _ in $(seq 1 90); do
	grep -q "Listening" "$SERVE_LOG" && break
	sleep 2
done
RESPONSE=$(curl -s -m 60 -X POST http://localhost:8000/ -d '{}')
ROWS=$(python3 -I -c '
import json, sys
total = 0
for line in open(sys.argv[1]):
    path, body = line.split("\t", 1)
    if "market_snapshots" in path:
        total += len(json.loads(body))
print(total)' "$INSERTS" 2>/dev/null)
# A count only counts on a success response.
COUNT=$(printf '%s' "$RESPONSE" | python3 -I -c 'import json, sys; r = json.load(sys.stdin); print(r.get("snapshots_count", 0) if r.get("success") is True else 0)' 2>/dev/null)

echo "deno@$DENO_MAJOR response: $RESPONSE"
echo "rows received by the stub: ${ROWS:-0}"
grep -aE "Source |timed out" "$SERVE_LOG" | cut -c1-160
echo "serve log: $SERVE_LOG"
if [ "${COUNT:-0}" -gt 0 ] && [ "${ROWS:-0}" = "$COUNT" ]; then
	echo "PRECHECK=PASS"
else
	echo "PRECHECK=FAIL"
	exit 1
fi
