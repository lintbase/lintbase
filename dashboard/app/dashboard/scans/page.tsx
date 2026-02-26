'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { getRecentScans, riskLevel, formatDate, type StoredScan } from '../../../lib/db';
import styles from './page.module.css';

function nRiskColor(s: number) { if (s >= 80) return '#d73a49'; if (s >= 60) return '#f66a0a'; if (s >= 40) return '#dbab09'; return '#28a745'; }
function nRiskBg(s: number) { if (s >= 80) return '#fff5f5'; if (s >= 60) return '#fff8f0'; if (s >= 40) return '#fffbf0'; return '#f0fff4'; }

const C_ERROR = '#d73a49';
const C_WARN = '#f66a0a';
const C_INFO = '#0366d6';

type SortKey = 'date' | 'risk' | 'errors';

export default function ScansPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [scans, setScans] = useState<StoredScan[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState<SortKey>('date');
    const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

    useEffect(() => {
        if (!user) return;
        getRecentScans(user.uid, 100)
            .then(setScans)
            .finally(() => setLoading(false));
    }, [user]);

    const sorted = [...scans]
        .filter((s) => {
            if (filter === 'all') return true;
            const level = riskLevel(s.summary.riskScore).toLowerCase();
            return level === filter;
        })
        .sort((a, b) => {
            if (sort === 'risk') return b.summary.riskScore - a.summary.riskScore;
            if (sort === 'errors') return b.summary.errors - a.summary.errors;
            // date: newest first (default)
            const da = a.scannedAt instanceof Date ? a.scannedAt : (a.scannedAt as { toDate(): Date }).toDate();
            const db = b.scannedAt instanceof Date ? b.scannedAt : (b.scannedAt as { toDate(): Date }).toDate();
            return db.getTime() - da.getTime();
        });

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Scan History</h1>
                    <p className={styles.sub}>{scans.length} scan{scans.length !== 1 ? 's' : ''} recorded</p>
                </div>
            </div>

            {/* Controls */}
            <div className={styles.controls}>
                <div className={styles.filters}>
                    {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
                        <button
                            key={f}
                            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
                <div className={styles.sortRow}>
                    <span className={styles.sortLabel}>Sort by</span>
                    {(['date', 'risk', 'errors'] as SortKey[]).map((s) => (
                        <button
                            key={s}
                            className={`${styles.sortBtn} ${sort === s ? styles.sortBtnActive : ''}`}
                            onClick={() => setSort(s)}
                        >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className={styles.loading}>Loading scan history…</div>
            ) : sorted.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}>📋</div>
                    <h3 className={styles.emptyTitle}>
                        {scans.length === 0 ? 'No scans yet' : 'No scans match this filter'}
                    </h3>
                    <p className={styles.emptySub}>
                        {scans.length === 0
                            ? 'Run a scan with --save to start tracking your database health.'
                            : 'Try selecting a different severity level.'}
                    </p>
                </div>
            ) : (
                <div className={styles.table}>
                    {/* Table header */}
                    <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                        <span>Date</span>
                        <span>Risk</span>
                        <span>Collections</span>
                        <span>Documents</span>
                        <span>Errors</span>
                        <span>Warnings</span>
                        <span>Infos</span>
                    </div>

                    {/* Rows */}
                    {sorted.map((scan) => {
                        const level = riskLevel(scan.summary.riskScore);
                        return (
                            <div
                                key={scan.id}
                                className={`${styles.tableRow} ${styles.tableRowClickable}`}
                                onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                            >
                                <span className={styles.dateCell}>{formatDate(scan.scannedAt)}</span>

                                <span>
                                    <span
                                        className={styles.riskBadge}
                                        style={{
                                            background: nRiskBg(scan.summary.riskScore),
                                            color: nRiskColor(scan.summary.riskScore),
                                        }}
                                    >
                                        {scan.summary.riskScore} · {level}
                                    </span>
                                </span>

                                <span className={styles.numCell}>{scan.summary.totalCollections}</span>
                                <span className={styles.numCell}>{scan.summary.totalDocuments}</span>
                                <span className={styles.numCell} style={{ color: scan.summary.errors > 0 ? C_ERROR : 'var(--n-text-3)' }}>
                                    {scan.summary.errors}
                                </span>
                                <span className={styles.numCell} style={{ color: scan.summary.warnings > 0 ? C_WARN : 'var(--n-text-3)' }}>
                                    {scan.summary.warnings}
                                </span>
                                <span className={styles.numCell} style={{ color: scan.summary.infos > 0 ? C_INFO : 'var(--n-text-3)' }}>
                                    {scan.summary.infos}
                                </span>
                                <span className={styles.viewLink}>View →</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
