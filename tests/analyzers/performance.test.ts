// tests/analyzers/performance.test.ts
import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/analyzers/performance.analyzer.js';
import { makeDoc, makeScanResult, DEFAULT_OPTIONS } from '../helpers.js';

describe('performance analyzer', () => {

    // ── perf/excessive-nesting ────────────────────────────────────────────────
    describe('perf/excessive-nesting', () => {
        it('emits an error for a collection with max depth > 5', () => {
            const docs = [
                makeDoc({ id: 'deep', collection: 'Leads', depth: 7, sizeBytes: 500 }),
                makeDoc({ id: 'flat', collection: 'Leads', depth: 2, sizeBytes: 200 }),
            ];
            const result = makeScanResult(['Leads'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const nesting = issues.filter((i) => i.rule === 'perf/excessive-nesting');
            expect(nesting).toHaveLength(1);
            expect(nesting[0]!.severity).toBe('error');
            expect(nesting[0]!.message).toContain('7');
        });

        it('emits a warning for depth 4 (> WARN_DEPTH of 3, ≤ MAX_DEPTH of 5)', () => {
            const docs = [
                makeDoc({ id: 'd1', collection: 'Items', depth: 4, sizeBytes: 200 }),
            ];
            const result = makeScanResult(['Items'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const nesting = issues.filter((i) => i.rule === 'perf/excessive-nesting');
            expect(nesting).toHaveLength(1);
            expect(nesting[0]!.severity).toBe('warning');
        });

        it('emits no nesting issue for depth 2', () => {
            const docs = [makeDoc({ id: 'd', collection: 'Flat', depth: 2, sizeBytes: 100 })];
            const result = makeScanResult(['Flat'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'perf/excessive-nesting')).toHaveLength(0);
        });

        it('includes the affected document IDs in the issue', () => {
            const docs = [
                makeDoc({ id: 'deepDoc1', collection: 'Col', depth: 6, sizeBytes: 100 }),
                makeDoc({ id: 'deepDoc2', collection: 'Col', depth: 6, sizeBytes: 100 }),
            ];
            const result = makeScanResult(['Col'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const nesting = issues.filter((i) => i.rule === 'perf/excessive-nesting');
            expect(nesting[0]!.affectedDocuments).toContain('deepDoc1');
        });
    });

    // ── perf/document-too-large ───────────────────────────────────────────────
    describe('perf/document-too-large', () => {
        it('emits an error for a document exceeding 500 KB', () => {
            const oversizedBytes = 510 * 1024; // 510 KB
            const docs = [makeDoc({ id: 'big', collection: 'Blobs', depth: 1, sizeBytes: oversizedBytes })];
            const result = makeScanResult(['Blobs'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const large = issues.filter(
                (i) => i.rule === 'perf/document-too-large' && i.severity === 'error'
            );
            expect(large).toHaveLength(1);
        });

        it('emits a warning for documents between 50 KB and 500 KB', () => {
            const docs = [makeDoc({ id: 'medium', collection: 'Media', depth: 1, sizeBytes: 60 * 1024 })];
            const result = makeScanResult(['Media'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const large = issues.filter(
                (i) => i.rule === 'perf/document-too-large' && i.severity === 'warning'
            );
            expect(large).toHaveLength(1);
        });

        it('does not flag a small document', () => {
            const docs = [makeDoc({ id: 'small', collection: 'Light', depth: 1, sizeBytes: 500 })];
            const result = makeScanResult(['Light'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'perf/document-too-large')).toHaveLength(0);
        });
    });

    // ── perf/sampling-limit-reached ───────────────────────────────────────────
    describe('perf/sampling-limit-reached', () => {
        it('emits an info issue when the collection has exactly --limit docs', () => {
            const limit = 10;
            const docs = Array.from({ length: limit }, (_, i) =>
                makeDoc({ id: `d${i}`, collection: 'BigCollection', depth: 1, sizeBytes: 100 })
            );
            const result = makeScanResult(['BigCollection'], docs);
            const issues = analyze(result, { limit });

            const limitIssues = issues.filter((i) => i.rule === 'perf/sampling-limit-reached');
            expect(limitIssues).toHaveLength(1);
            expect(limitIssues[0]!.severity).toBe('info');
        });

        it('does not flag a collection with fewer than limit docs', () => {
            const docs = Array.from({ length: 5 }, (_, i) =>
                makeDoc({ id: `d${i}`, collection: 'Small', depth: 1, sizeBytes: 100 })
            );
            const result = makeScanResult(['Small'], docs);
            const issues = analyze(result, { limit: 100 }); // 5 < 100

            expect(issues.filter((i) => i.rule === 'perf/sampling-limit-reached')).toHaveLength(0);
        });
    });

});
