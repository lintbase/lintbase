// src/analyzers/schema-drift.analyzer.ts
//
// Detects inconsistencies in field shapes across documents in the same collection.
// Rules:
//   schema/field-type-mismatch  — same field holds multiple types
//   schema/sparse-field         — field present in <60% of docs (warning)
//   schema/high-field-variance  — field count varies wildly across docs (warning)
//   schema/empty-collection     — 0 docs sampled, schema cannot be analysed (info)

import { LintBaseIssue, LintBaseScanResult } from '../types/index.js';
import { groupByCollection, AnalysisOptions } from '../utils/analysis.utils.js';

export function analyze(
    result: LintBaseScanResult,
    _options: AnalysisOptions
): LintBaseIssue[] {
    const issues: LintBaseIssue[] = [];
    const byCollection = groupByCollection(result);

    for (const [col, stats] of byCollection.entries()) {
        // ── Empty collection — can't analyse schema ────────────────────────────
        if (stats.count === 0) {
            issues.push({
                severity: 'info',
                collection: col,
                rule: 'schema/empty-collection',
                message: `No documents were sampled from "${col}" — schema cannot be analysed.`,
                suggestion: 'Ensure the collection contains data or check Firestore security rules.',
            });
            continue;
        }

        // Build a map of field → set of observed types
        const fieldTypes = new Map<string, Set<string>>();
        const fieldCounts = new Map<string, number>();
        const fieldCountsPerDoc: number[] = [];

        for (const doc of stats.docs) {
            let docFieldCount = 0;
            for (const [field, { type }] of Object.entries(doc.fields)) {
                docFieldCount++;
                if (!fieldTypes.has(field)) fieldTypes.set(field, new Set());
                fieldTypes.get(field)!.add(type);
                fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
            }
            fieldCountsPerDoc.push(docFieldCount);
        }

        // ── schema/field-type-mismatch ─────────────────────────────────────────
        for (const [field, types] of fieldTypes.entries()) {
            if (types.size > 1) {
                issues.push({
                    severity: 'error',
                    collection: col,
                    rule: 'schema/field-type-mismatch',
                    message:
                        `Field "${field}" in "${col}" has ${types.size} different types: ` +
                        `[${[...types].join(', ')}].`,
                    suggestion:
                        'Normalise this field to a single type. Schema drift makes queries unreliable and is hard to fix at scale.',
                });
            }
        }

        // ── schema/sparse-field ────────────────────────────────────────────────
        const presence60 = stats.count * 0.6;
        const presence80 = stats.count * 0.8;

        for (const [field, count] of fieldCounts.entries()) {
            if (count < presence60) {
                issues.push({
                    severity: 'warning',
                    collection: col,
                    rule: 'schema/sparse-field',
                    message:
                        `Field "${field}" in "${col}" is present in only ${count}/${stats.count} documents (${Math.round((count / stats.count) * 100)}%).`,
                    suggestion:
                        'Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.',
                });
            } else if (count < presence80) {
                issues.push({
                    severity: 'info',
                    collection: col,
                    rule: 'schema/sparse-field',
                    message:
                        `Field "${field}" in "${col}" is present in ${count}/${stats.count} documents (${Math.round((count / stats.count) * 100)}%).`,
                    suggestion:
                        'Track optional fields explicitly in your data model to avoid unexpected undefined reads.',
                });
            }
        }

        // ── schema/high-field-variance ─────────────────────────────────────────
        if (fieldCountsPerDoc.length > 1) {
            const min = Math.min(...fieldCountsPerDoc);
            const max = Math.max(...fieldCountsPerDoc);
            if (max > 0 && max - min > Math.max(3, min * 0.5)) {
                issues.push({
                    severity: 'warning',
                    collection: col,
                    rule: 'schema/high-field-variance',
                    message:
                        `Documents in "${col}" have between ${min} and ${max} fields — high structural variance.`,
                    suggestion:
                        'High field variance is a sign of schema drift over time. Consider a migration or schema validation layer.',
                });
            }
        }
    }

    return issues;
}
