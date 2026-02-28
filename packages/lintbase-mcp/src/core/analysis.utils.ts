// packages/lintbase-mcp/src/core/analysis.utils.ts
import { LintBaseDocument, LintBaseScanResult } from '../types.js';

export interface CollectionStats {
    docs: LintBaseDocument[];
    count: number;
    totalBytes: number;
    avgBytes: number;
    maxDepth: number;
}

export function groupByCollection(result: LintBaseScanResult): Map<string, CollectionStats> {
    const map = new Map<string, CollectionStats>();
    for (const col of result.collections) {
        map.set(col, { docs: [], count: 0, totalBytes: 0, avgBytes: 0, maxDepth: 0 });
    }
    for (const doc of result.documents) {
        const existing = map.get(doc.collection) ?? { docs: [], count: 0, totalBytes: 0, avgBytes: 0, maxDepth: 0 };
        existing.docs.push(doc);
        existing.count++;
        existing.totalBytes += doc.sizeBytes;
        existing.maxDepth = Math.max(existing.maxDepth, doc.depth);
        map.set(doc.collection, existing);
    }
    for (const [col, stats] of map.entries()) {
        map.set(col, { ...stats, avgBytes: stats.count > 0 ? Math.round(stats.totalBytes / stats.count) : 0 });
    }
    return map;
}

export interface AnalysisOptions {
    limit: number;
}
