#!/bin/bash
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5414 > /tmp/a14.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5414/ && break; sleep 1; done
curl -s http://localhost:5414/ > /tmp/today.html
echo "http: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5414/)"
echo "plan-row count: $(grep -o "class=\"plan-row \"" /tmp/today.html | wc -l)"
echo "empty line: $(grep -o 'Nothing due today[^<]*' /tmp/today.html | head -1)"
echo "count chip: $(grep -o 'count-chip">[^<]*' /tmp/today.html | head -3 | tr '\n' ' ')"
echo "tasks card: $(grep -o 'Today you complete</span><div class="mx-value">[^<]*' /tmp/today.html | head -1)"
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f fake-notion 2>/dev/null
