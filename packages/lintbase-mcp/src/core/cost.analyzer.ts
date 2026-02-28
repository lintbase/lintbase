// packages/lintbase-mcp/src/core/cost.analyzer.ts
import { LintBaseIssue, LintBaseScanResult } from '../types.js';
import { groupByCollection, AnalysisOptions } from './analysis.utils.js';

const ERROR_AVG_BYTES = 50 * 1024;
const WARN_AVG_BYTES = 5 * 1024;
const LOG_SINK_PATTERNS = [/^console/i, /^log[s]?$/i, /^audit/i, /^event[s]?$/i, /^request(get|post|put|delete|patch)$/i, /payload/i, /^trace[s]?$/i, /^webhook/i, /^analytics/i];

export function analyze(result: LintBaseScanResult, options: AnalysisOptions): LintBaseIssue[] {
    const issues: LintBaseIssue[] = [];
    const byCollection = groupByCollection(result);

    for (const [col, stats] of byCollection.entries()) {
        if (stats.count === 0) continue;
        if (stats.avgBytes > ERROR_AVG_BYTES) {
            issues.push({ severity: 'error', collection: col, rule: 'cost/large-avg-document', message: `"${col}" has an average document size of ${(stats.avgBytes / 1024).toFixed(1)} KB. At scale this will significantly increase read bandwidth costs.`, suggestion: 'Move large blob fields to Cloud Storage or a separate sub-collection.' });
        } else if (stats.avgBytes > WARN_AVG_BYTES) {
            issues.push({ severity: 'warning', collection: col, rule: 'cost/large-avg-document', message: `"${col}" average document size is ${(stats.avgBytes / 1024).toFixed(1)} KB.`, suggestion: 'Consider splitting large documents or using sub-collections for frequently-updated sub-objects.' });
        }
    }

    for (const [col] of byCollection.entries()) {
        if (LOG_SINK_PATTERNS.some((re) => re.test(col))) {
            issues.push({ severity: 'error', collection: col, rule: 'cost/logging-sink', message: `"${col}" appears to be used as a logging or event sink. Firestore charges per document write — unbounded logging will compound costs.`, suggestion: 'Use Cloud Logging, BigQuery, or a dedicated logging service instead.' });
        }
    }

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
            const byteRatio = statsA.avgBytes > 0 ? Math.abs(statsA.avgBytes - statsB.avgBytes) / statsA.avgBytes : 1;
            if (byteRatio <= 0.15 && statsA.maxDepth === statsB.maxDepth && statsA.avgBytes > 0) {
                group.push(colB);
                visited.add(colB);
            }
        }
        if (group.length > 1) { redundancyGroups.push(group); for (const c of group) visited.add(c); }
    }
    for (const group of redundancyGroups) {
        issues.push({ severity: 'warning', collection: group[0]!, rule: 'cost/redundant-collections', message: `Collections [${group.map((c) => `"${c}"`).join(', ')}] have identical average document sizes and nesting depth — they likely store the same schema.`, suggestion: 'Merge redundant collections into one, using a "type" field to differentiate records.' });
    }

    for (const [col, stats] of byCollection.entries()) {
        if (stats.count === options.limit) {
            issues.push({ severity: 'info', collection: col, rule: 'cost/collection-at-limit', message: `"${col}" hit the ${options.limit}-document sampling cap — actual size is unknown.`, suggestion: `If this collection grows unbounded, set up a Cloud Function or cron job to archive or delete old documents.` });
        }
    }

    return issues;
}
