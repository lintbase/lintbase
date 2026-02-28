// packages/lintbase-mcp/src/tools/issues.tool.ts
//
// MCP Tool: lintbase_get_issues
//
// Runs all LintBase analyzers and returns only the filtered issues list —
// no summaries, no scan metadata, just the actionable problems.
//
// Designed for targeted AI queries like:
//   "Any errors in the users collection before I add a field?"
//   "Show me all security issues"
//   "Are there any schema drift problems?"
//
// Filters:
//   - severity:   'error' | 'warning' | 'info'  (omit = all)
//   - collection: string                          (omit = all collections)
//   - rule:       string prefix, e.g. "schema/"  (omit = all rules)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

import type { LintBaseDocument, LintBaseIssue, LintBaseScanResult } from '../types.js';
import * as SchemaDrift from '../core/schema-drift.analyzer.js';
import * as Performance from '../core/performance.analyzer.js';
import * as Security from '../core/security.analyzer.js';
import * as Cost from '../core/cost.analyzer.js';

// ── Firestore helpers ─────────────────────────────────────────────────────────
function inferType(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (
        typeof value === 'object' && value !== null &&
        'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function'
    ) return 'timestamp';
    if (
        typeof value === 'object' && value !== null &&
        'path' in value && 'id' in value
    ) return 'reference';
    if (typeof value === 'object') return 'map';
    return typeof value;
}

function calculateDepth(obj: unknown, current = 1): number {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return current;
    const values = Object.values(obj as Record<string, unknown>);
    if (values.length === 0) return current;
    return Math.max(...values.map((v) => calculateDepth(v, current + 1)));
}

function mapDocument(
    doc: admin.firestore.QueryDocumentSnapshot,
    collection: string
): LintBaseDocument {
    const rawData = doc.data();
    const fields: Record<string, { value: unknown; type: string }> = {};
    for (const [key, value] of Object.entries(rawData)) {
        fields[key] = { value, type: inferType(value) };
    }
    const depth = calculateDepth(rawData);
    const sizeBytes = (() => {
        try { return Buffer.byteLength(JSON.stringify(rawData), 'utf-8'); } catch { return 0; }
    })();
    return { id: doc.id, collection, fields, depth, sizeBytes };
}

// ── Core function ─────────────────────────────────────────────────────────────
async function getIssues(
    keyPath: string,
    sampleSize: number,
    filters: {
        severity?: 'error' | 'warning' | 'info';
        collection?: string;
        rule?: string;
        collections?: string[];
    }
): Promise<{ issues: LintBaseIssue[]; totalScanned: number; collectionsScanned: string[] }> {
    const resolvedKey = path.resolve(keyPath);
    if (!fs.existsSync(resolvedKey)) {
        throw new Error(`Service account file not found: ${resolvedKey}`);
    }

    const serviceAccount = JSON.parse(
        fs.readFileSync(resolvedKey, 'utf-8')
    ) as admin.ServiceAccount;

    if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();

    const allCollections = (await db.listCollections()).map((c) => c.id);

    // Apply collection filter
    let targetCollections = allCollections;
    if (filters.collection) {
        targetCollections = allCollections.filter((c) => c === filters.collection);
        if (targetCollections.length === 0) {
            throw new Error(
                `Collection "${filters.collection}" not found. Available: [${allCollections.join(', ')}]`
            );
        }
    } else if (filters.collections && filters.collections.length > 0) {
        const filterSet = new Set(filters.collections);
        targetCollections = allCollections.filter((c) => filterSet.has(c));
    }

    // Sample documents
    const allDocuments: LintBaseDocument[] = [];
    for (const col of targetCollections) {
        const snapshot = await db.collection(col).limit(sampleSize).get();
        allDocuments.push(...snapshot.docs.map((doc) => mapDocument(doc, col)));
    }

    const scanResult: LintBaseScanResult = {
        connector: 'firestore',
        collections: targetCollections,
        documentCount: allDocuments.length,
        documents: allDocuments,
        scannedAt: new Date(),
    };

    const analysisOptions = { limit: sampleSize };
    const [schemaDriftIssues, perfIssues, securityIssues, costIssues] = await Promise.all([
        Promise.resolve(SchemaDrift.analyze(scanResult, analysisOptions)),
        Promise.resolve(Performance.analyze(scanResult, analysisOptions)),
        Promise.resolve(Security.analyze(scanResult, analysisOptions)),
        Promise.resolve(Cost.analyze(scanResult, analysisOptions)),
    ]);

    let issues: LintBaseIssue[] = [
        ...schemaDriftIssues,
        ...perfIssues,
        ...securityIssues,
        ...costIssues,
    ];

    // Apply filters
    if (filters.severity) {
        issues = issues.filter((i) => i.severity === filters.severity);
    }
    if (filters.rule) {
        issues = issues.filter((i) => i.rule.startsWith(filters.rule!));
    }

    // Sort: errors → warnings → infos, then by collection name
    const severityOrder = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => {
        const sOrder = severityOrder[a.severity] - severityOrder[b.severity];
        if (sOrder !== 0) return sOrder;
        return a.collection.localeCompare(b.collection);
    });

    return {
        issues,
        totalScanned: allDocuments.length,
        collectionsScanned: targetCollections,
    };
}

