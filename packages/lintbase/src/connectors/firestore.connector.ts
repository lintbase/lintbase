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

    // ── sampleDocuments ────────────────────────────────────────────────────────

    async sampleDocuments(
        collection: string,
        limit: number
    ): Promise<LintBaseDocument[]> {
        const snapshot = await this.db
            .collection(collection)
            .limit(limit)
            .get();

        return snapshot.docs.map((doc) => this.mapDocument(doc, collection));
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
