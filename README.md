# LintBase

> **ESLint for your database** — catch schema drift, security vulnerabilities, performance issues, and cost leaks in NoSQL databases before they become expensive problems.

```
npx lintbase scan firestore --key ./service-account.json
```

---

## ✨ Features (Phase 1)

| Feature | Status |
|---|---|
| Firestore collection discovery | ✅ |
| Document sampling (with billing guard) | ✅ |
| Beautiful terminal output | ✅ |
| Depth & size metrics per collection | ✅ |
| Analyzers (schema drift, security, cost) | 🔜 Phase 2 |
| SaaS dashboard + Slack alerts | 🔜 Phase 3 |

---

## 🚀 Quick Start

### 1. Install

```bash
npm install -g lintbase
# or use it directly with npx:
npx lintbase scan firestore --key ./service-account.json
```

### 2. Get a Firestore Service Account Key

1. Go to **Firebase Console → Project Settings → Service Accounts**
2. Click **Generate new private key**
3. Save the JSON file (keep it out of git!)

### 3. Run a scan

```bash
lintbase scan firestore --key ./service-account.json
# Optionally cap document samples per collection:
lintbase scan firestore --key ./service-account.json --limit 50
```

---

## 🛠 Development

```bash
# Install deps
npm install

# Run in dev mode (no build step needed)
npx tsx src/index.ts scan firestore --key ./service-account.json

# Build for production
npm run build

# Run the compiled binary
node dist/index.js scan firestore --key ./service-account.json
```

---

## 📐 Architecture

```
src/
├── index.ts                  # CLI entry point (Commander.js)
├── connectors/
│   ├── base.connector.ts     # Abstract class — all connectors extend this
│   └── firestore.connector.ts
├── analyzers/                # Phase 2 — database-agnostic issue detectors
├── reporters/
│   └── terminal.reporter.ts  # Chalk + cli-table3 terminal output
└── types/
    └── index.ts              # Shared TypeScript interfaces (the core contract)
```

**Key design principle:** Connectors only fetch and transform data into the `LintBaseDocument` shape. Analyzers only consume that shape. They never touch each other directly.

---

## 🔐 Security

- The service account key is **never** transmitted anywhere — it is only read locally.
- Document sampling is hard-capped to `--limit` (default 100) to prevent accidental Firestore read billing.

---

## 📄 License

ISC © Mamadou Dia
