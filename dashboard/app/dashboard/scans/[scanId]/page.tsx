'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { getScan, riskLevel, formatDate } from '../../../../lib/db';
import type { StoredScanDetail } from '../../../../lib/db';
import styles from './page.module.css';

type Severity = 'all' | 'error' | 'warning' | 'info';

type Issue = {
    severity: 'error' | 'warning' | 'info';
    collection: string;
    rule: string;
    message: string;
    affectedDocuments?: string[];
    suggestion?: string;
};

function notionRiskColor(s: number) {
    if (s >= 80) return '#d73a49'; if (s >= 60) return '#f66a0a';
    if (s >= 40) return '#dbab09'; return '#28a745';
}
function notionRiskBg(s: number) {
    if (s >= 80) return '#fff5f5'; if (s >= 60) return '#fff8f0';
    if (s >= 40) return '#fffbf0'; return '#f0fff4';
}

const SEV_ICON: Record<string, string> = { error: '✖', warning: '⚠', info: 'ℹ' };
const SEV_COLOR: Record<string, string> = { error: '#d73a49', warning: '#f66a0a', info: '#0366d6' };
const SEV_BG: Record<string, string> = { error: '#fff5f5', warning: '#fff8f0', info: '#f0f6ff' };
const SEV_LABEL: Record<string, string> = { error: 'Error', warning: 'Warning', info: 'Info' };

