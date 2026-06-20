// src/analyzers/snapshot.analyzer.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CollectionSchema, LintBaseIssue } from '../types/index.js';

const SNAPSHOT_DIR = '.lintbase';
const SNAPSHOT_FILE = 'schema.json';

/**
 * Saves the given schema to .lintbase/schema.json
 */
export function saveSnapshot(schema: CollectionSchema[]): void {
    if (!existsSync(SNAPSHOT_DIR)) {
        mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }

    const filepath = join(SNAPSHOT_DIR, SNAPSHOT_FILE);
    writeFileSync(filepath, JSON.stringify(schema, null, 2), 'utf-8');
}

/**
 * Compares the live schema against a previously saved snapshot (.lintbase/schema.json).
 * Generates issues if fields are missing or if their inferred types have changed.
 */
export function compareAgainstSnapshot(liveSchema: CollectionSchema[]): LintBaseIssue[] {
    const filepath = join(SNAPSHOT_DIR, SNAPSHOT_FILE);

    // If no snapshot exists, we can't compare. Just return empty issues.
    if (!existsSync(filepath)) {
        return [];
    }

    let snapshot: CollectionSchema[];
    try {
        const raw = readFileSync(filepath, 'utf-8');
        snapshot = JSON.parse(raw) as CollectionSchema[];
    } catch {
        // If file is corrupted, silently fail comparison for now (or could throw a warning).
        return [];
    }

    const issues: LintBaseIssue[] = [];

    // Create a lookup for snapshot collections
    const snapshotMap = new Map<string, CollectionSchema>();
    for (const col of snapshot) {
        snapshotMap.set(col.name, col);
    }

    for (const liveCol of liveSchema) {
        const oldCol = snapshotMap.get(liveCol.name);
        if (!oldCol) {
            // New collection added compared to snapshot — this is usually fine, no issue.
            continue;
        }

        // Create a lookup for the snapshot fields in this collection
        const oldFieldsMap = new Map(oldCol.fields.map(f => [f.name, f]));

        for (const liveField of liveCol.fields) {
            const oldField = oldFieldsMap.get(liveField.name);

            if (oldField) {
                // Check if types changed
                const liveTypes = new Set(liveField.types);
                const oldTypes = new Set(oldField.types);

                // If the old field had a type that the new field NO LONGER has, that's a destructive change
                const missingTypes = [...oldTypes].filter(t => !liveTypes.has(t));
                const newTypes = [...liveTypes].filter(t => !oldTypes.has(t));

                if (missingTypes.length > 0 || (newTypes.length > 0 && liveTypes.size === 1)) {
                    // Type mismatch
                    issues.push({
                        severity: 'error',
                        collection: liveCol.name,
                        rule: 'snapshot/type-changed',
                        message: `Field "${liveField.name}" type changed. Snapshot expected [${[...oldTypes].join(', ')}], found [${[...liveTypes].join(', ')}].`,
                        suggestion: 'Type modifications often break client serialization. Update your snapshot if intentional.'
                    });
                }

                // Remove from map to track what's left
                oldFieldsMap.delete(liveField.name);
            }
        }

        // Any fields left in oldFieldsMap were NOT found in the live schema
        // If they were previously "stable" (>80% presence), logging their disappearance as an error.
        for (const [missingFieldName, missingField] of oldFieldsMap) {
            if (missingField.stable) {
                issues.push({
                    severity: 'error',
                    collection: liveCol.name,
                    rule: 'snapshot/field-missing',
                    message: `Stable field "${missingFieldName}" is missing in the live database but exists in the snapshot.`,
                    suggestion: 'Did a migration delete this field? If intentional, update your schema snapshot.'
                });
            }
        }
    }

    return issues;
}
