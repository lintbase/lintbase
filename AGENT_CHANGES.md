he # LintBase: AI Context & Changelog

> **Purpose:** This file acts as persistent memory across AI agent sessions. If credits run out or a new agent takes over the workspace, **read this file first** to understand the state of the project, the current objectives, and the recent changes made.

## 1. Project Overview
**LintBase** provides ground-truth knowledge of NoSQL database schemas (Firestore, MongoDB) to AI coding agents (Cursor, Claude, Windsurf). It stops agents from hallucinating queries by providing real-time schema, type, and field presence context. 

Main components:
- **CLI (`packages/lintbase`)**: Scans databases, exports markdown context, and runs in CI to catch schema drift.
- **MCP Server (`packages/lintbase-mcp`)**: Connects AI explicitly to a local database to fetch context automatically.
- **Dashboard**: A Next.js web application for visualizing database health, security rules, and cost-leaks over time.

## 2. Current Go-to-Market Strategy
- **Inbound Lead Gen:** We are prioritizing submitting `lintbase-mcp` to MCP registries (Smithery.ai, Glama.ai) and AI tool directories (cursor.directory). AI developers are actively searching for this exact tool.
- **Outbound (Sniper Approach):** Utilizing the user's previously built **AI Marketing Workforce** (Prospector/Copywriter bots). Target: Firebase/React Native/Flutter development agencies. Hook: "Your team uses Cursor. Cursor hallucinates Firebase queries. We fix that permanently."
- **Productized Service:** Offering to run `lintbase export-context` locally for companies with undocumented Firebase projects to generate an Obsidian markdown graph ($99-$299), upselling LintBase Pro ($39/mo) for CI/CD guardrails.

## 3. Where We Left Off
- **Active Files:** The user was most recently looking at `packages/lintbase-mcp/src/tools/scan.tool.ts` handling the Zod input schema and runtime execution of the internal analyzers (Security, Performance, Cost, SchemaDrift).
- **Next Actions:**
  1. If resuming, verify if the user wants to continue refining the MCP Server configuration (`lintbase-mcp`).
  2. If the user wants to switch to marketing, help them configure their Prospector bot to target Firebase development agencies for cold email outreach.

## 4. Changelog Log
- **[2026-03-15]**: Established the core GTM (Go-to-market) plan focusing on MCP marketplaces and targeted outbound emails via AI agent workforce. Generated this `AGENT_CHANGES.md` context log so new agents can seamlessly resume the task.
