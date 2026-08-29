#!/bin/bash
# The login system, on a server with auth actually switched on.
#
# AUTH_SECRET is what enables logins, so this suite sets one — the other QA
# scripts deliberately leave it unset and run in single-user local mode.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
export AUTH_SECRET="qa-only-secret-not-used-anywhere-else-0000"
export OREX_STORE_PATH="/tmp/orex-auth-qa.db"
rm -f "$OREX_STORE_PATH"
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5415 > /tmp/auth.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5415/login && break; sleep 1; done
QA_BASE=http://localhost:5415 node qa/it-auth.mjs
rc=$?
echo "--- server errors: $(grep -c '⨯' /tmp/auth.log) ---"
pkill -f "next-server" 2>/dev/null; pkill -f fake-notion 2>/dev/null
exit $rc
