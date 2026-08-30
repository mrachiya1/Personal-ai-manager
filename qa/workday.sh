#!/bin/bash
# The work window and the Google Calendar push, against a stand-in Google.
#
# A throwaway RSA key is generated per run and handed to both sides: the app
# signs with the private half, the stand-in verifies with the public half. So
# "the JWT is built correctly" is checked rather than assumed — which matters
# more here than anywhere else in the suite, because the real Google has never
# been reachable from this sandbox and never will be.
set -u
cd "$(dirname "$0")/.."
. ./qa/env.sh

pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f fake-google 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null
for port in 5418 5302 5300; do fuser -k -n tcp $port 2>/dev/null; done
sleep 2

KEYDIR=$(mktemp -d)
openssl genrsa -out "$KEYDIR/key.pem" 2048 2>/dev/null
openssl rsa -in "$KEYDIR/key.pem" -pubout -out "$KEYDIR/pub.pem" 2>/dev/null

export GOOGLE_SERVICE_ACCOUNT_EMAIL="qa-bot@orex-qa.iam.gserviceaccount.com"
export GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="$(cat "$KEYDIR/key.pem")"
export GOOGLE_CALENDAR_ID="qa@orex.example"
export GOOGLE_TOKEN_URL="http://localhost:5302/token"
export GOOGLE_CALENDAR_BASE="http://localhost:5302"
# The store has to be fresh, or yesterday's window decides today's assertions.
export OREX_STORE_PATH="/tmp/orex-workday-qa.db"
rm -f "$OREX_STORE_PATH"

node qa/fake-notion.mjs 5300 > /tmp/fake.log 2>&1 &
node qa/fake-google.mjs 5302 "$KEYDIR/pub.pem" > /tmp/fake-google.log 2>&1 &
sleep 2
head -1 /tmp/fake-google.log

npx next start --port 5418 > /tmp/workday.log 2>&1 &
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:5418/ && break; sleep 1; done

QA_BASE=http://localhost:5418 QA_GOOGLE=http://localhost:5302 node qa/it-workday.mjs
rc=$?

echo "--- server errors: $(grep -c '⨯' /tmp/workday.log) ---"
grep -A3 '⨯' /tmp/workday.log | head -12
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f fake-notion 2>/dev/null; pkill -9 -f fake-google 2>/dev/null
for port in 5418 5302 5300; do fuser -k -n tcp $port 2>/dev/null; done
rm -rf "$KEYDIR"
exit $rc
