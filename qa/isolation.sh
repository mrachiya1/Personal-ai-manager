#!/bin/bash
# Multi-tenant isolation: two accounts, two Notion workspaces, one server.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
# Auth on, and a per-run store so a previous run's accounts can't mask a bug.
export AUTH_SECRET="qa-isolation-secret-not-a-real-one-0123456789"
export AUTH_URL="http://localhost:5417"
export OREX_STORE_PATH="/tmp/orex-isolation-$(date +%s).db"
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5417 > /tmp/iso.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5417/login && break; sleep 1; done
QA_BASE=http://localhost:5417 node qa/it-isolation.mjs
CODE=$?
echo "--- server errors: $(grep -c '⨯' /tmp/iso.log) ---"
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f fake-notion 2>/dev/null
exit $CODE
