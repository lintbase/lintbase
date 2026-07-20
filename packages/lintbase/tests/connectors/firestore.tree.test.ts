// tests/connectors/firestore.tree.test.ts
// Unit tests for FirestoreConnector.sampleCollectionTree — the recursive
// subcollection walk (GitHub issue: scanner only saw top-level collections).
import { describe, it, expect } from 'vitest';
import { FirestoreConnector } from '../../src/connectors/firestore.connector.js';

/**
 * A tiny in-memory stand-in for the Firestore Admin SDK surface the connector
 * touches: db.collection(path).limit(n).get() and db.doc(path).listCollections().
 *
 * `tree` maps a collection path -> array of doc ids in it.
 * `subs` maps a document path -> array of subcollection ids beneath it.
 */
function makeFakeDb(tree: Record<string, string[]>, subs: Record<string, string[]>) {
    const makeDocSnap = (collectionPath: string, id: string) => ({
        id,
        data: () => ({ name: `${collectionPath}:${id}` }),
    });

    return {
        collection(path: string) {
            return {
                limit(n: number) {
                    return {
                        async get() {
                            const ids = (tree[path] ?? []).slice(0, n);
                            return { docs: ids.map((id) => makeDocSnap(path, id)) };
                        },
                    };
                },
            };
        },
        doc(path: string) {
            return {
                async listCollections() {
                    return (subs[path] ?? []).map((id) => ({ id }));
                },
            };
        },
    };
}

function connectorWithDb(db: unknown): FirestoreConnector {
    const c = new FirestoreConnector('unused.json');
    // Inject the fake db in place of a real Firestore connection.
    (c as unknown as { db: unknown }).db = db;
    return c;
}

describe('FirestoreConnector.sampleCollectionTree', () => {
    it('discovers and samples nested subcollections', async () => {
        const tree = {
            users: ['u1', 'u2'],
            'users/u1/orders': ['o1'],
            'users/u2/orders': ['o2'],
        };
        const subs = {
            'users/u1': ['orders'],
            'users/u2': ['orders'],
        };
        const c = connectorWithDb(makeFakeDb(tree, subs));

        const { collections, documents } = await c.sampleCollectionTree(['users'], 100, 2);

        // Root + the aggregated subcollection (one canonical id, not two).
        expect(collections).toContain('users');
        expect(collections).toContain('users/*/orders');
        expect(collections).toHaveLength(2);

        // All order docs from both parents are sampled and labeled canonically.
        const orderDocs = documents.filter((d) => d.collection === 'users/*/orders');
        expect(orderDocs.map((d) => d.id).sort()).toEqual(['o1', 'o2']);
    });

    it('respects maxDepth = 1 (top-level only, no recursion)', async () => {
        const tree = { users: ['u1'], 'users/u1/orders': ['o1'] };
        const subs = { 'users/u1': ['orders'] };
        const c = connectorWithDb(makeFakeDb(tree, subs));

        const { collections } = await c.sampleCollectionTree(['users'], 100, 1);

        expect(collections).toEqual(['users']);
    });

    it('walks deeper tiers when maxDepth allows', async () => {
        const tree = {
            users: ['u1'],
            'users/u1/orders': ['o1'],
            'users/u1/orders/o1/items': ['i1'],
        };
        const subs = {
            'users/u1': ['orders'],
            'users/u1/orders/o1': ['items'],
        };
        const c = connectorWithDb(makeFakeDb(tree, subs));

        const depth2 = await c.sampleCollectionTree(['users'], 100, 2);
        expect(depth2.collections).not.toContain('users/*/orders/*/items');

        const depth3 = await c.sampleCollectionTree(['users'], 100, 3);
        expect(depth3.collections).toContain('users/*/orders/*/items');
    });

    it('does not fail the whole scan when one document has no subcollections', async () => {
        const tree = { users: ['u1', 'u2'], 'users/u1/orders': ['o1'] };
        const subs = { 'users/u1': ['orders'] }; // u2 has none
        const c = connectorWithDb(makeFakeDb(tree, subs));

        const { collections, documents } = await c.sampleCollectionTree(['users'], 100, 2);

        expect(collections.sort()).toEqual(['users', 'users/*/orders']);
        expect(documents).toHaveLength(3); // u1, u2, o1
    });
});
