#!/usr/bin/env node
// packages/lintbase-mcp/src/server.ts
// Entry point for the LintBase MCP server.
//
// Usage:
//   npx lintbase-mcp                → starts MCP server (for Cursor/Claude/IDE)
//   npx lintbase-mcp install-skill  → installs SKILL.md into .agent/skills/lintbase/

import * as fs from 'fs';
import * as path from 'path';

// ── Subcommand: install-skill ──────────────────────────────────────────────────
if (process.argv[2] === 'install-skill') {
    const SKILL_SRC = path.join(__dirname, '..', 'skill', 'SKILL.md');
    const TARGET_DIR = path.join(process.cwd(), '.agent', 'skills', 'lintbase');
    const TARGET_FILE = path.join(TARGET_DIR, 'SKILL.md');

    fs.mkdirSync(TARGET_DIR, { recursive: true });
    fs.copyFileSync(SKILL_SRC, TARGET_FILE);

    console.log('');
    console.log('✅ LintBase skill installed to:');
    console.log('   ' + TARGET_FILE);
    console.log('');
    console.log('Your AI agent will now automatically check the real Firestore schema');
    console.log('before writing any database code.');
    console.log('');
    console.log('Make sure lintbase-mcp is configured in your IDE:');
    console.log('  → https://www.npmjs.com/package/lintbase-mcp');
    console.log('');
    process.exit(0);
}

// ── MCP Server ────────────────────────────────────────────────────────────────
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerScanTool } from './tools/scan.tool.js';
import { registerSchemaTool } from './tools/schema.tool.js';
import { registerIssuesTool } from './tools/issues.tool.js';

const server = new McpServer({
    name: 'lintbase-mcp',
    version: '0.1.6',
});

// ── Register all 3 tools ──────────────────────────────────────────────────────
registerScanTool(server);     // Full scan → complete report
registerSchemaTool(server);   // Schema introspection → field names + types
registerIssuesTool(server);   // Filtered issues → targeted queries

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('LintBase MCP server v0.1.6 running on stdio');
}

main().catch((err) => {
    console.error('Fatal error starting LintBase MCP server:', err);
    process.exit(1);
});
