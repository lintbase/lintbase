#!/usr/bin/env node
// packages/lintbase-mcp/src/server.ts
// Entry point for the LintBase MCP server.
// Run via `npx lintbase-mcp` — the IDE spawns this as a stdio process.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerScanTool } from './tools/scan.tool.js';
import { registerSchemaTool } from './tools/schema.tool.js';
import { registerIssuesTool } from './tools/issues.tool.js';

const server = new McpServer({
    name: 'lintbase-mcp',
    version: '0.1.0',
});

// ── Register all 3 tools ──────────────────────────────────────────────────────
registerScanTool(server);     // Full scan → complete report
registerSchemaTool(server);   // Schema introspection → field names + types
registerIssuesTool(server);   // Filtered issues → targeted queries



// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log to stderr so it doesn't pollute the MCP stdio protocol on stdout
    console.error('LintBase MCP server v0.1.0 running on stdio');
}

main().catch((err) => {
    console.error('Fatal error starting LintBase MCP server:', err);
    process.exit(1);
});
