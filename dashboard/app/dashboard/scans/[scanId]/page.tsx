'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { getScan, riskLevel, formatDate } from '../../../../lib/db';
import type { StoredScanDetail } from '../../../../lib/db';
import styles from './page.module.css';

type Severity = 'all' | 'error' | 'warning' | 'info';

function notionRiskColor(s: number) {
    if (s >= 80) return '#d73a49'; if (s >= 60) return '#f66a0a';
    if (s >= 40) return '#dbab09'; return '#28a745';
}
function notionRiskBg(s: number) {
    if (s >= 80) return '#fff5f5'; if (s >= 60) return '#fff8f0';
    if (s >= 40) return '#fffbf0'; return '#f0fff4';
}

const SEV_ICON: Record<string, string> = { error: '✖', warning: '⚠', info: 'ℹ' };
const SEV_COLOR: Record<string, string> = { error: '#d73a49', warning: '#9b9a97', info: '#9b9a97' };

export default function ScanDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const scanId = params?.scanId as string;

    const [scan, setScan] = useState<StoredScanDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Severity>('all');
    const [expandedCollection, setExpandedCollection] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !scanId) return;
        getScan(user.uid, scanId).then(s => {
            setScan(s);
            setLoading(false);
        });
    }, [user, scanId]);

    if (loading) return (
        <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading scan…</span>
        </div>
    );

    if (!scan) return (
        <div className={styles.loading}>
            <p>Scan not found. <Link href="/dashboard/scans" className={styles.link}>← Back to scans</Link></p>
        </div>
    );

    const summary = scan.summary as { riskScore?: number; errors?: number; warnings?: number; infos?: number; totalCollections?: number; totalDocuments?: number };
    const score = summary.riskScore ?? 0;
    const issues = scan.issues ?? [];

    const filtered = filter === 'all' ? issues : issues.filter(i => i.severity === filter);

    // Group by collection
    const grouped = filtered.reduce((acc, issue) => {
        if (!acc[issue.collection]) acc[issue.collection] = [];
        acc[issue.collection].push(issue);
        return acc;
    }, {} as Record<string, typeof issues>);

    // Sort collections by error count desc
    const sortedCollections = Object.entries(grouped).sort(([, a], [, b]) => {
        const errA = a.filter(i => i.severity === 'error').length;
        const errB = b.filter(i => i.severity === 'error').length;
        return errB - errA;
    });

    const counts = {
        all: issues.length,
        error: issues.filter(i => i.severity === 'error').length,
        warning: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length,
    };

    return (
        <div className={styles.page}>
            {/* ── Breadcrumb ── */}
            <div className={styles.breadcrumb}>
                <Link href="/dashboard" className={styles.breadLink}>Overview</Link>
                <span className={styles.breadSep}>›</span>
                <Link href="/dashboard/scans" className={styles.breadLink}>Scan History</Link>
                <span className={styles.breadSep}>›</span>
                <span className={styles.breadCurrent}>Scan Detail</span>
            </div>

            {/* ── Scan Header ── */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Scan Report</h1>
                    <div className={styles.meta}>
                        <span>{formatDate(scan.scannedAt)}</span>
                        <span className={styles.metaDot}>·</span>
                        <span>{scan.connector}</span>
                        {summary.totalCollections != null && <>
                            <span className={styles.metaDot}>·</span>
                            <span>{summary.totalCollections} collections</span>
                        </>}
                        {summary.totalDocuments != null && <>
                            <span className={styles.metaDot}>·</span>
                            <span>{summary.totalDocuments} docs sampled</span>
                        </>}
                    </div>
                </div>
                <div className={styles.scorePill} style={{ background: notionRiskBg(score), color: notionRiskColor(score) }}>
                    <span className={styles.scoreNum}>{score}</span>
                    <span className={styles.scoreLabel}>{riskLevel(score)}</span>
                </div>
            </div>

            {/* ── Summary row ── */}
            <div className={styles.summaryRow}>
                {[
                    { label: 'Errors', val: summary.errors ?? 0, color: '#d73a49' },
                    { label: 'Warnings', val: summary.warnings ?? 0, color: '#9b9a97' },
                    { label: 'Infos', val: summary.infos ?? 0, color: '#9b9a97' },
                    { label: 'Collections', val: summary.totalCollections ?? sortedCollections.length, color: '#37352f' },
                ].map(({ label, val, color }) => (
                    <div key={label} className={styles.summaryCard}>
                        <div className={styles.summaryVal} style={{ color }}>{val}</div>
                        <div className={styles.summaryLabel}>{label}</div>
                    </div>
                ))}
            </div>

            {/* ── Filter bar ── */}
            <div className={styles.filterBar}>
                {(['all', 'error', 'warning', 'info'] as Severity[]).map(f => (
                    <button
                        key={f}
                        className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' ? `All  ${counts.all}` : `${SEV_ICON[f]}  ${f === 'error' ? 'Errors' : f === 'warning' ? 'Warnings' : 'Infos'}  ${counts[f]}`}
                    </button>
                ))}
            </div>

            {/* ── Issues grouped by collection ── */}
            {filtered.length === 0 ? (
                <div className={styles.empty}>No issues match this filter.</div>
            ) : (
                <div className={styles.collections}>
                    {sortedCollections.map(([colName, colIssues]) => {
                        const isOpen = expandedCollection === colName || expandedCollection === null;
                        const colErrors = colIssues.filter(i => i.severity === 'error').length;
                        return (
                            <div key={colName} className={styles.collection}>
                                <button
                                    className={styles.collectionHeader}
                                    onClick={() => setExpandedCollection(
                                        expandedCollection === colName ? null : colName
                                    )}
                                >
                                    <span className={styles.collectionToggle}>{isOpen ? '▾' : '▸'}</span>
                                    <span className={styles.collectionName}>{colName}</span>
                                    <div className={styles.collectionBadges}>
                                        {colErrors > 0 && <span className={styles.badgeError}>{colErrors} error{colErrors !== 1 ? 's' : ''}</span>}
                                        <span className={styles.badgeMuted}>{colIssues.length} issue{colIssues.length !== 1 ? 's' : ''}</span>
                                    </div>
                                </button>

                                {isOpen && (
                                    <div className={styles.issueList}>
                                        {colIssues
                                            .sort((a, b) => {
                                                const order = { error: 0, warning: 1, info: 2 };
                                                return order[a.severity] - order[b.severity];
                                            })
                                            .map((issue, idx) => (
                                                <div key={idx} className={styles.issue}>
                                                    <span className={styles.issueIcon} style={{ color: SEV_COLOR[issue.severity] }}>
                                                        {SEV_ICON[issue.severity]}
                                                    </span>
                                                    <div className={styles.issueBody}>
                                                        <div className={styles.issueTop}>
                                                            <span className={styles.issueMessage}>{issue.message}</span>
                                                            <code className={styles.issueRule}>{issue.rule}</code>
                                                        </div>
                                                        {issue.suggestion && (
                                                            <div className={styles.issueSuggestion}>
                                                                → {issue.suggestion}
                                                            </div>
                                                        )}
                                                        {issue.affectedDocuments && issue.affectedDocuments.length > 0 && (
                                                            <div className={styles.issueDocs}>
                                                                {issue.affectedDocuments.slice(0, 3).map(d => (
                                                                    <code key={d} className={styles.docId}>{d}</code>
                                                                ))}
                                                                {issue.affectedDocuments.length > 3 && (
                                                                    <span className={styles.docsMore}>+{issue.affectedDocuments.length - 3} more</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
