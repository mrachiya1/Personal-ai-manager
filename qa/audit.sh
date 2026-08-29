#!/bin/bash
# The site-wide UI audit: clipped overlays, contrast, surface drift,
# horizontal scroll, tap targets, tiny type — every route, both themes.
#
# This runs with auth OFF (no AUTH_SECRET), which is why /login is skipped
# here as a redirect. The login page is audited by qa/auth.sh instead.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next start" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null
# pkill matches on the command line; `next start` execs a child whose name is
# neither. Freeing the port by port is the only reliable version.
for port in 5414 5300; do fuser -k -n tcp $port 2>/dev/null; done
sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5414 > /tmp/audit.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5414/ && break; sleep 1; done
QA_BASE=http://localhost:5414 node qa/audit-ui.mjs
rc=$?
echo "--- server errors: $(grep -c '⨯' /tmp/audit.log) ---"
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f fake-notion 2>/dev/null
for port in 5414 5300; do fuser -k -n tcp $port 2>/dev/null; done
exit $rc
