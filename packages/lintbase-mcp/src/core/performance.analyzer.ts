// packages/lintbase-mcp/src/core/performance.analyzer.ts
import { LintBaseIssue, LintBaseScanResult } from '../types.js';
import { groupByCollection, AnalysisOptions } from './analysis.utils.js';

const MAX_RECOMMENDED_DEPTH = 5;
const WARN_DEPTH = 3;
const ERROR_SIZE_BYTES = 500 * 1024;
const WARN_SIZE_BYTES = 50 * 1024;
const WARN_AVG_BYTES = 100 * 1024;

export function analyze(result: LintBaseScanResult, options: AnalysisOptions): LintBaseIssue[] {
    const issues: LintBaseIssue[] = [];
    const byCollection = groupByCollection(result);

    for (const [col, stats] of byCollection.entries()) {
        if (stats.count === 0) continue;

        if (stats.maxDepth > MAX_RECOMMENDED_DEPTH) {
            issues.push({ severity: 'error', collection: col, rule: 'perf/excessive-nesting', message: `"${col}" contains documents nested ${stats.maxDepth} levels deep (recommended max: ${MAX_RECOMMENDED_DEPTH}).`, affectedDocuments: stats.docs.filter((d) => d.depth > MAX_RECOMMENDED_DEPTH).map((d) => d.id).slice(0, 5), suggestion: 'Flatten deeply nested objects into separate sub-collections or top-level fields.' });
        } else if (stats.maxDepth > WARN_DEPTH) {
            issues.push({ severity: 'warning', collection: col, rule: 'perf/excessive-nesting', message: `"${col}" documents reach a nesting depth of ${stats.maxDepth}. Consider keeping nesting ≤ ${WARN_DEPTH} for optimal query performance.`, affectedDocuments: stats.docs.filter((d) => d.depth > WARN_DEPTH).map((d) => d.id).slice(0, 5), suggestion: 'Deep nesting makes composite indexes necessary and increases document read cost.' });
        }

        const oversizedDocs = stats.docs.filter((d) => d.sizeBytes > ERROR_SIZE_BYTES);
        const largeDocs = stats.docs.filter((d) => d.sizeBytes > WARN_SIZE_BYTES && d.sizeBytes <= ERROR_SIZE_BYTES);

        if (oversizedDocs.length > 0) {
            issues.push({ severity: 'error', collection: col, rule: 'perf/document-too-large', message: `${oversizedDocs.length} document(s) in "${col}" exceed 500 KB. Largest: ${Math.round(oversizedDocs[0]!.sizeBytes / 1024)} KB.`, affectedDocuments: oversizedDocs.map((d) => d.id).slice(0, 5), suggestion: 'Split large documents or move blob data to Cloud Storage.' });
        }
        if (largeDocs.length > 0) {
            issues.push({ severity: 'warning', collection: col, rule: 'perf/document-too-large', message: `${largeDocs.length} document(s) in "${col}" are between 50 KB and 500 KB.`, affectedDocuments: largeDocs.map((d) => d.id).slice(0, 5), suggestion: 'Large documents increase read latency and bandwidth cost.' });
        }
        if (stats.avgBytes > WARN_AVG_BYTES) {
            issues.push({ severity: 'warning', collection: col, rule: 'perf/avg-document-large', message: `"${col}" has an average document size of ${Math.round(stats.avgBytes / 1024)} KB.`, suggestion: 'Consider pagination, partial reads, or moving large fields to a sub-collection.' });
        }
        if (stats.count === options.limit) {
            issues.push({ severity: 'info', collection: col, rule: 'perf/sampling-limit-reached', message: `"${col}" returned exactly ${options.limit} documents — the sampling limit. This collection likely has more data.`, suggestion: `Run with a higher sampleSize for a more complete picture of "${col}".` });
        }
    }
    return issues;
}
