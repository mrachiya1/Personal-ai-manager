#!/bin/bash
# Drives the full-system UI control engine: state injection, the four mutation
# tools, refusal of bad input, and the live page update behind the chat.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
export OPENROUTER_API_KEY="qa-stand-in"
export OPENROUTER_API_BASE_URL="http://localhost:5301"
export OREX_STORE_PATH="/tmp/orex-assistant-qa.db"
rm -f "$OREX_STORE_PATH"
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f fake-openrouter 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
node qa/fake-openrouter.mjs 5301 /tmp/or-requests.jsonl > /tmp/fake-or.log 2>&1 &
sleep 2
npx next start --port 5413 > /tmp/assistant.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5413/ && break; sleep 1; done
QA_BASE=http://localhost:5413 QA_OR_LOG=/tmp/or-requests.jsonl node qa/it-assistant.mjs
rc=$?
echo "--- server errors: $(grep -c '⨯' /tmp/assistant.log) ---"
pkill -f "next-server" 2>/dev/null; pkill -f fake-notion 2>/dev/null; pkill -f fake-openrouter 2>/dev/null
exit $rc
