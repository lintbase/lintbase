// src/analyzers/performance.analyzer.ts
//
// Detects document shapes that will hurt Firestore query performance or hit platform limits.
// Rules:
//   perf/excessive-nesting      — depth > 5 (error), depth > 3 (warning)
//   perf/document-too-large     — individual doc > 500 KB (error), > 50 KB (warning)
//   perf/avg-document-large     — collection avg > 100 KB (warning)
//   perf/sampling-limit-reached — collection hit the --limit cap (info)

import { LintBaseIssue, LintBaseScanResult } from '../types/index.js';
import { groupByCollection, AnalysisOptions } from '../utils/analysis.utils.js';

const MAX_RECOMMENDED_DEPTH = 5;
const WARN_DEPTH = 3;
const ERROR_SIZE_BYTES = 500 * 1024;   // 500 KB
const WARN_SIZE_BYTES = 50 * 1024;   // 50 KB
const WARN_AVG_BYTES = 100 * 1024;   // 100 KB

export function analyze(
    result: LintBaseScanResult,
    options: AnalysisOptions
): LintBaseIssue[] {
    const issues: LintBaseIssue[] = [];
    const byCollection = groupByCollection(result);

    for (const [col, stats] of byCollection.entries()) {
        if (stats.count === 0) continue;

        // ── perf/excessive-nesting ─────────────────────────────────────────────
        if (stats.maxDepth > MAX_RECOMMENDED_DEPTH) {
            const deepDocs = stats.docs
                .filter((d) => d.depth > MAX_RECOMMENDED_DEPTH)
                .map((d) => d.id);

            issues.push({
                severity: 'error',
                collection: col,
                rule: 'perf/excessive-nesting',
                message:
                    `"${col}" contains documents nested ${stats.maxDepth} levels deep ` +
                    `(recommended max: ${MAX_RECOMMENDED_DEPTH}).`,
                affectedDocuments: deepDocs.slice(0, 5),
                suggestion:
                    'Flatten deeply nested objects into separate sub-collections or top-level fields. ' +
                    'Firestore queries cannot filter or order on nested fields beyond 1 level without composite indexes.',
            });
        } else if (stats.maxDepth > WARN_DEPTH) {
            const deepDocs = stats.docs
                .filter((d) => d.depth > WARN_DEPTH)
                .map((d) => d.id);

            issues.push({
                severity: 'warning',
                collection: col,
                rule: 'perf/excessive-nesting',
                message:
                    `"${col}" documents reach a nesting depth of ${stats.maxDepth}. ` +
                    `Consider keeping nesting ≤ ${WARN_DEPTH} for optimal query performance.`,
                affectedDocuments: deepDocs.slice(0, 5),
                suggestion:
                    'Deep nesting makes composite indexes necessary and increases document read cost. ' +
                    'Prefer flat structures where possible.',
            });
        }

        // ── perf/document-too-large ────────────────────────────────────────────
        const oversizedDocs = stats.docs.filter((d) => d.sizeBytes > ERROR_SIZE_BYTES);
        const largeDocs = stats.docs.filter(
            (d) => d.sizeBytes > WARN_SIZE_BYTES && d.sizeBytes <= ERROR_SIZE_BYTES
        );

        if (oversizedDocs.length > 0) {
            issues.push({
                severity: 'error',
                collection: col,
                rule: 'perf/document-too-large',
                message:
                    `${oversizedDocs.length} document(s) in "${col}" exceed 500 KB ` +
                    `(Firestore hard limit: 1 MB). Largest: ${Math.round(oversizedDocs[0]!.sizeBytes / 1024)} KB.`,
                affectedDocuments: oversizedDocs.map((d) => d.id).slice(0, 5),
                suggestion:
                    'Split large documents into smaller ones or move blob/array data to Cloud Storage.',
            });
        }

        if (largeDocs.length > 0) {
            issues.push({
                severity: 'warning',
                collection: col,
                rule: 'perf/document-too-large',
                message:
                    `${largeDocs.length} document(s) in "${col}" are between 50 KB and 500 KB.`,
                affectedDocuments: largeDocs.map((d) => d.id).slice(0, 5),
                suggestion:
                    'Large documents increase read latency and bandwidth cost. Consider splitting or archiving old data.',
            });
        }

        // ── perf/avg-document-large ────────────────────────────────────────────
        if (stats.avgBytes > WARN_AVG_BYTES) {
            issues.push({
                severity: 'warning',
                collection: col,
                rule: 'perf/avg-document-large',
                message:
                    `"${col}" has an average document size of ${Math.round(stats.avgBytes / 1024)} KB.`,
                suggestion:
                    'High average document size drives up read bandwidth costs. ' +
                    'Consider pagination, partial reads (select), or moving large fields to a sub-collection.',
            });
        }

        // ── perf/sampling-limit-reached ────────────────────────────────────────
        if (stats.count === options.limit) {
            issues.push({
                severity: 'info',
                collection: col,
                rule: 'perf/sampling-limit-reached',
                message:
                    `"${col}" returned exactly ${options.limit} documents — the sampling limit. ` +
                    `This collection likely has more data that was not analysed.`,
                suggestion:
                    `Run with a higher --limit (e.g. --limit 500) for a more complete picture of "${col}".`,
            });
        }
    }

    return issues;
}
