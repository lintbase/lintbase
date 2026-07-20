// src/connectors/firestore.connector.ts
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { BaseConnector } from './base.connector.js';
import { LintBaseDocument } from '../types/index.js';

export class FirestoreConnector extends BaseConnector {
    readonly name = 'firestore';

    private db!: admin.firestore.Firestore;
    private keyPath: string;

    /**
     * Safety ceiling on how many distinct collection paths a single scan may
     * sample. Subcollections are discovered per-document, so a wide or deeply
     * nested tree could otherwise fan out into a very large number of reads.
     */
    private static readonly MAX_COLLECTION_PATHS = 500;

    constructor(keyPath: string) {
        super();
        this.keyPath = path.resolve(keyPath);
    }

    // ── connect ────────────────────────────────────────────────────────────────

    async connect(): Promise<void> {
        if (!fs.existsSync(this.keyPath)) {
            throw new Error(
                `Service account file not found: ${this.keyPath}\n` +
                `  → Pass the correct path with --key <path>`
            );
        }

        let serviceAccount: admin.ServiceAccount;
        try {
            const raw = fs.readFileSync(this.keyPath, 'utf-8');
            serviceAccount = JSON.parse(raw) as admin.ServiceAccount;
        } catch {
            throw new Error(
                `Failed to parse service account JSON: ${this.keyPath}\n` +
                `  → Make sure the file is valid JSON exported from the Firebase console.`
            );
        }

        // Avoid re-initializing if a default app already exists (e.g. during tests)
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        }

        this.db = admin.firestore();
    }

    // ── getCollections ─────────────────────────────────────────────────────────

    async getCollections(): Promise<string[]> {
        const collections = await this.db.listCollections();
        return collections.map((c) => c.id);
    }

    /**
     * List the subcollection ids directly beneath a single document. Firestore
     * only exposes subcollections per-document (there is no database-wide list),
     * so this must be called on each document we want to drill into.
     *
     * @param documentPath A concrete document path, e.g. "users/abc123".
     */
    async getSubcollections(documentPath: string): Promise<string[]> {
        const subcollections = await this.db.doc(documentPath).listCollections();
        return subcollections.map((c) => c.id);
    }

    // ── sampleDocuments ────────────────────────────────────────────────────────

    async sampleDocuments(
        collection: string,
        limit: number
    ): Promise<LintBaseDocument[]> {
        return this.sampleDocumentsAtPath(collection, collection, limit);
    }

    /**
     * Recursively walk the collection tree from `rootCollections`, sampling
     * documents at every tier down to `maxDepth`.
     *
     *   maxDepth = 1 -> root collections only (the pre-recursion behavior)
     *   maxDepth = 2 -> root + one tier of subcollections (default)
     *
     * The same subcollection under different parents is aggregated under one
     * canonical id where each ancestor document id is replaced with a wildcard
     * segment. Documents from "users/abc/orders" and "users/def/orders" are both
     * labeled "users/[wildcard]/orders", so schema analysis sees them as one
     * collection.
     */
    async sampleCollectionTree(
        rootCollections: string[],
        limit: number,
        maxDepth: number
    ): Promise<{ collections: string[]; documents: LintBaseDocument[]; truncated: boolean }> {
        const collectionsSeen = new Set<string>();
        const documents: LintBaseDocument[] = [];
        let truncated = false;

        const walk = async (
            queryPath: string,
            canonicalId: string,
            depth: number
        ): Promise<void> => {
            if (collectionsSeen.size >= FirestoreConnector.MAX_COLLECTION_PATHS) {
                truncated = true;
                return;
            }
            collectionsSeen.add(canonicalId);

            const docs = await this.sampleDocumentsAtPath(queryPath, canonicalId, limit);
            documents.push(...docs);

            if (depth >= maxDepth) return;

            for (const doc of docs) {
                const docQueryPath = `${queryPath}/${doc.id}`;
                let subs: string[];
                try {
                    subs = await this.getSubcollections(docQueryPath);
                } catch {
                    // A single document's subcollection lookup failing must not
                    // abort the whole scan — skip it and keep going.
                    continue;
                }
                for (const sub of subs) {
                    await walk(
                        `${docQueryPath}/${sub}`,
                        `${canonicalId}/*/${sub}`,
                        depth + 1
                    );
                }
            }
        };

        for (const root of rootCollections) {
            await walk(root, root, 1);
        }

        return { collections: [...collectionsSeen], documents, truncated };
    }

    /**
     * Sample docs from the collection at `queryPath` (a real Firestore path with
     * concrete ancestor document ids) but label each document with `canonicalId`
     * (the same path with ancestor ids replaced by "*"). For top-level
     * collections the two are identical.
     */
    private async sampleDocumentsAtPath(
        queryPath: string,
        canonicalId: string,
        limit: number
    ): Promise<LintBaseDocument[]> {
        const snapshot = await this.db
            .collection(queryPath)
            .limit(limit)
            .get();

        return snapshot.docs.map((doc) => this.mapDocument(doc, canonicalId));
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private mapDocument(
        doc: admin.firestore.QueryDocumentSnapshot,
        collection: string
    ): LintBaseDocument {
        const rawData = doc.data();
        const fields = this.extractFields(rawData);
        const depth = this.calculateDepth(rawData);
        const sizeBytes = this.estimateSizeBytes(rawData);

        return {
            id: doc.id,
            collection,
            fields,
            depth,
            sizeBytes,
        };
    }

    /**
     * Flatten the top-level fields of a Firestore document into the
     * LintBaseDocument.fields shape: { fieldName: { value, type } }
     */
    private extractFields(
        data: admin.firestore.DocumentData
    ): Record<string, { value: unknown; type: string }> {
        const result: Record<string, { value: unknown; type: string }> = {};

        for (const [key, value] of Object.entries(data)) {
            result[key] = {
                value,
                type: this.inferType(value),
            };
        }

        return result;
    }

    /** Determine a human-readable type label for a Firestore field value */
    private inferType(value: unknown): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';

        // Firestore Timestamp
        if (
            typeof value === 'object' &&
            value !== null &&
            'toDate' in value &&
            typeof (value as { toDate: unknown }).toDate === 'function'
        ) {
            return 'timestamp';
        }

        // Firestore DocumentReference
        if (
            typeof value === 'object' &&
            value !== null &&
            'path' in value &&
            'id' in value
        ) {
            return 'reference';
        }

        if (typeof value === 'object') return 'map';
        return typeof value; // string | number | boolean
    }

    /**
     * Recursively compute the maximum nesting depth of a document.
     * A flat document has depth 1.
     */
    private calculateDepth(obj: unknown, current = 1): number {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            return current;
        }

        const values = Object.values(obj as Record<string, unknown>);
        if (values.length === 0) return current;

        return Math.max(
            ...values.map((v) => this.calculateDepth(v, current + 1))
        );
    }

    /**
     * Rough byte-size estimate by serialising the document data to JSON.
     * Firestore's actual storage cost differs, but this is good enough for
     * the Phase 1 schema-analysis heuristics.
     */
    private estimateSizeBytes(data: admin.firestore.DocumentData): number {
        try {
            return Buffer.byteLength(JSON.stringify(data), 'utf-8');
        } catch {
            return 0;
        }
    }
}
