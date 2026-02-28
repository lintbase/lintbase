// packages/lintbase-mcp/src/tools/scan.tool.ts
//
// MCP Tool: lintbase_scan
// Runs a full LintBase scan against a Firestore database and returns
// the structured report (same shape as `lintbase scan --json`).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

import type { LintBaseDocument, LintBaseIssue, LintBaseReport, LintBaseScanResult } from '../types.js';
import * as SchemaDrift from '../core/schema-drift.analyzer.js';
import * as Performance from '../core/performance.analyzer.js';
import * as Security from '../core/security.analyzer.js';
import * as Cost from '../core/cost.analyzer.js';

// ── Risk score (mirrored from CLI) ───────────────────────────────────────────
function computeRiskScore(errors: number, warnings: number, infos: number): number {
    return Math.min(100, errors * 12 + warnings * 4 + infos * 1);
}

// ── Firestore type helpers ────────────────────────────────────────────────────
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

// ── Core scan function ────────────────────────────────────────────────────────
async function runScan(
    keyPath: string,
    sampleSize: number,
    collections?: string[]
): Promise<LintBaseReport> {
    const resolvedKey = path.resolve(keyPath);

    if (!fs.existsSync(resolvedKey)) {
        throw new Error(`Service account file not found: ${resolvedKey}`);
    }

    const serviceAccount = JSON.parse(
        fs.readFileSync(resolvedKey, 'utf-8')
    ) as admin.ServiceAccount;

    // Avoid re-initializing Firebase if already running
    if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();

    // Discover collections
    const allCollections = (await db.listCollections()).map((c) => c.id);
    const targetCollections = collections && collections.length > 0
        ? allCollections.filter((c) => collections.includes(c))
        : allCollections;

    if (targetCollections.length === 0) {
        throw new Error(
            collections && collections.length > 0
                ? `None of the requested collections [${collections.join(', ')}] were found. Available: [${allCollections.join(', ')}]`
                : 'No collections found in this Firestore database.'
        );
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

    // Run all analyzers
    const analysisOptions = { limit: sampleSize };
    const [schemaDriftIssues, perfIssues, securityIssues, costIssues] = await Promise.all([
        Promise.resolve(SchemaDrift.analyze(scanResult, analysisOptions)),
        Promise.resolve(Performance.analyze(scanResult, analysisOptions)),
        Promise.resolve(Security.analyze(scanResult, analysisOptions)),
        Promise.resolve(Cost.analyze(scanResult, analysisOptions)),
    ]);

    const issues: LintBaseIssue[] = [
        ...schemaDriftIssues,
        ...perfIssues,
        ...securityIssues,
        ...costIssues,
    ];

    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const infos = issues.filter((i) => i.severity === 'info').length;

    const report: LintBaseReport = {
        summary: {
            totalCollections: targetCollections.length,
            totalDocuments: allDocuments.length,
            errors,
            warnings,
            infos,
            riskScore: computeRiskScore(errors, warnings, infos),
        },
        issues,
        scannedAt: scanResult.scannedAt,
    };

    return report;
}

// ── Input schema ─────────────────────────────────────────────────────────────
// NOTE: Zod 3.25.x is Zod v4 under the hood. Its types cause TS2589 ("type
// instantiation is excessively deep") when used directly with the MCP SDK's
// generic inference. The fix: annotate the shape as Record<string, z.ZodTypeAny>
// to clamp TypeScript's inference depth, then validate inputs manually.
const scanInputShape: Record<string, z.ZodTypeAny> = {
    keyPath: z.string().describe('Absolute or relative path to the Firebase service account JSON file.'),
    sampleSize: z.number().int().min(1).max(500).optional().describe('Max documents to sample per collection (default: 50, max: 500).'),
    collections: z.array(z.string()).optional().describe('Optional list of collection names to scan. Omit to scan all collections.'),
};

// Runtime validator for the handler (separate from the shape above)
const ScanInput = z.object({
    keyPath: z.string(),
    sampleSize: z.number().int().min(1).max(500).default(50),
    collections: z.array(z.string()).optional(),
});

// ── Register with MCP server ──────────────────────────────────────────────────
export function registerScanTool(server: McpServer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).registerTool(
        'lintbase_scan',
        {
            title: 'LintBase Full Scan',
            description:
                'Runs a full LintBase scan against a Firestore database. ' +
                'Detects schema drift, security issues, performance problems, and cost leaks. ' +
                'Returns a structured report with a risk score and actionable issues. ' +
                'Use this before writing any database-related code to get ground-truth schema context.',
            inputSchema: scanInputShape,
        },
        async (rawInput: unknown) => {
            try {
                const { keyPath, sampleSize, collections } = ScanInput.parse(rawInput);
                const report = await runScan(keyPath, sampleSize, collections);
                const text = JSON.stringify(report, null, 2);
                return {
                    content: [{ type: 'text' as const, text }],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{ type: 'text' as const, text: `LintBase scan failed: ${message}` }],
                    isError: true,
                };
            }
        }
    );
}
