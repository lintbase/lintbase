// src/connectors/mongodb.connector.ts
import { MongoClient, Db } from 'mongodb';
import { BaseConnector } from './base.connector.js';
import { LintBaseDocument } from '../types/index.js';

export class MongoDbConnector extends BaseConnector {
    readonly name = 'mongodb';

    private client!: MongoClient;
    private db!: Db;
    private uri: string;

    constructor(uri: string) {
        super();
        this.uri = uri;
    }

    // ── connect ────────────────────────────────────────────────────────────────

    async connect(): Promise<void> {
        try {
            this.client = new MongoClient(this.uri);
            await this.client.connect();
            this.db = this.client.db();
        } catch (err) {
            throw new Error(
                `Failed to connect to MongoDB: ${err instanceof Error ? err.message : String(err)}\n` +
                `  → Make sure your connection string is valid and the server is reachable.`
            );
        }
    }

    // ── getCollections ─────────────────────────────────────────────────────────

    async getCollections(): Promise<string[]> {
        const collections = await this.db.listCollections().toArray();
        // Ignore system collections
        return collections
            .map((c) => c.name)
            .filter((name) => !name.startsWith('system.'));
    }

    // ── sampleDocuments ────────────────────────────────────────────────────────

    async sampleDocuments(
        collection: string,
        limit: number
    ): Promise<LintBaseDocument[]> {
        const coll = this.db.collection(collection);

        // Use an aggregation pipeline with $sample to get a random distribution
        // This is usually more representative than just taking the first N documents
        const docs = await coll.aggregate([
            { $sample: { size: limit } }
        ]).toArray();

        // If $sample fails or is slow on some clusters without indexes, 
        // fallback to a simple find() could be added here later.

        return docs.map((doc) => this.mapDocument(doc, collection));
    }

    // ── cleanup ────────────────────────────────────────────────────────────────

    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
        }
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private mapDocument(
        doc: Record<string, any>,
        collection: string
    ): LintBaseDocument {
        const id = doc._id ? String(doc._id) : 'unknown_id';
        const rawData = { ...doc };
        // We usually remove _id from fields analysis to reduce noise,
        // but it can be useful to know its type (ObjectId vs String)

        const fields = this.extractFields(rawData);
        const depth = this.calculateDepth(rawData);
        const sizeBytes = this.estimateSizeBytes(rawData);

        return {
            id,
            collection,
            fields,
            depth,
            sizeBytes,
        };
    }

    /**
     * Flatten the top-level fields of a MongoDB document into the
     * LintBaseDocument.fields shape: { fieldName: { value, type } }
     */
    private extractFields(
        data: Record<string, any>
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

    /** Determine a human-readable type label for a MongoDB field value */
    private inferType(value: unknown): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';

        if (typeof value === 'object' && value !== null) {
            // MongoDB ObjectId
            if (value.constructor && value.constructor.name === 'ObjectId') {
                return 'objectId';
            }
            // Native JavaScript Date
            if (value instanceof Date) {
                return 'date';
            }
            // MongoDB Decimal128, Long, Timestamp, etc.
            if (value.constructor && value.constructor.name !== 'Object') {
                // Try to use the BSON type name in camelCase
                const name = value.constructor.name;
                return name.charAt(0).toLowerCase() + name.slice(1);
            }
            return 'map';
        }

        return typeof value; // string | number | boolean
    }

    /**
     * Recursively compute the maximum nesting depth of a document.
     */
    private calculateDepth(obj: unknown, current = 1): number {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            return current;
        }

        // Avoid infinite loops on BSON special objects
        if (obj.constructor && obj.constructor.name !== 'Object') {
            return current;
        }

        const values = Object.values(obj as Record<string, unknown>);
        if (values.length === 0) return current;

        return Math.max(
            ...values.map((v) => this.calculateDepth(v, current + 1))
        );
    }

    /**
     * Rough byte-size estimate
     */
    private estimateSizeBytes(data: Record<string, any>): number {
        try {
            // This is a naive heuristic (converts to JSON string)
            // It could be replaced by a deeper BSON-aware size calculation later
            return Buffer.byteLength(JSON.stringify(data), 'utf-8');
        } catch {
            return 0;
        }
    }
}
