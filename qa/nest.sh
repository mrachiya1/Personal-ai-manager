#!/bin/bash
# Building a deep breakdown through the UI — the add path, not the render path.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null
for port in 5417 5300; do fuser -k -n tcp $port 2>/dev/null; done
sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5417 > /tmp/nest.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5417/projects && break; sleep 1; done
QA_BASE=http://localhost:5417 node qa/it-nest.mjs
rc=$?
echo "--- server errors: $(grep -c '⨯' /tmp/nest.log) ---"
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f fake-notion 2>/dev/null
for port in 5417 5300; do fuser -k -n tcp $port 2>/dev/null; done
exit $rc