export default function ScanDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const scanId = params?.scanId as string;

    const [scan, setScan] = useState<StoredScanDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Severity>('all');
    const [expandedCol, setExpanded] = useState<string | null>(null);
    const [selected, setSelected] = useState<Issue | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user || !scanId) return;
        getScan(user.uid, scanId).then(s => { setScan(s); setLoading(false); });
    }, [user, scanId]);

    // Close panel on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const copyIssue = useCallback(() => {
        if (!selected || !scan) return;
        const text = [
            `Rule: ${selected.rule}`,
            `Severity: ${SEV_LABEL[selected.severity]}`,
            `Entity: ${selected.collection}`,
            `Connector: ${scan.connector}`,
            `Issue: ${selected.message}`,
            selected.suggestion ? `Fix: ${selected.suggestion}` : null,
            selected.affectedDocuments?.length
                ? `Affected: ${selected.affectedDocuments.join(', ')}`
                : null,
        ].filter(Boolean).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [selected, scan]);

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

    const summary = scan.summary as {
        riskScore?: number; errors?: number; warnings?: number;
        infos?: number; totalCollections?: number; totalDocuments?: number;
    };
    const score = summary.riskScore ?? 0;
    const issues = (scan.issues ?? []) as Issue[];

    const filtered = filter === 'all' ? issues : issues.filter(i => i.severity === filter);

    const grouped = filtered.reduce((acc, issue) => {
        if (!acc[issue.collection]) acc[issue.collection] = [];
        acc[issue.collection].push(issue);
        return acc;
    }, {} as Record<string, Issue[]>);

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
        <>
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
                            <span className={styles.connectorBadge}>{scan.connector}</span>
                            {summary.totalCollections != null && <>
                                <span className={styles.metaDot}>·</span>
                                <span>{summary.totalCollections} entities</span>
                            </>}
                            {summary.totalDocuments != null && <>
                                <span className={styles.metaDot}>·</span>
                                <span>{summary.totalDocuments} records sampled</span>
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
                        { label: 'Warnings', val: summary.warnings ?? 0, color: '#f66a0a' },
                        { label: 'Infos', val: summary.infos ?? 0, color: '#0366d6' },
                        { label: 'Entities', val: summary.totalCollections ?? sortedCollections.length, color: '#37352f' },
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
                            style={filter === f && f !== 'all' ? { borderBottomColor: SEV_COLOR[f], color: SEV_COLOR[f] } : {}}
                        >
                            {f === 'all'
                                ? `All  ${counts.all}`
                                : `${SEV_ICON[f]}  ${f === 'error' ? 'Errors' : f === 'warning' ? 'Warnings' : 'Infos'}  ${counts[f]}`}
                        </button>
                    ))}
                    {selected && (
                        <button className={styles.clearPanel} onClick={() => setSelected(null)}>
                            ✕ Close detail
                        </button>
                    )}
                </div>

                {/* ── Issues grouped by entity ── */}
                {filtered.length === 0 ? (
                    <div className={styles.empty}>No issues match this filter.</div>
                ) : (
                    <div className={styles.collections}>
                        {sortedCollections.map(([colName, colIssues]) => {
                            const isOpen = expandedCol === colName || expandedCol === null;
                            const colErrors = colIssues.filter(i => i.severity === 'error').length;
                            return (
                                <div key={colName} className={styles.collection}>
                                    <button
                                        className={styles.collectionHeader}
                                        onClick={() => setExpanded(expandedCol === colName ? null : colName)}
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
                                                .sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]))
                                                .map((issue, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`${styles.issue} ${selected === issue ? styles.issueSelected : ''}`}
                                                        onClick={() => setSelected(selected === issue ? null : issue)}
                                                    >
                                                        <span className={styles.issueIcon} style={{ color: SEV_COLOR[issue.severity] }}>
                                                            {SEV_ICON[issue.severity]}
                                                        </span>
                                                        <div className={styles.issueBody}>
                                                            <div className={styles.issueTop}>
                                                                <span className={styles.issueMessage}>{issue.message}</span>
                                                                <code className={styles.issueRule}>{issue.rule}</code>
                                                            </div>
                                                            {issue.suggestion && (
                                                                <div className={styles.issueSuggestion}>→ {issue.suggestion}</div>
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
                                                        <span className={styles.issueChevron}>›</span>
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

            {/* ── Issue Detail Panel ── */}
            {selected && (
                <>
                    <div className={styles.overlay} onClick={() => setSelected(null)} />
                    <aside className={styles.panel}>
                        {/* Header */}
                        <div className={styles.panelHeader} style={{ borderBottomColor: SEV_COLOR[selected.severity] + '33' }}>
                            <div className={styles.panelSeverity}>
                                <span className={styles.panelSevIcon} style={{ color: SEV_COLOR[selected.severity], background: SEV_BG[selected.severity] }}>
                                    {SEV_ICON[selected.severity]}
                                </span>
                                <div>
                                    <div className={styles.panelEntity}>{selected.collection}</div>
                                    <div className={styles.panelSevLabel} style={{ color: SEV_COLOR[selected.severity] }}>
                                        {SEV_LABEL[selected.severity]}
                                    </div>
                                </div>
                            </div>
                            <button className={styles.panelClose} onClick={() => setSelected(null)}>✕</button>
                        </div>

                        {/* Body */}
                        <div className={styles.panelBody}>

                            <div className={styles.panelSection}>
                                <div className={styles.panelSectionLabel}>Issue</div>
                                <p className={styles.panelMessage}>{selected.message}</p>
                            </div>

                            {selected.suggestion && (
                                <div className={styles.panelSection}>
                                    <div className={styles.panelSectionLabel}>How to fix</div>
                                    <p className={styles.panelSuggestion}>{selected.suggestion}</p>
                                </div>
                            )}

                            {selected.affectedDocuments && selected.affectedDocuments.length > 0 && (
                                <div className={styles.panelSection}>
                                    <div className={styles.panelSectionLabel}>
                                        Affected records
                                        <span className={styles.panelSectionCount}>{selected.affectedDocuments.length}</span>
                                    </div>
                                    <div className={styles.panelDocs}>
                                        {selected.affectedDocuments.map(d => (
                                            <code key={d} className={styles.panelDocId}>{d}</code>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.panelSection}>
                                <div className={styles.panelSectionLabel}>Rule</div>
                                <code className={styles.panelRuleFull}>{selected.rule}</code>
                            </div>

                            <div className={styles.panelSection}>
                                <div className={styles.panelSectionLabel}>Connector</div>
                                <span className={styles.panelConnector}>{scan.connector}</span>
                            </div>

                        </div>

                        {/* Footer */}
                        <div className={styles.panelFooter}>
                            <p className={styles.panelFooterHint}>
                                Fix in your codebase and run the next scan to verify.
                            </p>
                            <button className={styles.copyBtn} onClick={copyIssue}>
                                {copied ? '✓ Copied' : 'Copy issue details'}
                            </button>
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}
