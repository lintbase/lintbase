// tests/analyzers/cost.test.ts
import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/analyzers/cost.analyzer.js';
import { makeDoc, makeScanResult, DEFAULT_OPTIONS } from '../helpers.js';

describe('cost analyzer', () => {

    // ── cost/logging-sink ─────────────────────────────────────────────────────
    describe('cost/logging-sink', () => {
        it('flags "consoleLog" as a logging sink', () => {
            const docs = [makeDoc({ id: 'd1', collection: 'consoleLog', sizeBytes: 50 })];
            const result = makeScanResult(['consoleLog'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const logging = issues.filter((i) => i.rule === 'cost/logging-sink');
            expect(logging).toHaveLength(1);
            expect(logging[0]!.severity).toBe('error');
        });

        it('flags "requestGet", "requestPost", and "testPayload"', () => {
            const cols = ['requestGet', 'requestPost', 'testPayload'];
            const docs = cols.map((c) => makeDoc({ id: 'd1', collection: c, sizeBytes: 100 }));
            const result = makeScanResult(cols, docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const sinkCollections = issues
                .filter((i) => i.rule === 'cost/logging-sink')
                .map((i) => i.collection);

            expect(sinkCollections).toContain('requestGet');
            expect(sinkCollections).toContain('requestPost');
            expect(sinkCollections).toContain('testPayload');
        });

        it('does not flag a normal business collection like "Invoices"', () => {
            const docs = [makeDoc({ id: 'd1', collection: 'Invoices', sizeBytes: 500 })];
            const result = makeScanResult(['Invoices'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'cost/logging-sink')).toHaveLength(0);
        });
    });

    // ── cost/redundant-collections ────────────────────────────────────────────
    describe('cost/redundant-collections', () => {
        it('flags two collections with identical avg byte size and same depth', () => {
            // Both collections have the same avg bytes (916) and same max depth (3)
            const colA = Array.from({ length: 10 }, (_, i) =>
                makeDoc({ id: `a${i}`, collection: 'ColA', depth: 3, sizeBytes: 916 })
            );
            const colB = Array.from({ length: 10 }, (_, i) =>
                makeDoc({ id: `b${i}`, collection: 'ColB', depth: 3, sizeBytes: 916 })
            );
            const result = makeScanResult(['ColA', 'ColB'], [...colA, ...colB]);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const redundant = issues.filter((i) => i.rule === 'cost/redundant-collections');
            expect(redundant).toHaveLength(1);
            expect(redundant[0]!.severity).toBe('warning');
            expect(redundant[0]!.message).toContain('ColA');
            expect(redundant[0]!.message).toContain('ColB');
        });

        it('does not flag two collections with very different avg sizes', () => {
            const colA = [makeDoc({ id: 'a1', collection: 'Big', depth: 2, sizeBytes: 10000 })];
            const colB = [makeDoc({ id: 'b1', collection: 'Small', depth: 2, sizeBytes: 50 })];
            const result = makeScanResult(['Big', 'Small'], [...colA, ...colB]);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'cost/redundant-collections')).toHaveLength(0);
        });

        it('groups three redundant collections into one issue', () => {
            const makeCol = (name: string) =>
                Array.from({ length: 10 }, (_, i) =>
                    makeDoc({ id: `${name}${i}`, collection: name, depth: 3, sizeBytes: 916 })
                );

            const result = makeScanResult(
                ['reqGet', 'reqPost', 'testData'],
                [...makeCol('reqGet'), ...makeCol('reqPost'), ...makeCol('testData')]
            );
            const issues = analyze(result, DEFAULT_OPTIONS);

            const redundant = issues.filter((i) => i.rule === 'cost/redundant-collections');
            // Should produce exactly 1 group containing all 3
            expect(redundant).toHaveLength(1);
            expect(redundant[0]!.message).toContain('reqGet');
            expect(redundant[0]!.message).toContain('reqPost');
            expect(redundant[0]!.message).toContain('testData');
        });
    });

    // ── cost/large-avg-document ───────────────────────────────────────────────
    describe('cost/large-avg-document', () => {
        it('emits a warning for a collection averaging > 5 KB', () => {
            const docs = Array.from({ length: 3 }, (_, i) =>
                makeDoc({ id: `d${i}`, collection: 'BigDocs', depth: 2, sizeBytes: 6 * 1024 })
            );
            const result = makeScanResult(['BigDocs'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const large = issues.filter(
                (i) => i.rule === 'cost/large-avg-document' && i.severity === 'warning'
            );
            expect(large).toHaveLength(1);
        });

        it('emits an error for a collection averaging > 50 KB', () => {
            const docs = [makeDoc({ id: 'd1', collection: 'Monsters', depth: 2, sizeBytes: 60 * 1024 })];
            const result = makeScanResult(['Monsters'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const large = issues.filter(
                (i) => i.rule === 'cost/large-avg-document' && i.severity === 'error'
            );
            expect(large).toHaveLength(1);
        });

        it('does not flag a collection averaging < 5 KB', () => {
            const docs = [makeDoc({ id: 'd1', collection: 'Light', depth: 1, sizeBytes: 300 })];
            const result = makeScanResult(['Light'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'cost/large-avg-document')).toHaveLength(0);
        });
    });

    // ── cost/collection-at-limit ──────────────────────────────────────────────
    describe('cost/collection-at-limit', () => {
        it('emits an info issue when the collection has exactly --limit docs', () => {
            const limit = 10;
            const docs = Array.from({ length: limit }, (_, i) =>
                makeDoc({ id: `d${i}`, collection: 'Huge', depth: 1, sizeBytes: 500 })
            );
            const result = makeScanResult(['Huge'], docs);
            const issues = analyze(result, { limit });

            const atLimit = issues.filter((i) => i.rule === 'cost/collection-at-limit');
            expect(atLimit).toHaveLength(1);
            expect(atLimit[0]!.severity).toBe('info');
        });
    });

});
