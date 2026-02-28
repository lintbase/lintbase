// packages/lintbase-mcp/src/types.ts
// Re-exports the LintBase core types.
// The MCP package copies these (rather than importing from the CLI package)
// so both packages can be published and versioned independently on npm.

export interface LintBaseDocument {
    id: string;
    collection: string;
    fields: Record<string, { value: unknown; type: string }>;
    depth: number;
    sizeBytes: number;
}

export interface LintBaseScanResult {
    connector: string;
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
        riskScore: number;
    };
    issues: LintBaseIssue[];
    scannedAt: Date;
}
