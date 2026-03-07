#!/usr/bin/env bash

# This script simulates a CI environment running LintBase checks.
# It uses the `multirent` database service account key.

echo "============================================"
echo "▶ Running CI Database Health Check..."
echo "============================================"

# We route the output through npx tsx natively, just like a user would run it locally.
npx tsx src/index.ts check firestore --key ~/accountTest/multirent-accountkey.json

# Capture the exit code of LintBase
EXIT_CODE=$?

echo ""
echo "============================================"
if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ CI FAILED: LintBase detected critical schema or security issues."
  echo "   Exit Code: $EXIT_CODE"
  exit 1
else
  echo "✅ CI PASSED: Database schema is healthy!"
  echo "   Exit Code: $EXIT_CODE"
  exit 0
fi
