#!/bin/bash
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh
pkill -f fake-notion 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2
node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
sleep 2
npx next start --port 5500 > /tmp/app.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5500/ && break; sleep 1; done

echo "--- resolved database map (as the app sees it) ---"
curl -s http://localhost:5500/api/notion/databases | head -c 900
echo; echo

echo "--- payments page: does it contain fixture data? ---"
curl -s http://localhost:5500/payments | grep -o "Northwind — film[^<]*" | head -3
echo "grep count for 'Northwind' on /payments: $(curl -s http://localhost:5500/payments | grep -c Northwind)"
echo "grep count for 'Northwind' on /:         $(curl -s http://localhost:5500/ | grep -c Northwind)"
echo
echo "--- requests the stand-in actually received ---"
grep -c "" /tmp/fake.log
pkill -f "next-server" 2>/dev/null; pkill -f fake-notion 2>/dev/null
