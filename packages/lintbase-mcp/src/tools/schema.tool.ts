// packages/lintbase-mcp/src/tools/schema.tool.ts
//
// MCP Tool: lintbase_get_schema
//
// Returns the inferred schema for one or all Firestore collections.
// For each collection the agent gets:
//   - Every field name observed across sampled documents
//   - The type(s) each field holds (e.g. "string", "timestamp", "map")
//   - The presence rate  (0.0–1.0) — how many docs have this field
//   - Whether the field is considered "stable" (≥ 80 % presence, single type)
//
// This is the killer tool for AI agents: instead of hallucinating field
// names, the agent calls this first and gets the real shape of the DB.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

import type { LintBaseDocument } from '../types.js';

// ── Firestore helpers (same as scan.tool.ts) ──────────────────────────────────
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

// ── Schema inference ──────────────────────────────────────────────────────────
export interface FieldSchema {
    name: string;
    /** All observed types for this field (ideally just one) */
    types: string[];
    /** Fraction of sampled docs that contain this field (0.0–1.0) */
    presenceRate: number;
    /** true when presenceRate ≥ 0.8 AND only one type observed */
    stable: boolean;
    /** Human-readable note for unstable fields */
    note?: string;
}

export interface CollectionSchema {
    name: string;
    sampledDocuments: number;
    fields: FieldSchema[];
}

export interface SchemaReport {
    collections: CollectionSchema[];
    scannedAt: string;
}

function inferCollectionSchema(
    docs: LintBaseDocument[],
    collectionName: string
): CollectionSchema {
    const fieldTypes = new Map<string, Set<string>>();
    const fieldCounts = new Map<string, number>();
    const total = docs.length;

    for (const doc of docs) {
        for (const [field, { type }] of Object.entries(doc.fields)) {
            if (!fieldTypes.has(field)) fieldTypes.set(field, new Set());
            fieldTypes.get(field)!.add(type);
            fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
        }
    }

    const fields: FieldSchema[] = [];
    for (const [name, types] of fieldTypes.entries()) {
        const count = fieldCounts.get(name) ?? 0;
        const presenceRate = total > 0 ? count / total : 0;
        const typeList = [...types];
        const stable = presenceRate >= 0.8 && typeList.length === 1;

        let note: string | undefined;
        if (typeList.length > 1) {
            note = `Type mismatch: field holds ${typeList.join(' | ')} — schema drift detected.`;
        } else if (presenceRate < 0.6) {
            note = `Sparse field: only present in ${Math.round(presenceRate * 100)}% of documents.`;
        } else if (presenceRate < 0.8) {
            note = `Inconsistent field: present in ${Math.round(presenceRate * 100)}% of documents — mark as optional.`;
        }

        fields.push({ name, types: typeList, presenceRate, stable, note });
    }

    // Sort: stable fields first, then by presence rate descending
    fields.sort((a, b) => {
        if (a.stable !== b.stable) return a.stable ? -1 : 1;
        return b.presenceRate - a.presenceRate;
    });

    return { name: collectionName, sampledDocuments: total, fields };
}

// ── Core function ─────────────────────────────────────────────────────────────
async function getSchema(
    keyPath: string,
    sampleSize: number,
    collection?: string
): Promise<SchemaReport> {
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

    // Determine which collections to scan
    const allCollections = (await db.listCollections()).map((c) => c.id);
    const targetCollections = collection
        ? allCollections.filter((c) => c === collection)
        : allCollections;

    if (targetCollections.length === 0) {
        throw new Error(
            collection
                ? `Collection "${collection}" not found. Available: [${allCollections.join(', ')}]`
                : 'No collections found in this Firestore database.'
        );
    }

    // Sample documents and infer schema per collection
    const collections: CollectionSchema[] = [];
    for (const col of targetCollections) {
        const snapshot = await db.collection(col).limit(sampleSize).get();
        const docs = snapshot.docs.map((doc) => mapDocument(doc, col));
        collections.push(inferCollectionSchema(docs, col));
    }

    return { collections, scannedAt: new Date().toISOString() };
}

// ── Input schema ──────────────────────────────────────────────────────────────
const schemaInputShape: Record<string, z.ZodTypeAny> = {
    keyPath: z.string().describe('Absolute or relative path to the Firebase service account JSON file.'),
    collection: z.string().optional().describe('Name of a single collection to inspect. Omit to get the schema of ALL collections.'),
    sampleSize: z.number().int().min(1).max(500).optional().describe('Max documents to sample per collection (default: 50).'),
};

const SchemaInput = z.object({
    keyPath: z.string(),
    collection: z.string().optional(),
    sampleSize: z.number().int().min(1).max(500).default(50),
});

// ── Register with MCP server ──────────────────────────────────────────────────
export function registerSchemaTool(server: McpServer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).registerTool(
        'lintbase_get_schema',
        {
            title: 'LintBase Get Schema',
            description:
                'Returns the ground-truth schema of your Firestore collections by sampling real documents. ' +
                'For each collection you get field names, observed types, and presence rates. ' +
                'Use this BEFORE writing any database code to avoid hallucinating field names. ' +
                'Stable fields (≥80% presence, single type) are safe to use. ' +
                'Fields marked with a note need attention (drift, sparse, or optional).',
            inputSchema: schemaInputShape,
        },
        async (rawInput: unknown) => {
            try {
                const { keyPath, collection, sampleSize } = SchemaInput.parse(rawInput);
                const schemaReport = await getSchema(keyPath, sampleSize, collection);

                // Format a clean, readable text summary the AI can reason about instantly
                const lines: string[] = [
                    `# LintBase Schema Report`,
                    `Scanned at: ${schemaReport.scannedAt}`,
                    `Collections: ${schemaReport.collections.length}`,
                    ``,
                ];

                for (const col of schemaReport.collections) {
                    lines.push(`## ${col.name}  (${col.sampledDocuments} docs sampled)`);
                    lines.push(`| Field | Type(s) | Presence | Stable |`);
                    lines.push(`|-------|---------|----------|--------|`);
                    for (const f of col.fields) {
                        const presence = `${Math.round(f.presenceRate * 100)}%`;
                        const stable = f.stable ? '✅' : '⚠️';
                        const note = f.note ? ` ← ${f.note}` : '';
                        lines.push(`| ${f.name} | ${f.types.join(' | ')} | ${presence} | ${stable}${note} |`);
                    }
                    lines.push(``);
                }

                // Also return the raw JSON for programmatic use
                const jsonData = JSON.stringify(schemaReport, null, 2);
                const textSummary = lines.join('\n');

                return {
                    content: [
                        { type: 'text' as const, text: textSummary },
                        { type: 'text' as const, text: `\n---\n**Raw JSON:**\n\`\`\`json\n${jsonData}\n\`\`\`` },
                    ],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{ type: 'text' as const, text: `lintbase_get_schema failed: ${message}` }],
                    isError: true,
                };
            }
        }
    );
}
