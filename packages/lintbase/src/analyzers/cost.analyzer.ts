// src/analyzers/cost.analyzer.ts
//
// Detects database patterns that drive unnecessary Firestore read/write/storage costs.
// Rules:
//   cost/large-avg-document     — avg doc > 5 KB (warning), > 50 KB (error)
//   cost/logging-sink           — collection looks like an unbounded log (error)
//   cost/redundant-collections  — 2+ collections with identical size/depth fingerprints (warning)
//   cost/collection-at-limit    — hit --limit during sampling (info — unbounded growth risk)

import { LintBaseIssue, LintBaseScanResult } from '../types/index.js';
import { groupByCollection, AnalysisOptions } from '../utils/analysis.utils.js';

// Cost thresholds
const ERROR_AVG_BYTES = 50 * 1024;  // 50 KB
const WARN_AVG_BYTES = 5 * 1024;  //  5 KB

// Patterns that suggest a collection is used as a log / event sink
const LOG_SINK_PATTERNS = [
    /^console/i,
    /^log[s]?$/i,
    /^audit/i,
    /^event[s]?$/i,
    /^request(get|post|put|delete|patch)$/i,
    /payload/i,
    /^trace[s]?$/i,
    /^webhook/i,
    /^analytics/i,
];

export function analyze(
    result: LintBaseScanResult,
    options: AnalysisOptions
): LintBaseIssue[] {
    const issues: LintBaseIssue[] = [];
    const byCollection = groupByCollection(result);

    // ── cost/large-avg-document ───────────────────────────────────────────────
    for (const [col, stats] of byCollection.entries()) {
        if (stats.count === 0) continue;

        if (stats.avgBytes > ERROR_AVG_BYTES) {
            issues.push({
                severity: 'error',
                collection: col,
                rule: 'cost/large-avg-document',
                message:
                    `"${col}" has an average document size of ${(stats.avgBytes / 1024).toFixed(1)} KB. ` +
                    `At scale this will significantly increase read bandwidth costs.`,
                suggestion:
                    'Move large blob fields (arrays, embedded maps, base64 strings) to Cloud Storage or a separate sub-collection. ' +
                    'Use Firestore partial reads (select) to avoid transferring unused fields.',
            });
        } else if (stats.avgBytes > WARN_AVG_BYTES) {
            issues.push({
                severity: 'warning',
                collection: col,
                rule: 'cost/large-avg-document',
                message:
                    `"${col}" average document size is ${(stats.avgBytes / 1024).toFixed(1)} KB.`,
                suggestion:
                    'Consider splitting large documents or using sub-collections for frequently-updated sub-objects.',
            });
        }
    }

    // ── cost/logging-sink ─────────────────────────────────────────────────────
    for (const [col] of byCollection.entries()) {
        const isLogSink = LOG_SINK_PATTERNS.some((re) => re.test(col));
        if (isLogSink) {
            issues.push({
                severity: 'error',
                collection: col,
                rule: 'cost/logging-sink',
                message:
                    `"${col}" appears to be used as a logging or event sink. ` +
                    `Firestore charges per document write — unbounded logging here will compound costs.`,
                suggestion:
                    'Use Cloud Logging, BigQuery, or a dedicated logging service instead. ' +
                    'If you must use Firestore, implement a TTL cleanup Cloud Function to delete old documents automatically.',
            });
        }
    }

    // ── cost/redundant-collections ────────────────────────────────────────────
    // Two collections are "redundant" if they share the same avg byte size (within ±15%)
    // AND the same max depth — strong signal they hold the same schema under different names.
    const colList = [...byCollection.entries()].filter(([, s]) => s.count > 0);

    const redundancyGroups: string[][] = [];
    const visited = new Set<string>();

    for (let i = 0; i < colList.length; i++) {
        const [colA, statsA] = colList[i]!;
        if (visited.has(colA)) continue;

        const group: string[] = [colA];

        for (let j = i + 1; j < colList.length; j++) {
            const [colB, statsB] = colList[j]!;
            if (visited.has(colB)) continue;

            const byteRatio = statsA.avgBytes > 0
                ? Math.abs(statsA.avgBytes - statsB.avgBytes) / statsA.avgBytes
                : 1;

            if (byteRatio <= 0.15 && statsA.maxDepth === statsB.maxDepth && statsA.avgBytes > 0) {
                group.push(colB);
                visited.add(colB);
            }
        }

        if (group.length > 1) {
            redundancyGroups.push(group);
            for (const c of group) visited.add(c);
        }
    }

    for (const group of redundancyGroups) {
        issues.push({
            severity: 'warning',
            collection: group[0]!,
            rule: 'cost/redundant-collections',
            message:
                `Collections [${group.map((c) => `"${c}"`).join(', ')}] have identical average document ` +
                `sizes and nesting depth — they likely store the same schema.`,
            suggestion:
                'Merge redundant collections into one, using a "type" or "method" field to differentiate records. ' +
                'This halves your index count and simplifies security rule maintenance.',
        });
    }

    // ── cost/collection-at-limit ──────────────────────────────────────────────
    for (const [col, stats] of byCollection.entries()) {
        if (stats.count === options.limit) {
            issues.push({
                severity: 'info',
                collection: col,
                rule: 'cost/collection-at-limit',
                message:
                    `"${col}" hit the ${options.limit}-document sampling cap — actual size is unknown.`,
                suggestion:
                    `If this collection grows unbounded, set up a Cloud Function or cron job to archive or delete old documents. ` +
                    `Run with --limit ${options.limit * 5} for a fuller cost picture.`,
            });
        }
    }

    return issues;
}
