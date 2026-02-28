// src/types/index.ts
// Core type contract — every connector must produce these shapes.
// Analyzers are database-agnostic because they only consume these types.

export interface LintBaseDocument {
    id: string;
    collection: string;
    fields: Record<string, { value: unknown; type: string }>;
    depth: number;
    sizeBytes: number;
}

export interface LintBaseScanResult {
    connector: string;        // e.g. "firestore"
    collections: string[];
    documentCount: number;
    documents: LintBaseDocument[];
    scannedAt: Date;
}

export interface LintBaseIssue {
    severity: 'error' | 'warning' | 'info';
    collection: string;
    rule: string;
    message: string;
    affectedDocuments?: string[];
    suggestion?: string;
}

export interface LintBaseReport {
    summary: {
        totalCollections: number;
        totalDocuments: number;
        errors: number;
        warnings: number;
        infos: number;
        riskScore: number;   // 0–100
    };
    issues: LintBaseIssue[];
    scannedAt: Date;
}
