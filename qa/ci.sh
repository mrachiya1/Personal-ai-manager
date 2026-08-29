#!/bin/bash
# Typecheck and build, in one place, so a run is one command.
set -u
cd "$(dirname "$0")/.."
echo "--- tsc ---"
npx tsc --noEmit
echo "tsc exit=$?"
echo "--- build ---"
npm run build 2>&1 | tail -6
