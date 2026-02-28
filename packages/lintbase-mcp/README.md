# lintbase-mcp

> **Give your AI coding agent real-time Firestore schema context — so it stops hallucinating field names.**

[![npm version](https://img.shields.io/npm/v/lintbase-mcp.svg)](https://www.npmjs.com/package/lintbase-mcp)
[![npm downloads](https://img.shields.io/npm/dm/lintbase-mcp.svg)](https://www.npmjs.com/package/lintbase-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

---

## The Problem

When you ask Cursor, Claude, or Windsurf to write Firestore code, it **guesses** your schema.

```
// What your AI writes:
await db.collection('users').doc(id).update({ name: value });

// What's actually in your DB:
{ displayName, uid, email, createdAt, plan }   ← no "name" field
```

The result: silent bugs, runtime crashes, and schema drift baked in by your AI assistant.

## The Fix

`lintbase-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that connects your AI agent directly to your Firestore database. Before writing any code, the agent **checks what's actually there**.

```
You: "Add a subscription status field to users"

Agent → lintbase_get_schema({ collection: "users" })
      ← { uid, email, createdAt, plan, displayName }

Agent: "I can see users has uid, email, createdAt, plan, displayName.
        I'll add subscriptionStatus as a string field alongside plan..."
```

No hallucinations. No drift. Ground-truth schema, every time.

---

## Tools

| Tool | What it does |
|------|-------------|
| `lintbase_scan` | Full database audit — schema drift, security issues, performance problems, cost leaks. Returns a structured report with a 0–100 risk score. |
| `lintbase_get_schema` | Returns real field names, types, and presence rates for one or all collections. Use before writing any DB code. |
| `lintbase_get_issues` | Returns filtered issues. Ask targeted questions: *"any errors in users?"*, *"all security issues?"*, *"schema drift only?"* |

---

## Setup

You'll need a [Firebase service account JSON key](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments) for your project.

### Cursor

Add to `.cursor/mcp.json` in your project root:

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

Then in your conversation:
```
"Check my Firestore schema before writing this code. Key is at ./service-account.json"
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop and start a new conversation.

### Windsurf

Add to your Windsurf MCP config:

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

---

## Usage Examples

Once connected, your AI agent has three tools available. You can trigger them naturally in conversation or the agent will use them automatically when relevant.

### Get the schema of a collection
```
"What fields are in the users collection?"
→ lintbase_get_schema({ keyPath: "./sa.json", collection: "users" })
```

**Returns:**
```markdown
## users  (50 docs sampled)
| Field       | Type      | Presence | Stable |
|-------------|-----------|----------|--------|
| uid         | string    | 100%     | ✅     |
| email       | string    | 100%     | ✅     |
| createdAt   | timestamp | 100%     | ✅     |
| plan        | string    | 95%      | ✅     |
| displayName | string    | 62%      | ⚠️  ← mark as optional |
```

### Run a full audit
```
"Run a full LintBase scan before I start this refactor"
→ lintbase_scan({ keyPath: "./sa.json", sampleSize: 100 })
```

**Returns:** Complete report with risk score, all issues across 4 analyzers (schema drift, security, performance, cost).

### Check for errors before deploying
```
"Any blocking errors I should know about?"
→ lintbase_get_issues({ keyPath: "./sa.json", severity: "error" })
```

### Check security issues only
```
"Are there any security problems with my database?"
→ lintbase_get_issues({ keyPath: "./sa.json", rule: "security/" })
```

---

## Security

- **Runs 100% locally** — your service account key and Firestore data never leave your machine
- The MCP server runs as a local `stdio` process spawned by your IDE
- No data is sent to any LintBase servers during schema inspection
- The server only performs **read operations** on your Firestore database

---

## Available Filters for `lintbase_get_issues`

| Filter | Values | Example |
|--------|--------|---------|
| `severity` | `error`, `warning`, `info` | Only blocking errors |
| `collection` | any collection name | Only issues in `users` |
| `rule` | rule prefix | `schema/`, `security/`, `perf/`, `cost/` |

---

## Rule Reference

| Rule | Analyzer | What it catches |
|------|----------|----------------|
| `schema/field-type-mismatch` | Schema | Same field holds multiple types across documents |
| `schema/sparse-field` | Schema | Field missing from >40% of documents |
| `schema/high-field-variance` | Schema | Wildly different field counts between documents |
| `security/sensitive-collection` | Security | Collection name suggests unprotected PII |
| `security/field-contains-secret` | Security | Field name suggests stored secrets/tokens |
| `security/debug-data-in-production` | Security | Debug/test collections left in production |
| `perf/excessive-nesting` | Performance | Documents nested >5 levels deep |
| `perf/document-too-large` | Performance | Documents approaching Firestore's 1MB limit |
| `cost/large-avg-document` | Cost | Average document size driving up bandwidth costs |
| `cost/logging-sink` | Cost | Collection used as an unbounded write sink |

---

## Related

- **[lintbase](https://www.npmjs.com/package/lintbase)** — The CLI tool. Run `npx lintbase scan firestore --key ./sa.json` for a full terminal report.
- **[lintbase.com](https://lintbase.com)** — Dashboard for teams: save scan history, track risk score over time, share reports.

---

## License

MIT © [Mamadou Dia](https://github.com/mamadoudia)
