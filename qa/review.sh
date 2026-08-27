#!/bin/bash
# Renders every screen against the stand-in Notion and screenshots them.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh

pkill -9 -f fake-notion 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
sleep 2

node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
head -1 /tmp/fake.log

npx next start --port 5400 > /tmp/app.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5400/ && break; sleep 1; done

echo "--- route status ---"
for p in / /projects /finance /finance/slips /clients /companies /payments /team /render-queue /ideas /learning /daily-logs /sleep /rules /astro-lab /advisor /settings; do
  printf "%-16s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:5400$p")"
done

node qa/shots.mjs
echo "--- server errors: $(grep -c '⨯' /tmp/app.log) ---"
grep -A3 '⨯' /tmp/app.log | head -20
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f fake-notion 2>/dev/null
