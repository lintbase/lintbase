---
name: lintbase
description: >
  Use this skill whenever you are about to read from, write to, query, or modify
  a Firestore database. LintBase gives you ground-truth schema context (real field
  names, types, presence rates) directly from production documents so you never
  hallucinate field names or create schema drift.
  
  Trigger automatically when the user asks you to:
  - Add, update, or delete fields in a Firestore collection
  - Write Firestore queries or security rules
  - Refactor database-related code
  - Debug data inconsistencies or runtime errors tied to Firestore
  - Audit the database before a deploy or major change
license: MIT
---

# LintBase — Firestore Schema Context for AI Agents

LintBase gives you real-time, ground-truth Firestore schema context so you write
code that matches what is actually in production — not what you assume is there.

## Core Rule

> **NEVER write Firestore code (reads, writes, queries, rules) without first
> calling `lintbase_get_schema` for the relevant collection.**

This is not optional. Firestore is schemaless — documents in the same collection
can have completely different fields. If you do not check first, you WILL
hallucinate field names and cause silent bugs or schema drift.

## When to Use Each Tool

### `lintbase_get_schema` — Use this first, always
Call this before writing ANY database-related code.

```
lintbase_get_schema({
  keyPath: "./service-account.json",  // ask user if not specified
  collection: "users",                // omit to get ALL collections
  sampleSize: 50                      // default is fine
})
```

**Read the output carefully:**
- ✅ Fields with `100%` presence and a single type are stable — safe to use
- ⚠️ Fields with `<80%` presence should be treated as **optional** — always use null checks
- ⚠️ Fields with multiple types have **type drift** — use defensive type guards
- Fields not in the output **do not exist** — do not invent them

### `lintbase_get_issues` — Use before any major change
Call this before a refactor, deploy, or when the user reports unexpected behavior.

```
lintbase_get_issues({
  keyPath: "./service-account.json",
  severity: "error",          // start with errors only
  collection: "users"         // scope to relevant collection
})
```

Filter options:
- `severity`: `"error"` | `"warning"` | `"info"`
- `collection`: any collection name
- `rule`: `"schema/"` | `"security/"` | `"perf/"` | `"cost/"`

### `lintbase_scan` — Use for full audits
Call this when the user wants a complete database health check.

```
lintbase_scan({
  keyPath: "./service-account.json",
  sampleSize: 100
})
```

Returns a risk score (0-100) and all issues across schema, security,
performance, and cost analyzers.

## Standard Workflow

Follow this sequence every time you touch Firestore code:

```
1. Call lintbase_get_schema for the target collection(s)
2. Read the field list — note presence rates and types
3. Write code using ONLY the fields that appear in the output
4. Mark optional fields (<80% presence) with null checks
5. If making structural changes, run lintbase_get_issues first
```

## Reading Schema Output

Example output:
```
## users  (47 docs sampled)
| Field       | Type      | Presence | Stable |
|-------------|-----------|----------|--------|
| uid         | string    | 100%     | ✅     |
| email       | string    | 100%     | ✅     |
| createdAt   | timestamp | 100%     | ✅     |
| plan        | string    | 95%      | ✅     |
| displayName | string    | 62%      | ⚠️     |
| legacyRole  | string    | 18%      | ⚠️     |
```

**How to write this in code:**
```typescript
// ✅ Safe — 100% presence
const { uid, email, createdAt, plan } = userData;

// ✅ Correct — optional field, null check required
const displayName = userData.displayName ?? userData.email;

// ✅ Correct — sparse legacy field, guard it
if (userData.legacyRole) {
  // handle legacy role migration
}

// ❌ Wrong — "name" does not exist in this schema
const name = userData.name;
```

## Security Notes

- LintBase runs **100% locally** — your service account key never leaves your machine
- Only **read operations** are performed on Firestore
- Never commit `service-account.json` to git — always check `.gitignore`
- If the user has not set up a service account key, guide them:
  1. Firebase Console → Project Settings → Service Accounts
  2. Click "Generate new private key"
  3. Save as `service-account.json` in project root
  4. Verify `.gitignore` includes `service-account.json`

## Setup (if lintbase-mcp is not yet configured)

If the MCP tools are not available, help the user set up lintbase-mcp:

**For Cursor** — add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "lintbase": {
      "command": "npx",
      "args": ["-y", "lintbase-mcp"]
    }
  }
}
```

**For Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "lintbase": {
      "command": "npx",
      "args": ["-y", "lintbase-mcp"]
    }
  }
}
```

Restart the IDE after adding, then verify with: `npx lintbase-mcp --help`

## Common Mistakes to Avoid

| ❌ Wrong | ✅ Right |
|---|---|
| Writing code before checking schema | Always call `lintbase_get_schema` first |
| Using a field not in the output | Only use fields that appear in the schema report |
| Treating all fields as required | Fields with `<80%` presence MUST have null checks |
| Assuming type consistency | Fields with multiple types need type guards |
| Skipping the audit before deploy | Run `lintbase_get_issues` with `severity: "error"` first |
