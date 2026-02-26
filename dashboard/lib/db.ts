// dashboard/lib/db.ts
// Firestore data layer — all reads/writes for the dashboard go through here.

import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScanSummary {
    totalCollections: number;
    totalDocuments: number;
    errors: number;
    warnings: number;
    infos: number;
    riskScore: number;
}

export interface StoredScan {
    id: string;
    connector: string;
    collections: string[];
    documentCount: number;
    summary: ScanSummary;
    issueCount: number;
    scannedAt: Timestamp | Date;
    createdAt: Timestamp | Date;
}

export interface StoredScanDetail extends StoredScan {
    issues: Array<{
        severity: 'error' | 'warning' | 'info';
        collection: string;
        rule: string;
        message: string;
        affectedDocuments?: string[];
        suggestion?: string;
    }>;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/** List the most recent scans for a user */
export async function getRecentScans(
    userId: string,
    count = 20
): Promise<StoredScan[]> {
    const q = query(
        collection(db, 'users', userId, 'scans'),
        orderBy('createdAt', 'desc'),
        limit(count)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StoredScan));
}

/** Get a single scan by ID */
export async function getScan(
    userId: string,
    scanId: string
): Promise<StoredScanDetail | null> {
    const snap = await getDoc(doc(db, 'users', userId, 'scans', scanId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as StoredScanDetail;
}

// ── Risk score helpers ────────────────────────────────────────────────────────

export function riskLevel(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
}

export function riskColor(score: number): string {
    if (score >= 75) return '#EF4444';
    if (score >= 50) return '#F97316';
    if (score >= 25) return '#F59E0B';
    return '#22C55E';
}

export function formatDate(ts: Timestamp | Date): string {
    const d = ts instanceof Date ? ts : ts.toDate();
    return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