// ── Input schema ──────────────────────────────────────────────────────────────
const issuesInputShape: Record<string, z.ZodTypeAny> = {
    keyPath: z.string().describe('Absolute or relative path to the Firebase service account JSON file.'),
    severity: z.enum(['error', 'warning', 'info']).optional().describe('Filter by severity. Omit to return all severities.'),
    collection: z.string().optional().describe('Filter to a single collection name. Omit to scan all collections.'),
    rule: z.string().optional().describe('Filter by rule prefix, e.g. "schema/" returns only schema drift issues, "security/" only security issues.'),
    sampleSize: z.number().int().min(1).max(500).optional().describe('Max documents to sample per collection (default: 50).'),
};

const IssuesInput = z.object({
    keyPath: z.string(),
    severity: z.enum(['error', 'warning', 'info']).optional(),
    collection: z.string().optional(),
    rule: z.string().optional(),
    sampleSize: z.number().int().min(1).max(500).default(50),
});

// ── Register with MCP server ──────────────────────────────────────────────────
export function registerIssuesTool(server: McpServer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).registerTool(
        'lintbase_get_issues',
        {
            title: 'LintBase Get Issues',
            description:
                'Runs all LintBase analyzers and returns a filtered list of issues. ' +
                'Use this for targeted questions like "any errors in users?", "schema issues only?", or "all security problems?". ' +
                'Lighter than lintbase_scan — returns only actionable issues, no summary metadata. ' +
                'Filter by severity (error/warning/info), collection name, or rule prefix (schema/, security/, perf/, cost/).',
            inputSchema: issuesInputShape,
        },
        async (rawInput: unknown) => {
            try {
                const { keyPath, severity, collection, rule, sampleSize } = IssuesInput.parse(rawInput);

                const { issues, totalScanned, collectionsScanned } = await getIssues(
                    keyPath,
                    sampleSize,
                    { severity, collection, rule }
                );

                if (issues.length === 0) {
                    const filterDesc = [
                        severity && `severity=${severity}`,
                        collection && `collection=${collection}`,
                        rule && `rule~=${rule}`,
                    ].filter(Boolean).join(', ');

                    return {
                        content: [{
                            type: 'text' as const,
                            text: `✅ No issues found${filterDesc ? ` matching filters [${filterDesc}]` : ''}.\n` +
                                `Scanned ${totalScanned} documents across ${collectionsScanned.length} collection(s): [${collectionsScanned.join(', ')}]`,
                        }],
                    };
                }

                // Format as a clean markdown issue list
                const lines: string[] = [
                    `# LintBase Issues`,
                    `Found **${issues.length}** issue(s) across ${collectionsScanned.length} collection(s) (${totalScanned} docs sampled)`,
                    ``,
                ];

                const ICON: Record<string, string> = { error: '🔴', warning: '🟡', info: '🔵' };

                for (const issue of issues) {
                    lines.push(`### ${ICON[issue.severity] ?? '⚪'} [${issue.severity.toUpperCase()}] \`${issue.rule}\``);
                    lines.push(`**Collection:** \`${issue.collection}\``);
                    lines.push(`**Message:** ${issue.message}`);
                    if (issue.suggestion) {
                        lines.push(`**Fix:** ${issue.suggestion}`);
                    }
                    if (issue.affectedDocuments && issue.affectedDocuments.length > 0) {
                        lines.push(`**Affected docs:** ${issue.affectedDocuments.slice(0, 3).join(', ')}${issue.affectedDocuments.length > 3 ? ` (+${issue.affectedDocuments.length - 3} more)` : ''}`);
                    }
                    lines.push('');
                }

                return {
                    content: [{ type: 'text' as const, text: lines.join('\n') }],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{ type: 'text' as const, text: `lintbase_get_issues failed: ${message}` }],
                    isError: true,
                };
            }
        }
    );
}
