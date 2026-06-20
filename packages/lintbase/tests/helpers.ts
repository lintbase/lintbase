// tests/helpers.ts
// Shared factory functions for building mock LintBaseScanResult objects.
// Keep these minimal — only what analyzers actually need to run.

import { LintBaseDocument, LintBaseScanResult } from '../src/types/index.js';
import { AnalysisOptions } from '../src/utils/analysis.utils.js';

/** Build a minimal LintBaseDocument with sensible defaults */
export function makeDoc(
    overrides: Partial<LintBaseDocument> & Pick<LintBaseDocument, 'id' | 'collection'>
): LintBaseDocument {
    return {
        fields: {},
        depth: 1,
        sizeBytes: 100,
        ...overrides,
    };
}

/** Build a LintBaseScanResult for the given collections + documents */
export function makeScanResult(
    collections: string[],
    documents: LintBaseDocument[] = []
): LintBaseScanResult {
    return {
        connector: 'firestore',
        collections,
        documentCount: documents.length,
        documents,
        scannedAt: new Date(),
    };
}

/** Default analysis options used in most tests */
export const DEFAULT_OPTIONS: AnalysisOptions = { limit: 100 };
