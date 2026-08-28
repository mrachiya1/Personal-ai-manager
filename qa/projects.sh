#!/bin/bash
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5416 > /tmp/proj.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5416/projects && break; sleep 1; done
QA_BASE=http://localhost:5416 node qa/it-projects.mjs
echo "--- server errors: $(grep -c '⨯' /tmp/proj.log) ---"
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f fake-notion 2>/dev/null
