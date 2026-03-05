'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../lib/auth';
import { getLatestScanDetail, getRecentScans, getScan, formatDate, type StoredScan, type StoredScanDetail, type CollectionSchema as StoredCollectionSchema } from '../../lib/db';
import styles from './schema/page.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Issue {
    severity: 'error' | 'warning' | 'info';
    collection: string;
    rule: string;
    message: string;
    affectedDocuments?: string[];
    suggestion?: string;
}

interface CollectionNode {
    id: string;
    name: string;
    docCount: number;
    fields: FieldInfo[];
    issues: Issue[];
    x: number;
    y: number;
}

interface FieldInfo {
    name: string;
    type: string;
    presence: number; // 0–1
    issues: Issue[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityColor(s: 'error' | 'warning' | 'info') {
    if (s === 'error') return '#d73a49';
    if (s === 'warning') return '#f66a0a';
    return '#0366d6';
}

function severityBg(s: 'error' | 'warning' | 'info') {
    if (s === 'error') return '#fff5f5';
    if (s === 'warning') return '#fff8f0';
    return '#f0f6ff';
}

function typeColor(t: string) {
    if (t === 'string') return '#0284c7';
    if (t === 'number') return '#059669';
    if (t === 'boolean') return '#7c3aed';
    if (t === 'timestamp') return '#d97706';
    if (t === 'reference') return '#db2777';
    if (t === 'array') return '#ea580c';
    if (t === 'map') return '#64748b';
    return '#9b9a97';
}

function collectionIcon(name: string) {
    if (/user/i.test(name)) return '👤';
    if (/order/i.test(name)) return '📦';
    if (/product/i.test(name)) return '🛍';
    if (/session/i.test(name)) return '🔑';
    if (/log/i.test(name)) return '📝';
    if (/payment/i.test(name)) return '💳';
    if (/message|chat/i.test(name)) return '💬';
    if (/notif/i.test(name)) return '🔔';
    if (/scan/i.test(name)) return '🔍';
    if (/analytic/i.test(name)) return '📊';
    return '🗄';
}

// ── Parse scan detail into CollectionNodes ────────────────────────────────────

// ── Build FieldInfo from REAL schema data ────────────────────────────────────

function fieldsFromRealSchema(col: StoredCollectionSchema, issuesByCollection: Record<string, Issue[]>): FieldInfo[] {
    const colIssues = issuesByCollection[col.name] ?? [];
    // Return ALL fields — card displays top 8, detail panel shows all
    return col.fields.map((f) => {
        const fieldIssues = colIssues.filter((i) =>
            i.message.toLowerCase().includes(f.name.toLowerCase())
        );
        return {
            name: f.name,
            type: f.types.length === 1 ? f.types[0] : 'mixed',
            presence: f.presenceRate,
            issues: fieldIssues,
        };
    });
}

function parseScanToNodes(detail: StoredScanDetail): CollectionNode[] {
    // Prefer real schema (contains ALL collections, even those with zero issues).
    // Fall back to deriving from issues for older scans that predate schema storage.
    const collectionNames: string[] =
        (detail.schema && detail.schema.length > 0)
            ? detail.schema.map(c => c.name)
            : [...new Set((detail.issues ?? []).map(i => i.collection).filter(Boolean))];

    if (collectionNames.length === 0) return [];

    // Group issues by collection
    const byCollection: Record<string, Issue[]> = {};
    for (const issue of detail.issues ?? []) {
        if (!byCollection[issue.collection]) byCollection[issue.collection] = [];
        byCollection[issue.collection].push(issue);
    }

    // Build pseudo-schema from issue message / rule heuristics
    const fieldRegex = /field[s]?\s+['"\`]?(\w+)['"\`]?/gi;
    const collectionFieldMap: Record<string, Map<string, { types: Set<string>; issueCount: number; issues: Issue[] }>> = {};

    for (const col of collectionNames) {
        collectionFieldMap[col] = new Map();
    }

    for (const issue of detail.issues ?? []) {
        const col = issue.collection;
        if (!collectionFieldMap[col]) collectionFieldMap[col] = new Map();

        const matches = [...(issue.message.matchAll(fieldRegex))];
        for (const m of matches) {
            const fieldName = m[1];
            if (!collectionFieldMap[col].has(fieldName)) {
                collectionFieldMap[col].set(fieldName, { types: new Set(), issueCount: 0, issues: [] });
            }
            const entry = collectionFieldMap[col].get(fieldName)!;
            entry.issueCount++;
            entry.issues.push(issue);

            const rulePrefix = issue.rule.split('/')[1] || '';
            if (rulePrefix.includes('timestamp')) entry.types.add('timestamp');
            else if (rulePrefix.includes('string')) entry.types.add('string');
            else entry.types.add('mixed');
        }

        if (issue.rule.includes('missing-index')) {
            ['__id__', 'createdAt'].forEach(f => {
                if (!collectionFieldMap[col].has(f)) {
                    collectionFieldMap[col].set(f, { types: new Set(['string']), issueCount: 0, issues: [] });
                }
            });
        }
    }

    // Build field list per collection (real schema takes priority)
    const realSchemaMap = new Map<string, StoredCollectionSchema>();
    for (const col of detail.schema ?? []) {
        realSchemaMap.set(col.name, col);
    }

    const COMMON_FIELDS: Record<string, FieldInfo[]> = {};
    for (const col of collectionNames) {
        const realCol = realSchemaMap.get(col);
        if (realCol) {
            // ✔ Real field data from CLI
            COMMON_FIELDS[col] = fieldsFromRealSchema(realCol, byCollection);
        } else {
            // ⚠ Fallback: infer from issue heuristics
            const fm = collectionFieldMap[col] ?? new Map();
            const fields: FieldInfo[] = [];
            fields.push({ name: 'id', type: 'string', presence: 1.0, issues: [] });

            for (const [name, data] of fm.entries()) {
                const resolvedType = data.types.size === 1 ? [...data.types][0] : 'mixed';
                fields.push({
                    name,
                    type: resolvedType,
                    presence: Math.max(0.2, 1 - data.issueCount * 0.15),
                    issues: data.issues,
                });
            }

            if (fields.length <= 1) {
                fields.push({ name: 'createdAt', type: 'timestamp', presence: 0.95, issues: [] });
                fields.push({ name: 'updatedAt', type: 'timestamp', presence: 0.8, issues: [] });
            }
            COMMON_FIELDS[col] = fields.slice(0, 8);
        }
    }

    // Grid layout
    const gridCols = Math.max(1, Math.ceil(Math.sqrt(collectionNames.length)));
    const CARD_W = 260;
    const CARD_H_BASE = 200;
    const GAP_X = 80;
    const GAP_Y = 60;
    const totalDocs = (detail.summary as unknown as Record<string, number>)?.totalDocuments ?? detail.documentCount ?? 0;

    return collectionNames.map((col, i) => ({
        id: col,
        name: col,
        docCount: Math.round(totalDocs / collectionNames.length),
        fields: COMMON_FIELDS[col] || [],
        issues: byCollection[col] || [],
        x: (i % gridCols) * (CARD_W + GAP_X) + 40,
        y: Math.floor(i / gridCols) * (CARD_H_BASE + GAP_Y) + 40,
    }));
}

// ── Health Radar ─────────────────────────────────────────────────────────
function HealthRadar({ node }: { node: CollectionNode }) {
    const dims = [
        { label: 'Schema', score: Math.max(0, 100 - node.issues.filter(i => i.rule.startsWith('schema/')).length * 18) },
        { label: 'Security', score: Math.max(0, 100 - node.issues.filter(i => i.rule.startsWith('security/')).length * 28) },
        { label: 'Perf', score: Math.max(0, 100 - node.issues.filter(i => i.rule.startsWith('perf/')).length * 18) },
        { label: 'Cost', score: Math.max(0, 100 - node.issues.filter(i => i.rule.startsWith('cost/')).length * 18) },
    ];
    const n = dims.length;
    const cx = 80, cy = 78, r = 52;
    const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
    const pt = (i: number, val: number) => [
        cx + (val / 100) * r * Math.cos(angle(i)),
        cy + (val / 100) * r * Math.sin(angle(i)),
    ];
    const outerPts = dims.map((_, i) => pt(i, 100));
    const dataPts = dims.map((d, i) => pt(i, d.score));
    const gridLevels = [25, 50, 75, 100];

    return (
        <div className={styles.radar}>
            <div className={styles.radarTitle}>Health Radar</div>
            <svg width={160} height={156} viewBox="0 0 160 156">
                {/* Grid polygons */}
                {gridLevels.map(level => (
                    <polygon key={level}
                        points={dims.map((_, i) => pt(i, level).join(',')).join(' ')}
                        fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                ))}
                {/* Axes */}
                {outerPts.map(([x, y], i) => (
                    <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />
                ))}
                {/* Data fill */}
                <polygon
                    points={dataPts.map(p => p.join(',')).join(' ')}
                    fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round"
                />
                {dataPts.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={3.5} fill="#6366f1" />
                ))}
                {/* Labels */}
                {dims.map((d, i) => {
                    const [x, y] = pt(i, 128);
                    const scoreColor = d.score >= 80 ? '#16a34a' : d.score >= 50 ? '#f66a0a' : '#d73a49';
                    return (
                        <g key={i}>
                            <text x={x} y={y - 3} textAnchor="middle" fontSize={9} fill="#6b7280">{d.label}</text>
                            <text x={x} y={y + 9} textAnchor="middle" fontSize={9} fontWeight="700" fill={scoreColor}>{d.score}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── Priority Quadrant ────────────────────────────────────────────────
function PriorityQuadrant({ nodes, selected, onSelect }: {
    nodes: CollectionNode[];
    selected: CollectionNode | null;
    onSelect: (node: CollectionNode) => void;
}) {
    if (nodes.length === 0) return null;
    const scored = nodes.map(n => ({
        node: n,
        // Impact: weighted issue severity
        impact: Math.min(100, n.issues.filter(i => i.severity === 'error').length * 22
            + n.issues.filter(i => i.severity === 'warning').length * 9
            + n.issues.filter(i => i.severity === 'info').length * 3),
        // Ease: inversely proportional to issue count (fewer = easier)
        ease: Math.max(0, 100 - n.issues.length * 9),
    }));

    const W = 520, H = 400, PAD = 70;
    const toX = (ease: number) => PAD + (ease / 100) * (W - PAD * 2);
    const toY = (impact: number) => H - PAD - (impact / 100) * (H - PAD * 2);
    const midX = (W) / 2, midY = (H) / 2;

    return (
        <div className={styles.quadrant}>
            <div className={styles.quadrantHeader}>
                <div className={styles.quadrantTitle}>Issue Priority Map</div>
                <div className={styles.quadrantSub}>Where to focus your effort — bubble size = number of issues</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: W }}>
                    {/* Background quadrants */}
                    <rect x={PAD} y={PAD} width={midX - PAD} height={midY - PAD} fill="rgba(215,58,73,0.04)" />
                    <rect x={midX} y={PAD} width={W - PAD - midX} height={midY - PAD} fill="rgba(22,163,74,0.06)" />
                    <rect x={PAD} y={midY} width={midX - PAD} height={H - PAD - midY} fill="rgba(0,0,0,0.02)" />
                    <rect x={midX} y={midY} width={W - PAD - midX} height={H - PAD - midY} fill="rgba(0,0,0,0.02)" />
                    {/* Quadrant labels */}
                    <text x={(PAD + midX) / 2} y={PAD + 20} textAnchor="middle" fontSize={9.5} fill="#d73a49" fontWeight="600">CRITICAL BACKLOG</text>
                    <text x={(midX + W - PAD) / 2} y={PAD + 20} textAnchor="middle" fontSize={9.5} fill="#16a34a" fontWeight="700">✓ FIX THESE FIRST</text>
                    <text x={(PAD + midX) / 2} y={H - PAD - 10} textAnchor="middle" fontSize={9} fill="#9ca3af">deprioritise</text>
                    <text x={(midX + W - PAD) / 2} y={H - PAD - 10} textAnchor="middle" fontSize={9} fill="#9ca3af">quick wins</text>
                    {/* Dividers */}
                    <line x1={midX} y1={PAD} x2={midX} y2={H - PAD} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 4" />
                    <line x1={PAD} y1={midY} x2={W - PAD} y2={midY} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 4" />
                    {/* Axis labels */}
                    <text x={W / 2} y={H - 12} textAnchor="middle" fontSize={10} fill="#9ca3af">← Harder to fix · Easier to fix →</text>
                    <text x={14} y={H / 2} textAnchor="middle" fontSize={10} fill="#9ca3af" transform={`rotate(-90,14,${H / 2})`}>Impact ↑</text>
                    {scored.map(({ node, impact, ease }) => {
                        const x = toX(ease);
                        const y = toY(impact);
                        const r = Math.max(8, Math.min(24, 8 + node.issues.length * 1.8));
                        const hasErr = node.issues.some(i => i.severity === 'error');
                        const hasWarn = node.issues.some(i => i.severity === 'warning');
                        const color = hasErr ? '#d73a49' : hasWarn ? '#f66a0a' : node.issues.length === 0 ? '#16a34a' : '#0366d6';
                        const bg = hasErr ? 'rgba(215,58,73,0.12)' : hasWarn ? 'rgba(246,106,10,0.12)' : node.issues.length === 0 ? 'rgba(22,163,74,0.1)' : 'rgba(3,102,214,0.1)';
                        const isSelected = selected?.id === node.id;
                        return (
                            <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(node)}>
                                <title>{node.name} — {node.issues.length} issue{node.issues.length !== 1 ? 's' : ''} · click to inspect</title>
                                {/* Selection ring */}
                                {isSelected && <circle cx={x} cy={y} r={r + 5} fill="none" stroke="#7c3aed" strokeWidth={2} opacity={0.6} />}
                                <circle cx={x} cy={y} r={r} fill={bg} stroke={isSelected ? '#7c3aed' : color} strokeWidth={isSelected ? 2.5 : 1.5} />
                                <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(7, r * 0.55)} fill={isSelected ? '#7c3aed' : color} fontWeight="700">
                                    {node.issues.length === 0 ? '✓' : node.issues.length}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

// ── Drift Timeline Bar ───────────────────────────────────────────────────
function TimelineBar({
    scans, selectedId, onSelect,
}: { scans: StoredScan[]; selectedId: string | null; onSelect: (id: string) => void }) {
    if (scans.length < 2) return null;
    const sorted = [...scans].sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as { seconds: number }).seconds * 1000;
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as { seconds: number }).seconds * 1000;
        return ta - tb;
    });
    const maxRisk = Math.max(...sorted.map(s => (s.summary as unknown as Record<string, number>)?.riskScore ?? 0), 1);
    return (
        <div className={styles.timeline}>
            <span className={styles.timelineLabel}>Scan history — click to compare</span>
            <div className={styles.timelineTrack}>
                {sorted.map((scan) => {
                    const risk = (scan.summary as unknown as Record<string, number>)?.riskScore ?? 0;
                    const color = risk >= 75 ? '#d73a49' : risk >= 50 ? '#f66a0a' : risk >= 25 ? '#e6a817' : '#16a34a';
                    const active = scan.id === selectedId;
                    const dateStr = formatDate(scan.createdAt);
                    return (
                        <button key={scan.id} className={`${styles.timelineDot} ${active ? styles.timelineDotActive : ''}`}
                            onClick={() => onSelect(scan.id)} title={`${dateStr} — risk ${risk}`}>
                            <div className={styles.timelineBar}
                                style={{ height: Math.max(4, (risk / maxRisk) * 40), background: color, opacity: active ? 1 : 0.45 }} />
                            <div className={styles.timelineCircle} style={{ background: color }} />
                            <div className={styles.timelineDate}>{dateStr.slice(0, 6)}</div>
                            {active && <div className={styles.timelineRisk} style={{ color }}>{risk}</div>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Collection Card ───────────────────────────────────────────────────────────

function CollectionCard({
    node,
    selected,
    onSelect,
    onMove,
    style,
}: {
    node: CollectionNode;
    selected: boolean;
    onSelect: (n: CollectionNode | null) => void;
    onMove: (id: string, dx: number, dy: number) => void;
    style?: React.CSSProperties;
}) {
    const errors = node.issues.filter(i => i.severity === 'error').length;
    const warnings = node.issues.filter(i => i.severity === 'warning').length;
    const infos = node.issues.filter(i => i.severity === 'info').length;
    const worstSeverity = errors > 0 ? 'error' : warnings > 0 ? 'warning' : infos > 0 ? 'info' : null;

    const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Field rows: stop propagation (prevent canvas pan) but don't start drag
        if ((e.target as HTMLElement).closest(`.${styles.fieldRow}`)) {
            e.stopPropagation();
            return;
        }
        e.stopPropagation(); // prevent canvas pan
        dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };

        const onMouseMove = (me: MouseEvent) => {
            if (!dragRef.current) return;
            const dx = me.clientX - dragRef.current.startX;
            const dy = me.clientY - dragRef.current.startY;
            if (!dragRef.current.dragging && Math.hypot(dx, dy) > 4) {
                dragRef.current.dragging = true;
            }
            if (dragRef.current.dragging) {
                onMove(node.id, dx, dy);
                dragRef.current.startX = me.clientX;
                dragRef.current.startY = me.clientY;
            }
        };
        const onMouseUp = (me: MouseEvent) => {
            const wasDragging = dragRef.current?.dragging;
            dragRef.current = null;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (!wasDragging) {
                // it was a click — toggle selection
                onSelect(selected ? null : node);
            }
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div
            className={`${styles.card} ${selected ? styles.cardSelected : ''} ${worstSeverity ? styles[`card_${worstSeverity}`] : ''}`}
            style={{ ...style, userSelect: 'none' }}
            onMouseDown={handleMouseDown}
            onClick={e => e.stopPropagation()} // prevent canvas onClick from deselecting after a card click
        >
            {/* Card header */}
            <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>{collectionIcon(node.name)}</div>
                <div className={styles.cardMeta}>
                    <div className={styles.cardName}>{node.name}</div>
                    <div className={styles.cardCount}>{node.docCount} docs sampled</div>
                </div>
                {worstSeverity && (
                    <div className={styles.cardPulse} style={{ background: severityColor(worstSeverity) }} />
                )}
            </div>

            {/* Severity badges */}
            {(errors > 0 || warnings > 0 || infos > 0) && (
                <div className={styles.cardBadges}>
                    {errors > 0 && <span className={styles.badge} style={{ background: '#fff5f5', color: '#d73a49' }}>✖ {errors}</span>}
                    {warnings > 0 && <span className={styles.badge} style={{ background: '#fff8f0', color: '#f66a0a' }}>⚠ {warnings}</span>}
                    {infos > 0 && <span className={styles.badge} style={{ background: '#f0f6ff', color: '#0366d6' }}>ℹ {infos}</span>}
                </div>
            )}

            {/* Field list — top 8 on card, all in detail panel */}
            <div className={styles.fieldList}>
                {node.fields.slice(0, 8).map((f) => (
                    <div key={f.name} className={styles.fieldRow}>
                        <div className={styles.fieldName}>
                            <span className={styles.fieldBullet} style={{ background: typeColor(f.type) }} />
                            <span>{f.name}</span>
                            {f.issues.length > 0 && (
                                <span className={styles.fieldIssueIcon} style={{ color: severityColor(f.issues[0].severity) }}>
                                    {f.issues[0].severity === 'error' ? '✖' : f.issues[0].severity === 'warning' ? '⚠' : 'ℹ'}
                                </span>
                            )}
                        </div>
                        <div className={styles.fieldType} style={{ color: typeColor(f.type) }}>
                            {f.type}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className={styles.cardFooter}>
                {node.fields.length > 8 && (
                    <span style={{ color: '#7c3aed', marginRight: 6 }}>+{node.fields.length - 8} more</span>
                )}
                {selected ? 'click to deselect' : `${node.issues.length} issue${node.issues.length !== 1 ? 's' : ''} · click to inspect`}
            </div>
        </div>
    );
}

// \u2500\u2500 Detail Panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function DetailPanel({ node, onClose }: { node: CollectionNode; onClose: () => void }) {
    const [selectedField, setSelectedField] = useState<string | null>(null);

    const toggleField = (name: string) => setSelectedField(prev => prev === name ? null : name);

    const allIssues = [...node.issues.filter(i => i.severity === 'error'),
    ...node.issues.filter(i => i.severity === 'warning'),
    ...node.issues.filter(i => i.severity === 'info')];

    const visibleIssues = selectedField
        ? allIssues.filter(i =>
            i.message.toLowerCase().includes(selectedField.toLowerCase()) ||
            (i.rule ?? '').toLowerCase().includes(selectedField.toLowerCase()))
        : allIssues;

    return (
        <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
                <div className={styles.detailTitle}>
                    <span>{collectionIcon(node.name)}</span>
                    <span>{node.name}</span>
                </div>
                <button className={styles.detailClose} onClick={onClose}>\u2715</button>
            </div>

            <div className={styles.detailBody}>
                {/* Health Radar */}
                <HealthRadar node={node} />

                {/* Fields section */}
                <div className={styles.detailSection}>
                    <div className={styles.detailSectionLabel}>
                        FIELDS ({node.fields.length})
                        {selectedField && <span style={{ marginLeft: 6, color: '#7c3aed', fontSize: 9 }}>\u2022 click field to clear</span>}
                    </div>
                    {node.fields.map((f) => {
                        const isActive = selectedField === f.name;
                        return (
                            <div
                                key={f.name}
                                className={styles.detailField}
                                style={{
                                    cursor: 'pointer',
                                    background: isActive ? 'rgba(124,58,237,0.06)' : undefined,
                                    borderRadius: isActive ? 4 : undefined,
                                    margin: isActive ? '0 -4px' : undefined,
                                    padding: isActive ? '5px 4px' : undefined,
                                }}
                                onClick={() => toggleField(f.name)}
                                title={`Click to filter issues for "${f.name}"`}
                            >
                                <div className={styles.detailFieldLeft}>
                                    <span className={styles.fieldBullet} style={{ background: isActive ? '#7c3aed' : typeColor(f.type) }} />
                                    <span className={styles.detailFieldName} style={{ color: isActive ? '#7c3aed' : undefined, fontWeight: isActive ? 600 : undefined }}>{f.name}</span>
                                </div>
                                <div className={styles.detailFieldRight}>
                                    <span className={styles.detailFieldType} style={{ color: isActive ? '#7c3aed' : typeColor(f.type) }}>{f.type}</span>
                                    <div className={styles.presenceBar}>
                                        <div
                                            className={styles.presenceFill}
                                            style={{
                                                width: `${f.presence * 100}%`,
                                                background: f.presence > 0.8 ? '#28a745' : f.presence > 0.5 ? '#f66a0a' : '#d73a49'
                                            }}
                                        />
                                    </div>
                                    <span className={styles.presenceLabel}>{Math.round(f.presence * 100)}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Issues section */}
                {node.issues.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionLabel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {selectedField ? (
                                <>
                                    <span>ISSUES FOR <span style={{ color: '#7c3aed' }}>{selectedField}</span> ({visibleIssues.length})</span>
                                    <button
                                        onClick={() => setSelectedField(null)}
                                        style={{ background: 'rgba(124,58,237,0.1)', border: 'none', color: '#7c3aed', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, cursor: 'pointer' }}
                                    >
                                        \u00d7 CLEAR
                                    </button>
                                </>
                            ) : (
                                <span>ISSUES ({node.issues.length}) \u2014 <span style={{ fontWeight: 400, opacity: 0.6 }}>click a field to filter</span></span>
                            )}
                        </div>
                        {visibleIssues.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--n-text-3)', padding: '8px 0' }}>No issues directly reference &quot;{selectedField}&quot;</div>
                        ) : (
                            visibleIssues.map((issue, i) => (
                                <div key={i} className={styles.detailIssue} style={{ borderLeft: `3px solid ${severityColor(issue.severity)}` }}>
                                    <div className={styles.detailIssueHeader}>
                                        <span className={styles.detailIssueSev} style={{ color: severityColor(issue.severity), background: severityBg(issue.severity) }}>
                                            {issue.severity.toUpperCase()}
                                        </span>
                                        <code className={styles.detailIssueRule}>{issue.rule}</code>
                                    </div>
                                    <div className={styles.detailIssueMsg}>{issue.message}</div>
                                    {issue.suggestion && (
                                        <div className={styles.detailIssueSug}>\ud83d\udca1 {issue.suggestion}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {node.issues.length === 0 && (
                    <div className={styles.detailClean}>
                        <div className={styles.detailCleanIcon}>\u2705</div>
                        <div className={styles.detailCleanMsg}>No issues found in this collection</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// \u2500\u2500 Main Page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export default function SchemaPage() {
    const { user } = useAuth();
    const [detail, setDetail] = useState<StoredScanDetail | null>(null);
    const [nodes, setNodes] = useState<CollectionNode[]>([]);
    const [selected, setSelected] = useState<CollectionNode | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'priority'>('grid');
    const [recentScans, setRecentScans] = useState<StoredScan[]>([]);
    const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
    const [replayKey, setReplayKey] = useState(0);

    // Pan state
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user) return;
        Promise.all([
            getLatestScanDetail(user.uid),
            getRecentScans(user.uid, 10),
        ]).then(([d, scans]) => {
            setDetail(d);
            setRecentScans(scans);
            setSelectedScanId(scans[0]?.id ?? null);
            if (d) setNodes(parseScanToNodes(d));
            setLoading(false);
        });
    }, [user]);

    const handleScanSelect = useCallback(async (scanId: string) => {
        if (!user || scanId === selectedScanId) return;
        setSelectedScanId(scanId);
        setSelected(null);
        const d = await getScan(user.uid, scanId);
        if (d) {
            setDetail(d);
            setNodes(parseScanToNodes(d));
            setPan({ x: 0, y: 0 });
            setZoom(1);
            setReplayKey(k => k + 1);
        }
    }, [user, selectedScanId]);

    /** Move a card by (dx, dy) px — called from CollectionCard drag logic */
    const handleMoveCard = useCallback((id: string, dx: number, dy: number) => {
        setNodes(prev => prev.map(n =>
            n.id === id ? { ...n, x: n.x + dx / zoom, y: n.y + dy / zoom } : n
        ));
    }, [zoom]);


    // Pan handlers
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(`.${styles.card}`)) return;
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }, [pan]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning.current) return;
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    }, []);

    const onMouseUp = useCallback(() => { isPanning.current = false; }, []);

    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(z => Math.min(Math.max(z - e.deltaY * 0.001, 0.4), 2));
    }, []);

    const resetView = () => { setPan({ x: 0, y: 0 }); setZoom(1); };

    // ── Stats ──────────────────────────────────────────────────────────────────
    const totalErrors = nodes.reduce((s, n) => s + n.issues.filter(i => i.severity === 'error').length, 0);
    const totalWarnings = nodes.reduce((s, n) => s + n.issues.filter(i => i.severity === 'warning').length, 0);
    const totalInfos = nodes.reduce((s, n) => s + n.issues.filter(i => i.severity === 'info').length, 0);

    // ── Loading / Empty states ─────────────────────────────────────────────────
    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.loadingOrb} />
                <p>Loading schema map…</p>
            </div>
        );
    }

    if (!detail || nodes.length === 0) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}>🗄</div>
                <h2>No schema data yet</h2>
                <p>Run a scan to visualize your Firestore schema here.</p>
                <code className={styles.emptyCode}>npx lintbase scan firestore --key ./sa.json</code>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <h1 className={styles.toolbarTitle}>Schema Map</h1>
                    <span className={styles.toolbarSub}>
                        {nodes.length} collection{nodes.length !== 1 ? 's' : ''} · {detail ? formatDate(detail.scannedAt) : ''}
                    </span>
                </div>

                <div className={styles.toolbarStats}>
                    {totalErrors > 0 && <span className={styles.statPill} style={{ background: '#fff5f5', color: '#d73a49' }}>✖ {totalErrors} errors</span>}
                    {totalWarnings > 0 && <span className={styles.statPill} style={{ background: '#fff8f0', color: '#f66a0a' }}>⚠ {totalWarnings} warnings</span>}
                    {totalInfos > 0 && <span className={styles.statPill} style={{ background: '#f0f6ff', color: '#0366d6' }}>ℹ {totalInfos} infos</span>}
                </div>

                <div className={styles.toolbarRight}>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Canvas view"
                        >
                            ⊞ Canvas
                        </button>
                        <button
                            className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
                            onClick={() => setViewMode('list')}
                            title="List view"
                        >
                            ≡ List
                        </button>
                        <button
                            className={`${styles.viewBtn} ${viewMode === 'priority' ? styles.viewBtnActive : ''}`}
                            onClick={() => setViewMode('priority')}
                            title="Priority map"
                        >
                            ⊕ Priority
                        </button>
                    </div>

                    {viewMode === 'grid' && (
                        <div className={styles.zoomControls}>
                            <button className={styles.zoomBtn} onClick={() => setZoom(z => Math.min(z + 0.15, 2))}>+</button>
                            <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
                            <button className={styles.zoomBtn} onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))}>−</button>
                            <button className={styles.zoomBtn} onClick={resetView} title="Reset view">⟲</button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────────── */}
            <div className={styles.content}>
                {viewMode === 'grid' ? (
                    /* ── Canvas View ─────────────────────────────────────────────── */
                    <div
                        ref={canvasRef}
                        className={styles.canvas}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                        onWheel={onWheel}
                        onClick={() => setSelected(null)}
                    >
                        {/* Dot grid background */}
                        <svg className={styles.canvasGrid} style={{ transform: `translate(${pan.x % (20 * zoom)}px, ${pan.y % (20 * zoom)}px)` }}>
                            <defs>
                                <pattern id="dots" x="0" y="0" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse">
                                    <circle cx={zoom} cy={zoom} r={0.8} fill="rgba(0,0,0,0.08)" />
                                </pattern>
                            </defs>
                            <rect width="200%" height="200%" fill="url(#dots)" />
                        </svg>

                        {/* Cards container — keyed by replayKey so switching scans remounts all
                             cards and re-triggers the cardIn stagger animation */}
                        <div
                            key={replayKey}
                            className={styles.cardsContainer}
                            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
                        >
                            {nodes.map((node, i) => (
                                <CollectionCard
                                    key={node.id}
                                    node={node}
                                    selected={selected?.id === node.id}
                                    onSelect={setSelected}
                                    onMove={handleMoveCard}
                                    style={{
                                        position: 'absolute',
                                        left: node.x,
                                        top: node.y,
                                        animationDelay: `${i * 60}ms`,
                                    }}
                                />
                            ))}
                        </div>

                        {/* Canvas legend */}
                        <div className={styles.legend}>
                            <div className={styles.legendTitle}>Field Types</div>
                            {[
                                { type: 'string', label: 'string' },
                                { type: 'number', label: 'number' },
                                { type: 'boolean', label: 'boolean' },
                                { type: 'timestamp', label: 'timestamp' },
                                { type: 'reference', label: 'reference' },
                                { type: 'array', label: 'array' },
                                { type: 'map', label: 'map' },
                            ].map(({ type, label }) => (
                                <div key={type} className={styles.legendItem}>
                                    <span className={styles.legendDot} style={{ background: typeColor(type) }} />
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : viewMode === 'priority' ? (
                    /* ── Priority View ──────────────────────────────────────────── */
                    <PriorityQuadrant nodes={nodes} selected={selected} onSelect={setSelected} />
                ) : (
                    /* ── List View ───────────────────────────────────────────────── */
                    <div className={styles.listView}>
                        {nodes.map((node) => {
                            const errs = node.issues.filter(i => i.severity === 'error').length;
                            const warns = node.issues.filter(i => i.severity === 'warning').length;
                            const inf = node.issues.filter(i => i.severity === 'info').length;
                            return (
                                <div
                                    key={node.id}
                                    className={`${styles.listRow} ${selected?.id === node.id ? styles.listRowSelected : ''}`}
                                    onClick={() => setSelected(prev => prev?.id === node.id ? null : node)}
                                >
                                    <div className={styles.listRowIcon}>{collectionIcon(node.name)}</div>
                                    <div className={styles.listRowName}>{node.name}</div>
                                    <div className={styles.listRowFields}>{node.fields.length} fields</div>
                                    <div className={styles.listRowBadges}>
                                        {errs > 0 && <span style={{ color: '#d73a49' }}>✖ {errs}</span>}
                                        {warns > 0 && <span style={{ color: '#f66a0a' }}>⚠ {warns}</span>}
                                        {inf > 0 && <span style={{ color: '#0366d6' }}>ℹ {inf}</span>}
                                        {errs + warns + inf === 0 && <span style={{ color: '#28a745' }}>✓ clean</span>}
                                    </div>
                                    <div className={styles.listRowArrow}>›</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Detail Panel ──────────────────────────────────────────────── */}
                {selected && (
                    <DetailPanel node={selected} onClose={() => setSelected(null)} />
                )}
            </div>

            {/* ── Drift Timeline ────────────────────────────────────────────────── */}
            <TimelineBar scans={recentScans} selectedId={selectedScanId} onSelect={handleScanSelect} />
        </div>
    );
}
