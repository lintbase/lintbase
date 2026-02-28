// src/analyzers/security.analyzer.ts
//
// Detects collections and document patterns that indicate security risks.
// Rules:
//   security/sensitive-collection       — name matches known-sensitive patterns (error)
//   security/debug-data-in-production   — name matches debug/test/log patterns (error)
//   security/stub-auth-collection       — Users/auth collection with suspiciously few docs (warning)
//   security/field-contains-secret      — field name matches secret-looking patterns (error)

import { LintBaseIssue, LintBaseScanResult } from '../types/index.js';
import { groupByCollection, AnalysisOptions } from '../utils/analysis.utils.js';

// Collection names that suggest sensitive PII / financial data
const SENSITIVE_PATTERNS = [
    /^bank/i,
    /credit/i,
    /payment/i,
    /invoice/i,
    /billing/i,
    /ssn/i,
    /passport/i,
    /secret/i,
    /password/i,
    /private/i,
    /token/i,
    /api.?key/i,
    /credential/i,
    /account.?info/i,
];

// Collection names that indicate debug / ephemeral data left in production
const DEBUG_PATTERNS = [
    /^console/i,
    /^log[s]?$/i,
    /^debug/i,
    /^test/i,
    /^temp/i,
    /^request(get|post|put|delete|patch)$/i,
    /payload/i,
    /webhook\s*log/i,
    /^dev/i,
];

// Field names that may hold secrets.
// Use word boundaries (\b) to prevent matching substrings inside common field names.
// e.g. /ssn/i would wrongly match "busine**ssN**ame" without the boundary.
const SENSITIVE_FIELD_PATTERNS = [
    /\bpassword\b/i,
    /\bpasswd\b/i,
    /\bsecret\b/i,
    /\bapi[_-]?key\b/i,
    /\bprivate[_-]?key\b/i,
    /\btoken\b/i,
    /\bssn\b/i,
    /\bcredit[_-]?card\b/i,
    /\bcvv\b/i,
    /\b(card[_-]?)?pin\b/i,
];

// Well-known auth collection names worth monitoring  
const AUTH_COLLECTION_NAMES = /^(users?|accounts?|membres?|members?)$/i;

export function analyze(
    result: LintBaseScanResult,
    _options: AnalysisOptions
): LintBaseIssue[] {
    const issues: LintBaseIssue[] = [];
    const byCollection = groupByCollection(result);

    for (const [col, stats] of byCollection.entries()) {
        // ── security/sensitive-collection ──────────────────────────────────────
        const matchedSensitive = SENSITIVE_PATTERNS.find((re) => re.test(col));
        if (matchedSensitive) {
            issues.push({
                severity: 'error',
                collection: col,
                rule: 'security/sensitive-collection',
                message:
                    `Collection "${col}" appears to store sensitive data (matched pattern: ${matchedSensitive}).`,
                suggestion:
                    'Verify that Firestore Security Rules restrict read access to authenticated users only. ' +
                    'Consider encrypting sensitive fields at the application layer before writing to Firestore.',
            });
        }

        // ── security/debug-data-in-production ──────────────────────────────────
        const matchedDebug = DEBUG_PATTERNS.find((re) => re.test(col));
        if (matchedDebug) {
            issues.push({
                severity: 'error',
                collection: col,
                rule: 'security/debug-data-in-production',
                message:
                    `Collection "${col}" looks like debug or test data left in production (matched pattern: ${matchedDebug}).`,
                suggestion:
                    'Delete or archive this collection. Debug data in production is a security and cost risk — ' +
                    'it may expose internal request/response payloads and accumulates unbounded write costs.',
            });
        }

        // ── security/stub-auth-collection ──────────────────────────────────────
        if (AUTH_COLLECTION_NAMES.test(col) && stats.count < 3 && stats.avgBytes < 50) {
            issues.push({
                severity: 'warning',
                collection: col,
                rule: 'security/stub-auth-collection',
                message:
                    `"${col}" looks like an auth/user collection but contains very few, tiny documents ` +
                    `(${stats.count} docs, avg ${stats.avgBytes} bytes). It may be a stub or orphaned.`,
                suggestion:
                    'Confirm whether user data is stored here or in Firebase Auth. ' +
                    'Orphaned collections should be removed to avoid confusing security rule coverage.',
            });
        }

        // ── security/field-contains-secret ─────────────────────────────────────
        if (stats.count === 0) continue;

        // Collect all unique field names across all docs in the collection
        const allFieldNames = new Set<string>();
        for (const doc of stats.docs) {
            for (const field of Object.keys(doc.fields)) {
                allFieldNames.add(field);
            }
        }

        for (const field of allFieldNames) {
            const matchedField = SENSITIVE_FIELD_PATTERNS.find((re) => re.test(field));
            if (matchedField) {
                issues.push({
                    severity: 'error',
                    collection: col,
                    rule: 'security/field-contains-secret',
                    message:
                        `Field "${field}" in "${col}" has a name that suggests it stores a secret or PII value.`,
                    suggestion:
                        'Never store raw passwords, tokens, or PII in Firestore. ' +
                        'Hash passwords, use Firebase Auth for credentials, and encrypt PII before storage.',
                });
            }
        }
    }

    return issues;
}
