'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { getRecentScans, riskLevel, riskColor, formatDate, type StoredScan } from '../../lib/db';
import styles from './page.module.css';

export default function DashboardOverview() {
    const { user, apiKey } = useAuth();
    const [scans, setScans] = useState<StoredScan[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user) return;
        getRecentScans(user.uid, 10)
            .then(setScans)
            .finally(() => setLoading(false));
    }, [user]);

    const copyApiKey = () => {
        if (!apiKey) return;
        navigator.clipboard.writeText(apiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const latestScan = scans[0] ?? null;
    const avgRisk = scans.length
        ? Math.round(scans.reduce((s, sc) => s + sc.summary.riskScore, 0) / scans.length)
        : 0;
    const totalErrors = scans.reduce((s, sc) => s + sc.summary.errors, 0);

    return (
        <div className={styles.page}>
            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Overview</h1>
                    <p className={styles.sub}>
                        {scans.length > 0
                            ? `${scans.length} scan${scans.length > 1 ? 's' : ''} in history`
                            : 'Run your first scan to get started'}
                    </p>
                </div>
                <Link href="/dashboard/scans" className={styles.viewAll}>
                    View all scans →
                </Link>
            </div>

            {/* ── Summary cards ─────────────────────────────────────────────── */}
            <div className={styles.cards}>
                <div className={styles.card}>
                    <span className={styles.cardLabel}>Latest Risk Score</span>
                    <span
                        className={styles.cardValue}
                        style={{ color: latestScan ? riskColor(latestScan.summary.riskScore) : 'var(--text-3)' }}
                    >
                        {latestScan ? latestScan.summary.riskScore : '—'}
                    </span>
                    <span className={styles.cardSub}>
                        {latestScan ? riskLevel(latestScan.summary.riskScore) : 'No scans yet'}
                    </span>
                </div>
                <div className={styles.card}>
                    <span className={styles.cardLabel}>Avg Risk (last 10)</span>
                    <span
                        className={styles.cardValue}
                        style={{ color: scans.length ? riskColor(avgRisk) : 'var(--text-3)' }}
                    >
                        {scans.length ? avgRisk : '—'}
                    </span>
                    <span className={styles.cardSub}>
                        {scans.length ? `across ${scans.length} scans` : 'No scans yet'}
                    </span>
                </div>
                <div className={styles.card}>
                    <span className={styles.cardLabel}>Total Errors Found</span>
                    <span className={styles.cardValue} style={{ color: totalErrors > 0 ? '#EF4444' : 'var(--text-3)' }}>
                        {scans.length ? totalErrors : '—'}
                    </span>
                    <span className={styles.cardSub}>{scans.length ? 'across all scans' : 'No scans yet'}</span>
                </div>
                <div className={styles.card}>
                    <span className={styles.cardLabel}>Collections Tracked</span>
                    <span className={styles.cardValue} style={{ color: 'var(--brand-light)' }}>
                        {latestScan ? latestScan.summary.totalCollections : '—'}
                    </span>
                    <span className={styles.cardSub}>{latestScan ? 'from latest scan' : 'No scans yet'}</span>
                </div>
            </div>

            {/* ── Risk trend ────────────────────────────────────────────────── */}
            {scans.length > 1 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Risk Score Trend</h2>
                    <div className={styles.trend}>
                        {[...scans].reverse().map((scan, i) => {
                            const barHeight = `${Math.max(6, scan.summary.riskScore)}%`;
                            return (
                                <div key={scan.id} className={styles.trendBar} title={`${scan.summary.riskScore}/100`}>
                                    <div
                                        className={styles.trendBarFill}
                                        style={{
                                            height: barHeight,
                                            background: riskColor(scan.summary.riskScore),
                                        }}
                                    />
                                    <span className={styles.trendBarLabel}>{i + 1}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Recent scans ──────────────────────────────────────────────── */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Recent Scans</h2>

                {loading ? (
                    <div className={styles.loading}>Loading scans…</div>
                ) : scans.length === 0 ? (
                    /* Empty state */
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>🔍</div>
                        <h3 className={styles.emptyTitle}>No scans yet</h3>
                        <p className={styles.emptySub}>
                            Run your first scan and push it to the dashboard with the{' '}
                            <code>--save</code> flag.
                        </p>
                        <div className={styles.emptyTerminal}>
                            <span style={{ color: 'var(--brand-light)' }}>$ </span>
                            npx lintbase scan firestore \<br />
                            &nbsp;&nbsp;--key ./service-account.json \<br />
                            &nbsp;&nbsp;--save https://lintbase.com \<br />
                            &nbsp;&nbsp;--token {apiKey ? apiKey.slice(0, 8) + '••••••••' : '<your-api-key>'}
                        </div>
                    </div>
                ) : (
                    <div className={styles.scanList}>
                        {scans.slice(0, 5).map((scan) => (
                            <div key={scan.id} className={styles.scanRow}>
                                <div className={styles.scanRowLeft}>
                                    <div
                                        className={styles.riskBadge}
                                        style={{
                                            background: riskColor(scan.summary.riskScore) + '22',
                                            color: riskColor(scan.summary.riskScore),
                                            borderColor: riskColor(scan.summary.riskScore) + '44',
                                        }}
                                    >
                                        {scan.summary.riskScore}/100
                                    </div>
                                    <div>
                                        <div className={styles.scanRowTitle}>
                                            {scan.summary.totalCollections} collections · {scan.summary.totalDocuments} docs
                                        </div>
                                        <div className={styles.scanRowDate}>{formatDate(scan.scannedAt)}</div>
                                    </div>
                                </div>
                                <div className={styles.scanRowRight}>
                                    <span className={styles.errorCount}>✖ {scan.summary.errors}</span>
                                    <span className={styles.warnCount}>⚠ {scan.summary.warnings}</span>
                                    <span className={styles.infoCount}>ℹ {scan.summary.infos}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── API Key ───────────────────────────────────────────────────── */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>CLI Integration</h2>
                <p className={styles.sectionSub}>
                    Use this key with <code>--token</code> to push scan results to your dashboard automatically.
                </p>
                <div className={styles.apiKeyBox}>
                    <code className={styles.apiKeyValue}>
                        {apiKey ?? 'Generating key…'}
                    </code>
                    <button className={styles.copyBtn} onClick={copyApiKey} disabled={!apiKey}>
                        {copied ? '✓ Copied' : 'Copy'}
                    </button>
                </div>
                <div className={styles.cliExample}>
                    <code>
                        npx lintbase scan firestore --key ./sa.json --save https://lintbase.com --token {apiKey?.slice(0, 8) ?? '••••'}…
                    </code>
                </div>
            </div>
        </div>
    );
}
