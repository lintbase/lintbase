// src/connectors/base.connector.ts
import { LintBaseDocument, LintBaseScanResult } from '../types/index.js';

/**
 * Every database connector must extend this class.
 * The contract guarantees that analyzers can remain database-agnostic.
 */
export abstract class BaseConnector {
    /** The unique identifier for this connector (e.g. "firestore") */
    abstract readonly name: string;

    /**
     * Establish a connection to the underlying database.
     * Throw a descriptive error if the connection fails.
     */
    abstract connect(): Promise<void>;

    /**
     * Return the list of top-level collection names.
     */
    abstract getCollections(): Promise<string[]>;

    /**
     * Sample up to `limit` documents from the given collection.
     * NEVER read more documents than `limit` to protect against accidental billing.
     */
    abstract sampleDocuments(
        collection: string,
        limit: number
    ): Promise<LintBaseDocument[]>;

    /**
     * Convenience method for programmatic use: connects, discovers, and samples.
     *
     * @param limit            Max documents per collection.
     * @param filterCollections Optional allowlist of collection names to scan.
     *                          If omitted, all collections are scanned.
     *
     * NOTE: The CLI orchestrates these steps individually (for spinner UX).
     * This method is provided for programmatic / library use only.
     */
    async scan(
        limit: number,
        filterCollections?: string[]
    ): Promise<LintBaseScanResult> {
        await this.connect();
        let collections = await this.getCollections();

        if (filterCollections && filterCollections.length > 0) {
            const filterSet = new Set(filterCollections);
            collections = collections.filter((c) => filterSet.has(c));

            if (collections.length === 0) {
                throw new Error(
                    `None of the specified collections [${filterCollections.join(', ')}] were found in the database.`
                );
            }
        }

        const allDocuments: LintBaseDocument[] = [];
        for (const col of collections) {
            const docs = await this.sampleDocuments(col, limit);
            allDocuments.push(...docs);
        }

        return {
            connector: this.name,
            collections,
            documentCount: allDocuments.length,
            documents: allDocuments,
            scannedAt: new Date(),
        };
    }
}
