// src/utils/analysis.utils.ts
import { LintBaseDocument, LintBaseScanResult } from '../types/index.js';

export interface CollectionStats {
    docs: LintBaseDocument[];
    count: number;
    totalBytes: number;
    avgBytes: number;
    maxDepth: number;
}

/**
 * Group all sampled documents by their collection and compute
 * aggregate stats. Collections with 0 sampled docs are also included
 * from result.collections so no collection is silently dropped.
 */
export function groupByCollection(
    result: LintBaseScanResult
): Map<string, CollectionStats> {
    const map = new Map<string, CollectionStats>();

    // Seed every discovered collection (even those with 0 docs)
    for (const col of result.collections) {
        map.set(col, {
            docs: [],
            count: 0,
            totalBytes: 0,
            avgBytes: 0,
            maxDepth: 0,
        });
    }

    for (const doc of result.documents) {
        const existing = map.get(doc.collection) ?? {
            docs: [],
            count: 0,
            totalBytes: 0,
            avgBytes: 0,
            maxDepth: 0,
        };

        existing.docs.push(doc);
        existing.count++;
        existing.totalBytes += doc.sizeBytes;
        existing.maxDepth = Math.max(existing.maxDepth, doc.depth);
        map.set(doc.collection, existing);
    }

    // Compute averages
    for (const [col, stats] of map.entries()) {
        map.set(col, {
            ...stats,
            avgBytes: stats.count > 0 ? Math.round(stats.totalBytes / stats.count) : 0,
        });
    }

    return map;
}

/** Options forwarded from the CLI to every analyzer */
export interface AnalysisOptions {
    /** The --limit value used during the scan */
    limit: number;
}
