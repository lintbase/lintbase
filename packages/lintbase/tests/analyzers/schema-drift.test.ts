// tests/analyzers/schema-drift.test.ts
import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/analyzers/schema-drift.analyzer.js';
import { makeDoc, makeScanResult, DEFAULT_OPTIONS } from '../helpers.js';

describe('schema-drift analyzer', () => {

    // ── schema/field-type-mismatch ───────────────────────────────────────────
    describe('schema/field-type-mismatch', () => {
        it('flags a field that has two different types across documents', () => {
            const docs = [
                makeDoc({
                    id: 'doc1', collection: 'Orders',
                    fields: { status: { value: 'active', type: 'string' } },
                }),
                makeDoc({
                    id: 'doc2', collection: 'Orders',
                    fields: { status: { value: 42, type: 'number' } },
                }),
            ];
            const result = makeScanResult(['Orders'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const mismatch = issues.filter((i) => i.rule === 'schema/field-type-mismatch');
            expect(mismatch).toHaveLength(1);
            expect(mismatch[0]!.severity).toBe('error');
            expect(mismatch[0]!.message).toContain('status');
            expect(mismatch[0]!.message).toContain('string');
            expect(mismatch[0]!.message).toContain('number');
        });

        it('does not flag a field that has a consistent type', () => {
            const docs = [
                makeDoc({ id: 'doc1', collection: 'Users', fields: { name: { value: 'Alice', type: 'string' } } }),
                makeDoc({ id: 'doc2', collection: 'Users', fields: { name: { value: 'Bob', type: 'string' } } }),
            ];
            const result = makeScanResult(['Users'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const mismatch = issues.filter((i) => i.rule === 'schema/field-type-mismatch');
            expect(mismatch).toHaveLength(0);
        });

        it('flags null vs map type mismatch (real-world pattern)', () => {
            const docs = [
                makeDoc({ id: 'a', collection: 'Tenants', fields: { payload: { value: null, type: 'null' } } }),
                makeDoc({ id: 'b', collection: 'Tenants', fields: { payload: { value: {}, type: 'map' } } }),
            ];
            const result = makeScanResult(['Tenants'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.some((i) => i.rule === 'schema/field-type-mismatch')).toBe(true);
        });
    });

    // ── schema/sparse-field ───────────────────────────────────────────────────
    describe('schema/sparse-field', () => {
        it('flags a field present in only 1/10 docs as a warning (10% < 60%)', () => {
            const docs = Array.from({ length: 10 }, (_, i) =>
                makeDoc({
                    id: `doc${i}`,
                    collection: 'Products',
                    fields: i === 0
                        ? { discount: { value: 10, type: 'number' } }
                        : {},
                })
            );
            const result = makeScanResult(['Products'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const sparse = issues.filter(
                (i) => i.rule === 'schema/sparse-field' && i.severity === 'warning'
            );
            expect(sparse.some((i) => i.message.includes('discount'))).toBe(true);
        });

        it('emits info (not warning) for a field present in 7/10 docs (70%, between 60–80%)', () => {
            const docs = Array.from({ length: 10 }, (_, i) =>
                makeDoc({
                    id: `doc${i}`,
                    collection: 'Items',
                    fields: i < 7
                        ? { tag: { value: 'foo', type: 'string' } }
                        : {},
                })
            );
            const result = makeScanResult(['Items'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const infoIssues = issues.filter(
                (i) => i.rule === 'schema/sparse-field' && i.severity === 'info'
            );
            expect(infoIssues.some((i) => i.message.includes('tag'))).toBe(true);
        });

        it('does not flag a field present in all documents', () => {
            const docs = Array.from({ length: 5 }, (_, i) =>
                makeDoc({ id: `d${i}`, collection: 'X', fields: { name: { value: 'n', type: 'string' } } })
            );
            const result = makeScanResult(['X'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'schema/sparse-field')).toHaveLength(0);
        });
    });

    // ── schema/high-field-variance ────────────────────────────────────────────
    describe('schema/high-field-variance', () => {
        it('flags a collection where field counts vary widely', () => {
            const docs = [
                makeDoc({
                    id: 'small', collection: 'Records',
                    fields: { a: { value: 1, type: 'number' } },
                }),
                makeDoc({
                    id: 'big', collection: 'Records',
                    fields: Object.fromEntries(
                        Array.from({ length: 20 }, (_, i) => [`field${i}`, { value: i, type: 'number' }])
                    ),
                }),
            ];
            const result = makeScanResult(['Records'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.some((i) => i.rule === 'schema/high-field-variance')).toBe(true);
        });
    });

    // ── schema/empty-collection ───────────────────────────────────────────────
    describe('schema/empty-collection', () => {
        it('emits an info issue for a collection with 0 sampled documents', () => {
            const result = makeScanResult(['EmptyCollection'], []);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const empty = issues.filter((i) => i.rule === 'schema/empty-collection');
            expect(empty).toHaveLength(1);
            expect(empty[0]!.severity).toBe('info');
            expect(empty[0]!.collection).toBe('EmptyCollection');
        });
    });

});
