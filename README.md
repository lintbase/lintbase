# LintBase

> **ESLint for your Firestore database** — catch security vulnerabilities, cost leaks, schema drift, and performance issues before they become expensive production problems.

```bash
npx lintbase scan firestore --key ./service-account.json
```

[![npm version](https://img.shields.io/npm/v/lintbase.svg)](https://www.npmjs.com/package/lintbase)
[![npm downloads](https://img.shields.io/npm/dm/lintbase.svg)](https://www.npmjs.com/package/lintbase)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why LintBase?

Your code has ESLint. Your Firestore doesn't have anything.

LintBase scans your database and surfaces issues that are invisible until they show up as an outage or a surprise bill:

- 🔒 **Security** — documents with no auth rules, exposed PII, unvalidated writes
- 💸 **Cost** — unbounded queries, missing indexes, collections that cost $200/mo for nothing  
- 📐 **Schema drift** — fields that changed types, missing required fields, inconsistent structure
- ⚡ **Performance** — deeply nested data, missing pagination, hot document patterns

---

## Quick Start

### 1. Get a service account key

Firebase Console → Project Settings → Service Accounts → **Generate new private key**

Save the JSON file. **Never commit it to git.**

### 2. Run a scan

```bash
npx lintbase scan firestore --key ./service-account.json
```

You'll see a full report in your terminal:

```
 LintBase — Firestore Scan
 ─────────────────────────────────────────────
 Collections scanned:  12
 Documents sampled:    847
 Issues found:         23  (4 errors · 11 warnings · 8 infos)
 Risk score:           67 / 100  [HIGH]

 ERRORS
 ✖  users         no-auth-check        Documents readable without authentication
 ✖  orders        missing-index        Query on `status` + `createdAt` has no composite index
 ✖  debug_logs    large-collection     Collection has 2.4M docs — estimated $340/mo in reads

 WARNINGS
 ⚠  products      schema-drift         Field `price` found as both Number and String
 ⚠  sessions      ttl-missing          No expiry field — stale docs accumulate indefinitely
 ...
```

### 3. Save to your dashboard (optional)

Track your database health over time at [lintbase.com](https://lintbase.com):

```bash
npx lintbase scan firestore \
  --key ./service-account.json \
  --save https://www.lintbase.com \
  --token <your-api-token>
```

Get your token at **[lintbase.com/dashboard/settings](https://www.lintbase.com/dashboard/settings)** — free to start.

---

## 🤖 AI Agent Integration (MCP)

Using **Cursor, Claude Desktop, or Windsurf**? Install [`lintbase-mcp`](https://www.npmjs.com/package/lintbase-mcp) to give your AI agent real-time Firestore schema context — so it stops hallucinating field names.

Add to `.cursor/mcp.json`:
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

Now when you ask your AI *"add a field to users"*, it will check your **real** schema first before writing a line of code.

→ **[Full setup guide & tools reference](https://www.npmjs.com/package/lintbase-mcp)**

---

## What it catches

### 🔒 Security
| Rule | What it detects |
|---|---|
| `no-auth-check` | Collections readable/writable without auth |
| `exposed-pii` | Email, phone, SSN fields without encryption markers |
| `world-readable` | Documents with overly permissive security rules |

### 💸 Cost
| Rule | What it detects |
|---|---|
| `large-collection` | Collections with 100k+ docs and high read cost |
| `unbounded-query` | Queries without `limit()` that scan entire collections |
| `missing-index` | Filter combinations that fall back to full collection scans |
| `debug-collection` | Collections that look like temporary data that was never cleaned up |

### 📐 Schema Drift
| Rule | What it detects |
|---|---|
| `type-inconsistency` | Field stored as different types across documents |
| `missing-required-field` | Field present in 90%+ of docs but absent in some |
| `nullable-id` | Reference fields that are sometimes null |

### ⚡ Performance
| Rule | What it detects |
|---|---|
| `deep-nesting` | Document fields nested > 3 levels deep |
| `large-document` | Documents approaching the 1MB Firestore limit |
| `hot-document` | Single document updated by many users simultaneously |
| `no-pagination` | Collections without a standard pagination field |

---

## Options

```bash
lintbase scan firestore [options]

Options:
  --key <path>      Path to Firebase service account JSON      [required]
  --limit <n>       Max documents to sample per collection     [default: 100]
  --save <url>      Dashboard URL to save results
  --token <token>   API token for dashboard (from lintbase.com)
  --collections     Comma-separated list of collections to scan
  -h, --help        Show help
```

---

## Dashboard

The CLI is free forever. The [dashboard](https://lintbase.com) visualizes your scan results as an **interactive schema map** — your credentials never leave your machine.

**What you get after running `--save`:**

- **⬡ Schema Map** — every collection as a draggable card, with real field names, types, presence rates, and issue badges
- **◎ Health Radar** — per-collection spider chart across Schema, Security, Performance, and Cost axes
- **⊕ Priority Quadrant** — 2×2 bubble chart of Impact vs. Ease of Fix — tells you what to fix first
- **≋ Drift Timeline** — click any past scan to replay its schema state and compare

**Free:** 7 scans · **Pro:** $39/month — unlimited history, all visual features

---

## Security

- Your service account key **never leaves your machine** — it is only read locally
- Document sampling is hard-capped at `--limit` (default 100) to prevent accidental read costs
- The `--save` flag only sends the scan summary and issue list — never raw document data

---

## License

MIT © [Mamadou Dia](https://github.com/lintbase)
