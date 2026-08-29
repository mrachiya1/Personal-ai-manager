#!/bin/bash
# Drives multi-level sub-tasks, rollup progress and thumbnails.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
export OREX_STORE_PATH="/tmp/orex-tree-qa.db"
rm -f "$OREX_STORE_PATH"
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5414 > /tmp/tree.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5414/ && break; sleep 1; done
QA_BASE=http://localhost:5414 node qa/it-tree.mjs
rc=$?
echo "--- server errors: $(grep -c '⨯' /tmp/tree.log) ---"
pkill -f "next-server" 2>/dev/null; pkill -f fake-notion 2>/dev/null
exit $rc
