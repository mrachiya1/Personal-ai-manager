#!/bin/bash
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5400 > /tmp/app.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5400/projects && break; sleep 1; done
node qa/interact.mjs
pkill -f "next-server" 2>/dev/null; pkill -f fake-notion 2>/dev/null
