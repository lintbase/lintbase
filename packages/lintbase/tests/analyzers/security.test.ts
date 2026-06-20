// tests/analyzers/security.test.ts
import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/analyzers/security.analyzer.js';
import { makeDoc, makeScanResult, DEFAULT_OPTIONS } from '../helpers.js';

describe('security analyzer', () => {

    // ── security/sensitive-collection ─────────────────────────────────────────
    describe('security/sensitive-collection', () => {
        it('flags a collection named "bankinfo"', () => {
            const docs = [makeDoc({ id: 'd1', collection: 'bankinfo' })];
            const result = makeScanResult(['bankinfo'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const sensitive = issues.filter((i) => i.rule === 'security/sensitive-collection');
            expect(sensitive).toHaveLength(1);
            expect(sensitive[0]!.severity).toBe('error');
        });

        it('flags collections matching other sensitive patterns (payment, credential)', () => {
            const result = makeScanResult(['paymentMethods', 'userCredentials'], []);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const rules = issues
                .filter((i) => i.rule === 'security/sensitive-collection')
                .map((i) => i.collection);

            expect(rules).toContain('paymentMethods');
            expect(rules).toContain('userCredentials');
        });

        it('does not flag a benign collection name like "Products"', () => {
            const result = makeScanResult(['Products'], []);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'security/sensitive-collection')).toHaveLength(0);
        });
    });

    // ── security/debug-data-in-production ─────────────────────────────────────
    describe('security/debug-data-in-production', () => {
        it('flags "consoleLog" as debug data in production', () => {
            const result = makeScanResult(['consoleLog'], []);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const debug = issues.filter((i) => i.rule === 'security/debug-data-in-production');
            expect(debug).toHaveLength(1);
            expect(debug[0]!.severity).toBe('error');
        });

        it('flags "requestGet", "requestPost", and "testPayload"', () => {
            const result = makeScanResult(['requestGet', 'requestPost', 'testPayload'], []);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const debugCollections = issues
                .filter((i) => i.rule === 'security/debug-data-in-production')
                .map((i) => i.collection);

            expect(debugCollections).toContain('requestGet');
            expect(debugCollections).toContain('requestPost');
            expect(debugCollections).toContain('testPayload');
        });

        it('does not flag a normal collection like "Invoices"', () => {
            const result = makeScanResult(['Invoices'], []);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(
                issues.filter((i) => i.rule === 'security/debug-data-in-production')
            ).toHaveLength(0);
        });
    });

    // ── security/field-contains-secret ────────────────────────────────────────
    describe('security/field-contains-secret', () => {
        it('flags a field named "password"', () => {
            const docs = [
                makeDoc({
                    id: 'd1',
                    collection: 'Users',
                    fields: { password: { value: 'hashed', type: 'string' } },
                }),
            ];
            const result = makeScanResult(['Users'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.some((i) => i.rule === 'security/field-contains-secret')).toBe(true);
        });

        it('flags a field named "apiKey"', () => {
            const docs = [
                makeDoc({
                    id: 'd1',
                    collection: 'Integrations',
                    fields: { apiKey: { value: 'sk-xxx', type: 'string' } },
                }),
            ];
            const result = makeScanResult(['Integrations'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.some((i) => i.rule === 'security/field-contains-secret')).toBe(true);
        });

        it('does NOT flag "businessName" (regression — ssN substring false positive)', () => {
            const docs = [
                makeDoc({
                    id: 'd1',
                    collection: 'Leads',
                    // "businessName" contains "ssN" but should NOT match \bssn\b
                    fields: { businessName: { value: 'Acme Corp', type: 'string' } },
                }),
            ];
            const result = makeScanResult(['Leads'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'security/field-contains-secret')).toHaveLength(0);
        });

        it('does NOT flag common address fields like "streetName" or "addressLocation"', () => {
            const docs = [
                makeDoc({
                    id: 'd1',
                    collection: 'Members',
                    fields: {
                        streetName: { value: 'Main St', type: 'string' },
                        addressLocation: { value: '...', type: 'string' },
                        pinCode: { value: '12345', type: 'string' }, // pinCode has "pin" but not \bpin\b standalone
                    },
                }),
            ];
            const result = makeScanResult(['Members'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            // "pinCode" — our regex is \b(card_?)?pin\b which won't match "pinCode" (no \b after pin)
            // "streetName", "addressLocation" — no match
            const secrets = issues.filter((i) => i.rule === 'security/field-contains-secret');
            const flaggedFields = secrets.map((i) => i.message);
            expect(flaggedFields.some((m) => m.includes('streetName'))).toBe(false);
            expect(flaggedFields.some((m) => m.includes('addressLocation'))).toBe(false);
        });
    });

    // ── security/stub-auth-collection ─────────────────────────────────────────
    describe('security/stub-auth-collection', () => {
        it('flags a "Users" collection with 1 tiny document (stub/orphaned)', () => {
            const docs = [makeDoc({ id: 'd1', collection: 'Users', depth: 1, sizeBytes: 2 })];
            const result = makeScanResult(['Users'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            const stub = issues.filter((i) => i.rule === 'security/stub-auth-collection');
            expect(stub).toHaveLength(1);
            expect(stub[0]!.severity).toBe('warning');
        });

        it('does not flag a "Users" collection with many real documents', () => {
            const docs = Array.from({ length: 50 }, (_, i) =>
                makeDoc({ id: `u${i}`, collection: 'Users', depth: 2, sizeBytes: 500 })
            );
            const result = makeScanResult(['Users'], docs);
            const issues = analyze(result, DEFAULT_OPTIONS);

            expect(issues.filter((i) => i.rule === 'security/stub-auth-collection')).toHaveLength(0);
        });
    });

});
