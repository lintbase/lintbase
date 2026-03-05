'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { getRecentScans, getLatestScanDetail, riskLevel, formatDate, type StoredScan, type StoredScanDetail } from '../../../lib/db';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import styles from './page.module.css';

// ── Helpers ────────────────────────────────────────────────────────────────

function riskColor(score: number) {
    if (score >= 75) return '#EF4444';
    if (score >= 50) return '#F97316';
    if (score >= 25) return '#F59E0B';
    return '#22C55E';
}

function trend(scans: StoredScan[]): 'improving' | 'worsening' | 'stable' {
    if (scans.length < 2) return 'stable';
    const first = scans[scans.length - 1].summary.riskScore;
    const last = scans[0].summary.riskScore;
    const delta = last - first;
    if (delta <= -5) return 'improving';
    if (delta >= 5) return 'worsening';
    return 'stable';
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const { user, plan } = useAuth();
    const router = useRouter();
    const [scans, setScans] = useState<StoredScan[]>([]);
    const [detail, setDetail] = useState<StoredScanDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        Promise.all([
            getRecentScans(user.uid, plan === 'pro' ? 90 : 7),
            getLatestScanDetail(user.uid),
        ]).then(([s, d]) => {
            setScans(s);
            setDetail(d);
        }).finally(() => setLoading(false));
    }, [user, plan]);

    // ── Free gate ────────────────────────────────────────────────────────
    if (!loading && plan === 'free') {
        return (
            <div className={styles.page}>
                <div className={styles.pageHeader}>
                    <h1 className={styles.pageTitle}>Analytics</h1>
                    <p className={styles.pageSub}>90-day risk score trends and database health insights</p>
                </div>
                <div className={styles.proGate}>
                    <div className={styles.gateIcon}>↗</div>
                    <h2 className={styles.gateTitle}>Pro feature</h2>
                    <p className={styles.gateSub}>
                        Analytics unlocks 90-day risk score trends, issue breakdown over time,
                        and insights into whether your database health is improving or drifting.
                    </p>
                    <a href="/dashboard/settings" className={styles.gateBtn}>Upgrade to Pro → $39/mo</a>
                    <p className={styles.gateNote}>Cancel anytime · No lock-in</p>
                </div>
            </div>
        );
    }

    // ── Chart data (X axis = scan index, avoids duplicate-date problem) ─────
    const chartData = [...scans].reverse().map((s, i) => ({
        i: i + 1,
        date: formatDate(s.scannedAt),          // shown in tooltip, not axis
        score: s.summary.riskScore,
        errors: s.summary.errors,
        warnings: s.summary.warnings,
        label: riskLevel(s.summary.riskScore),
    }));

    // ── Per-collection breakdown from latest scan ─────────────────────────
    type ColRow = { name: string; errors: number; warnings: number; infos: number; total: number };
    const colBreakdown: ColRow[] = (() => {
        if (!detail) return [];
        const map: Record<string, ColRow> = {};
        for (const issue of detail.issues ?? []) {
            if (!map[issue.collection]) map[issue.collection] = { name: issue.collection, errors: 0, warnings: 0, infos: 0, total: 0 };
            map[issue.collection][issue.severity === 'error' ? 'errors' : issue.severity === 'warning' ? 'warnings' : 'infos']++;
            map[issue.collection].total++;
        }
        return Object.values(map).sort((a, b) => b.errors * 3 + b.warnings - (a.errors * 3 + a.warnings));
    })();

    const t = trend(scans);
    const latest = scans[0];
    const earliest = scans[scans.length - 1];
    const delta = latest && earliest
        ? latest.summary.riskScore - earliest.summary.riskScore
        : 0;

    const avgScore = scans.length
        ? Math.round(scans.reduce((a, s) => a + s.summary.riskScore, 0) / scans.length)
        : 0;

    const totalErrors = scans.reduce((a, s) => a + s.summary.errors, 0);

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Analytics</h1>
                    <p className={styles.pageSub}>
                        {scans.length} scan{scans.length !== 1 ? 's' : ''} · last 90 days
                    </p>
                </div>
                <span className={`${styles.trendBadge} ${styles[`trend_${t}`]}`}>
                    {t === 'improving' ? '↓ Improving' : t === 'worsening' ? '↑ Worsening' : '→ Stable'}
                </span>
            </div>

            {loading ? (
                <div className={styles.loading}>Loading analytics…</div>
            ) : scans.length < 2 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}>📈</div>
                    <h3 className={styles.emptyTitle}>Not enough data yet</h3>
                    <p className={styles.emptySub}>
                        Run at least 2 scans with <code>--save</code> to see trends.
                    </p>
                </div>
            ) : (
                <>
                    {/* ── KPI row ─────────────────────────────────────────── */}
                    <div className={styles.kpiRow}>
                        <div className={styles.kpiCard}>
                            <div className={styles.kpiLabel}>Latest risk score</div>
                            <div className={styles.kpiValue} style={{ color: riskColor(latest.summary.riskScore) }}>
                                {latest.summary.riskScore}
                            </div>
                            <div className={styles.kpiSub}>{riskLevel(latest.summary.riskScore)}</div>
                        </div>
                        <div className={styles.kpiCard}>
                            <div className={styles.kpiLabel}>Change over period</div>
                            <div className={styles.kpiValue} style={{ color: delta > 0 ? '#EF4444' : delta < 0 ? '#22C55E' : 'var(--n-text-2)' }}>
                                {delta > 0 ? `+${delta}` : delta}
                            </div>
                            <div className={styles.kpiSub}>vs first scan in window</div>
                        </div>
                        <div className={styles.kpiCard}>
                            <div className={styles.kpiLabel}>Average score</div>
                            <div className={styles.kpiValue} style={{ color: riskColor(avgScore) }}>
                                {avgScore}
                            </div>
                            <div className={styles.kpiSub}>across {scans.length} scans</div>
                        </div>
                        <div className={styles.kpiCard}>
                            <div className={styles.kpiLabel}>Total errors found</div>
                            <div className={styles.kpiValue} style={{ color: '#EF4444' }}>
                                {totalErrors}
                            </div>
                            <div className={styles.kpiSub}>cumulative across all scans</div>
                        </div>
                    </div>

                    {/* ── Risk score chart ────────────────────────────────── */}
                    <div className={styles.chartCard}>
                        <div className={styles.chartHeader}>
                            <h3 className={styles.chartTitle}>Risk Score Over Time</h3>
                            <span className={styles.chartSub}>Scan # on X axis · hover for date · lower is better</span>
                        </div>
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={chartData} margin={{ top: 8, right: 24, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--n-border)" />
                                <XAxis dataKey="i" tick={{ fontSize: 11, fill: 'var(--n-text-3)' }} tickLine={false}
                                    label={{ value: 'Scan #', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: 'var(--n-text-3)' }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--n-text-3)' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ background: 'var(--n-bg)', border: '1px solid var(--n-border)', borderRadius: '6px', fontSize: 12 }}
                                    labelFormatter={(i) => `Scan #${i} · ${chartData[Number(i) - 1]?.date ?? ''}`}
                                    formatter={(v) => [`${v ?? 0} — ${riskLevel(Number(v ?? 0))}`, 'Risk Score'] as [string, string]}
                                />
                                <ReferenceLine y={75} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'CRITICAL', fontSize: 10, fill: '#EF4444' }} />
                                <ReferenceLine y={50} stroke="#F97316" strokeDasharray="4 4" label={{ value: 'HIGH', fontSize: 10, fill: '#F97316' }} />
                                <Line
                                    type="monotone"
                                    dataKey="score"
                                    stroke="var(--n-text)"
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: 'var(--n-text)', strokeWidth: 0 }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* ── Per-collection breakdown ─────────────────────────── */}
                    {colBreakdown.length > 0 && (
                        <div className={styles.chartCard}>
                            <div className={styles.chartHeader}>
                                <h3 className={styles.chartTitle}>Collection Risk Breakdown</h3>
                                <span className={styles.chartSub}>Latest scan — sorted by severity</span>
                            </div>
                            <div className={styles.scanTable}>
                                <div className={`${styles.scanRow} ${styles.scanRowHeader}`}>
                                    <span>Collection</span><span>Errors</span><span>Warnings</span><span>Infos</span><span>Total</span>
                                </div>
                                {colBreakdown.map(col => (
                                    <div key={col.name} className={styles.scanRow}>
                                        <span style={{ fontWeight: 500 }}>{col.name}</span>
                                        <span style={{ color: col.errors > 0 ? '#EF4444' : 'var(--n-text-3)', fontWeight: col.errors > 0 ? 600 : 400 }}>{col.errors || '—'}</span>
                                        <span style={{ color: col.warnings > 0 ? '#F97316' : 'var(--n-text-3)' }}>{col.warnings || '—'}</span>
                                        <span style={{ color: col.infos > 0 ? '#0366d6' : 'var(--n-text-3)' }}>{col.infos || '—'}</span>
                                        <span style={{ fontWeight: 600 }}>{col.total}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Scan table ───────────────────────────────────────── */}
                    <div className={styles.chartCard}>
                        <div className={styles.chartHeader}>
                            <h3 className={styles.chartTitle}>All Scans</h3>
                        </div>
                        <div className={styles.scanTable}>
                            <div className={`${styles.scanRow} ${styles.scanRowHeader}`}>
                                <span>Date</span><span>Score</span><span>Level</span>
                                <span>Errors</span><span>Warnings</span>
                            </div>
                            {scans.map(s => (
                                <div
                                    key={s.id}
                                    className={`${styles.scanRow} ${styles.scanRowClickable}`}
                                    onClick={() => router.push(`/dashboard/scans/${s.id}`)}
                                >
                                    <span className={styles.dateCell}>{formatDate(s.scannedAt)}</span>
                                    <span style={{ color: riskColor(s.summary.riskScore), fontWeight: 600 }}>{s.summary.riskScore}</span>
                                    <span>{riskLevel(s.summary.riskScore)}</span>
                                    <span style={{ color: s.summary.errors > 0 ? '#EF4444' : 'var(--n-text-3)' }}>{s.summary.errors}</span>
                                    <span style={{ color: s.summary.warnings > 0 ? '#F97316' : 'var(--n-text-3)' }}>{s.summary.warnings}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
