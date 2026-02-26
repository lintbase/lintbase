'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAuth } from '../../lib/auth';
import {
    getRecentScans, getLatestScanDetail,
    riskLevel, formatDate,
} from '../../lib/db';
import type { StoredScan, StoredScanDetail } from '../../lib/db';
import styles from './page.module.css';

// Notion-palette risk colors (muted, not vibrant)
function notionRiskColor(score: number): string {
    if (score >= 80) return '#d73a49';
    if (score >= 60) return '#f66a0a';
    if (score >= 40) return '#dbab09';
    return '#28a745';
}
function notionRiskBg(score: number): string {
    if (score >= 80) return '#fff5f5';
    if (score >= 60) return '#fff8f0';
    if (score >= 40) return '#fffbf0';
    return '#f0fff4';
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ScanSummary {
    riskScore?: number; errors?: number; warnings?: number;
    infos?: number; totalCollections?: number; totalDocuments?: number;
}

function shortDate(ts: import('firebase/firestore').Timestamp | Date): string {
    const d = ts instanceof Date ? ts : ts.toDate();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    });
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function RiskTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    const score = payload[0].value;
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipDate}>{label}</div>
            <div className={styles.tooltipScore} style={{ color: notionRiskColor(score) }}>
                {score}/100 {riskLevel(score)}
            </div>
        </div>
    );
}

function IssueTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipDate}>{label}</div>
            {payload.map((p) => (
                <div key={p.name} style={{ color: p.color }}>
                    {p.name}: {p.value}
                </div>
            ))}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { user, apiKey } = useAuth();
    const router = useRouter();
    const [scans, setScans] = useState<StoredScan[]>([]);
    const [latestDetail, setLatestDetail] = useState<StoredScanDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user) return;
        (async () => {
            const [recent, detail] = await Promise.all([
                getRecentScans(user.uid, 20),
                getLatestScanDetail(user.uid),
            ]);
            setScans(recent);
            setLatestDetail(detail);
            setLoading(false);
        })();
    }, [user]);

    // ── Derived data ─────────────────────────────────────────────────────────
    const latest = scans[0];
    const previous = scans[1];
    const latestSummary = (latest?.summary ?? {}) as ScanSummary;
    const prevSummary = (previous?.summary ?? {}) as ScanSummary;

    // Risk timeline — oldest first
    const timelineData = [...scans].reverse().map(s => ({
        date: shortDate(s.scannedAt),
        risk: (s.summary as ScanSummary).riskScore ?? 0,
    }));

    // Issue trend — oldest first
    const issueTrendData = [...scans].reverse().map(s => ({
        date: shortDate(s.scannedAt),
        Errors: (s.summary as ScanSummary).errors ?? 0,
        Warnings: (s.summary as ScanSummary).warnings ?? 0,
        Infos: (s.summary as ScanSummary).infos ?? 0,
    }));

    // Collection heatmap from latest scan detail
    const collectionData = latestDetail
        ? Object.values(
            latestDetail.issues.reduce((acc, issue) => {
                const key = issue.collection;
                if (!acc[key]) acc[key] = { name: key, Errors: 0, Warnings: 0, Infos: 0 };
                if (issue.severity === 'error') acc[key].Errors++;
                else if (issue.severity === 'warning') acc[key].Warnings++;
                else acc[key].Infos++;
                return acc;
            }, {} as Record<string, { name: string; Errors: number; Warnings: number; Infos: number }>)
        ).sort((a, b) => b.Errors - a.Errors).slice(0, 10)
        : [];

    // Issue resolution progress (latest vs previous scan)
    const errDelta = prevSummary.errors != null && latestSummary.errors != null
        ? latestSummary.errors - prevSummary.errors : null;
    const warnDelta = prevSummary.warnings != null && latestSummary.warnings != null
        ? latestSummary.warnings - prevSummary.warnings : null;

    const currentRisk = latestSummary.riskScore ?? 0;
    const avgRisk = scans.length
        ? Math.round(scans.reduce((s, sc) => s + ((sc.summary as ScanSummary).riskScore ?? 0), 0) / scans.length)
        : 0;

    // Chart theme — Notion minimalism, semantic colors for severity
    const GRID = 'rgba(0,0,0,0.05)';
    const AXIS = '#9b9a97';
    const C_ERROR = '#d73a49';   // muted red
    const C_WARN = '#f66a0a';   // muted orange
    const C_INFO = '#0366d6';   // muted blue
    const C_LINE = '#6e40c9';   // single brand accent for timeline

    if (loading) {
        return (
            <div className={styles.loadingWrap}>
                <div className={styles.spinner} />
                <p>Loading your dashboard…</p>
            </div>
        );
    }

    if (scans.length === 0) {
        return (
            <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📡</div>
                <h2>No scans yet</h2>
                <p>Run your first scan and push it to the dashboard:</p>
                <div className={styles.emptyCode}>
                    <code>
                        npx lintbase scan firestore --key ./sa.json \<br />
                        &nbsp;&nbsp;--save https://www.lintbase.com \<br />
                        &nbsp;&nbsp;--token {apiKey ?? '<your-api-key>'}
                    </code>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Overview</h1>
                <p className={styles.pageSub}>Database health across {scans.length} scan{scans.length !== 1 ? 's' : ''} · Last run {scans.length ? formatDate(scans[0].scannedAt) : '—'}</p>
            </div>

            {/* ── Summary Cards ──────────────────────────────────────────── */}
            <div className={styles.cards}>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>Latest Risk Score</div>
                    <div className={styles.cardValue}>
                        {currentRisk}<span className={styles.cardUnit}>/100</span>
                    </div>
                    <div className={styles.cardBadge} style={{ background: notionRiskBg(currentRisk), color: notionRiskColor(currentRisk) }}>
                        {riskLevel(currentRisk)}
                    </div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>Avg Risk (all scans)</div>
                    <div className={styles.cardValue}>
                        {avgRisk}<span className={styles.cardUnit}>/100</span>
                    </div>
                    <div className={styles.cardSub}>{scans.length} scan{scans.length !== 1 ? 's' : ''} tracked</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>Errors in Last Scan</div>
                    <div className={styles.cardValue}>
                        {latestSummary.errors ?? '—'}
                    </div>
                    {errDelta !== null && (
                        <div className={styles.cardDelta} style={{ color: errDelta <= 0 ? '#28a745' : '#d73a49' }}>
                            {errDelta <= 0 ? '▼' : '▲'} {Math.abs(errDelta)} vs prev scan
                        </div>
                    )}
                </div>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>Collections Tracked</div>
                    <div className={styles.cardValue}>{latestSummary.totalCollections ?? collectionData.length}</div>
                    <div className={styles.cardSub}>{latestSummary.totalDocuments ?? '—'} docs sampled</div>
                </div>
            </div>

            {/* ── Charts Row ─────────────────────────────────────────────── */}
            <div className={styles.chartsRow}>

                {/* Risk Score Timeline */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Risk Score Timeline</h3>
                        <span className={styles.chartSub}>Last {scans.length} scans</span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={C_LINE} stopOpacity={0.1} />
                                    <stop offset="95%" stopColor={C_LINE} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<RiskTooltip />} />
                            <Area type="monotone" dataKey="risk" stroke={C_LINE} strokeWidth={1.5} fill="url(#riskGrad)" dot={{ fill: C_LINE, strokeWidth: 0, r: 2 }} activeDot={{ r: 4 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Issue Trend */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Issue Trend</h3>
                        <span className={styles.chartSub}>Errors · Warnings · Infos</span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={issueTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<IssueTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
                            <Bar dataKey="Errors" stackId="a" fill={C_ERROR} />
                            <Bar dataKey="Warnings" stackId="a" fill={C_WARN} />
                            <Bar dataKey="Infos" stackId="a" fill={C_INFO} radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Collection Heatmap ─────────────────────────────────────── */}
            {collectionData.length > 0 && (
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Collection Risk Heatmap</h3>
                        <span className={styles.chartSub}>Issues by collection — latest scan</span>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(220, collectionData.length * 36)}>
                        <BarChart
                            layout="vertical"
                            data={collectionData}
                            margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                            <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: '#37352f', fontSize: 12 }} axisLine={false} tickLine={false} width={75} />
                            <Tooltip content={<IssueTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
                            <Bar dataKey="Errors" stackId="a" fill={C_ERROR} />
                            <Bar dataKey="Warnings" stackId="a" fill={C_WARN} />
                            <Bar dataKey="Infos" stackId="a" fill={C_INFO} radius={[0, 2, 2, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── Issue Resolution Progress ──────────────────────────────── */}
            {previous && (
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Issue Resolution Progress</h3>
                        <span className={styles.chartSub}>Previous scan → Latest scan</span>
                    </div>
                    <div className={styles.progressGrid}>
                        {[
                            { label: 'Errors', prev: prevSummary.errors ?? 0, curr: latestSummary.errors ?? 0, color: C_ERROR },
                            { label: 'Warnings', prev: prevSummary.warnings ?? 0, curr: latestSummary.warnings ?? 0, color: C_WARN },
                            { label: 'Infos', prev: prevSummary.infos ?? 0, curr: latestSummary.infos ?? 0, color: C_INFO },
                            { label: 'Risk Score', prev: prevSummary.riskScore ?? 0, curr: latestSummary.riskScore ?? 0, color: C_LINE },
                        ].map(({ label, prev, curr, color }) => {
                            const delta = curr - prev;
                            const improved = delta < 0;
                            const pct = prev > 0 ? Math.round(Math.abs(delta) / prev * 100) : 0;
                            return (
                                <div key={label} className={styles.progressItem}>
                                    <div className={styles.progressLabel}>
                                        <span>{label}</span>
                                        <span className={styles.progressDelta} style={{ color: improved ? '#28a745' : delta > 0 ? '#d73a49' : '#9b9a97' }}>
                                            {delta === 0 ? '—' : `${improved ? '▼' : '▲'} ${pct}%`}
                                        </span>
                                    </div>
                                    <div className={styles.progressBar}>
                                        <div className={styles.progressFill} style={{ width: `${Math.min((curr / Math.max(prev, curr, 1)) * 100, 100)}%`, background: color }} />
                                    </div>
                                    <div className={styles.progressValues}>
                                        <span style={{ color: '#9b9a97' }}>{prev} → </span>
                                        <span style={{ color: '#37352f' }}>{curr}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Top Issues ───────────────────────────────────────────────── */}
            {latestDetail && latestDetail.issues.filter(i => i.severity === 'error').length > 0 && (
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Issues Requiring Attention</h3>
                        <a href={`/dashboard/scans/${latestDetail.id}`} className={styles.viewAll}>View all →</a>
                    </div>
                    <div className={styles.issuesList}>
                        {latestDetail.issues
                            .filter(i => i.severity === 'error')
                            .slice(0, 5)
                            .map((issue, idx) => (
                                <div
                                    key={idx}
                                    className={styles.issueRow}
                                    onClick={() => router.push(`/dashboard/scans/${latestDetail.id}`)}
                                >
                                    <span className={styles.issueRowIcon}>✖</span>
                                    <div className={styles.issueRowBody}>
                                        <span className={styles.issueRowCollection}>{issue.collection}</span>
                                        <span className={styles.issueRowSep}>›</span>
                                        <span className={styles.issueRowMessage}>{issue.message}</span>
                                    </div>
                                    <code className={styles.issueRowRule}>{issue.rule}</code>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ── Bottom Row: Recent Scans + API Key ────────────────────── */}
            <div className={styles.bottomRow}>
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Recent Scans</h3>
                        <a href="/dashboard/scans" className={styles.viewAll}>View all →</a>
                    </div>
                    <div className={styles.scanList}>
                        {scans.slice(0, 6).map(scan => {
                            const s = scan.summary as ScanSummary;
                            const score = s.riskScore ?? 0;
                            return (
                                <div
                                    key={scan.id}
                                    className={styles.scanRow}
                                    onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className={styles.scanBadge}>
                                        {score}
                                    </div>
                                    <div className={styles.scanInfo}>
                                        <div className={styles.scanDate}>{formatDate(scan.scannedAt)}</div>
                                        <div className={styles.scanCounts}>
                                            <span style={{ color: C_ERROR }}>✖ {s.errors ?? 0}</span>
                                            <span style={{ color: C_WARN }}>⚠ {s.warnings ?? 0}</span>
                                            <span style={{ color: C_INFO }}>ℹ {s.infos ?? 0}</span>
                                        </div>
                                    </div>
                                    <div className={styles.scanLevel} style={{ color: notionRiskColor(score) }}>
                                        {riskLevel(score)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>CLI Integration</h3>
                        <span className={styles.chartSub}>Your API key</span>
                    </div>
                    {apiKey ? (
                        <>
                            <div className={styles.apiKeyBox}>
                                <code className={styles.apiKeyValue}>{apiKey}</code>
                                <button className={styles.copyBtn} onClick={() => copyToClipboard(apiKey, setCopied)}>
                                    {copied ? '✓ Copied' : 'Copy'}
                                </button>
                            </div>
                            <div className={styles.cliExample}>
                                <code>
                                    npx lintbase scan firestore --key ./serviceAccount.json --save https://www.lintbase.com --token {apiKey.slice(0, 8)}••••••••
                                </code>
                            </div>
                        </>
                    ) : (
                        <p className={styles.noKey}>API key loading…</p>
                    )}
                </div>
            </div>
        </div>
    );
}
