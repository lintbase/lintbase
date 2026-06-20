// src/reporters/markdown.reporter.ts
// Exports scan results as Obsidian-compatible Markdown.
// One file per collection + a README.md index page.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { LintBaseReport, CollectionSchema, LintBaseIssue } from '../types/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Stable icon for a field based on presence + type consistency */
function fieldStabilityIcon(stable: boolean, presenceRate: number): string {
    if (stable && presenceRate === 1) return '✅';
    if (stable) return '✅';
    if (presenceRate < 0.6) return '❌';
    return '⚠️';
}

/** Obsidian callout type for a severity level */
function calloutType(severity: 'error' | 'warning' | 'info'): string {
    if (severity === 'error') return 'danger';
    if (severity === 'warning') return 'warning';
    return 'info';
}

/** Sanitize a collection name for use as a filename */
function toFilename(collection: string): string {
    return collection.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/** Format a type list as a readable union string */
function formatTypes(types: string[]): string {
    return types.length === 1 ? types[0] : `union(${types.join(' | ')})`;
}

/** Render wikilinks for fields that look like foreign keys to known collections */
function maybeWikilink(fieldName: string, knownCollections: Set<string>): string {
    // Heuristic: field named "userId" → try linking to "users", "user"
    const lower = fieldName.toLowerCase();
    const guesses = [
        lower.replace(/id$/, 's'),    // userId → users
        lower.replace(/id$/, ''),     // userId → user
        lower.replace(/ref$/, 's'),   // orderRef → orders
    ];
    for (const guess of guesses) {
        if (knownCollections.has(guess)) return ` → [[${guess}]]`;
    }
    return '';
}

// ── Per-collection file ──────────────────────────────────────────────────────

function renderCollectionFile(
    schema: CollectionSchema,
    issues: LintBaseIssue[],
    knownCollections: Set<string>,
    scannedAt: Date,
): string {
    const collectionIssues = issues.filter(i => i.collection === schema.name);
    const errors = collectionIssues.filter(i => i.severity === 'error');
    const warnings = collectionIssues.filter(i => i.severity === 'warning');
    const infos = collectionIssues.filter(i => i.severity === 'info');

    const lines: string[] = [];

    // ── YAML frontmatter ──────────────────────────────────────────────────
    lines.push('---');
    lines.push('tool: lintbase');
    lines.push(`collection: ${schema.name}`);
    lines.push(`sampleSize: ${schema.sampledDocuments}`);
    lines.push(`generatedAt: ${scannedAt.toISOString()}`);
    lines.push(`errors: ${errors.length}`);
    lines.push(`warnings: ${warnings.length}`);
    lines.push(`infos: ${infos.length}`);
    lines.push('---');
    lines.push('');

    // ── Title ─────────────────────────────────────────────────────────────
    lines.push(`# Firestore Schema — \`${schema.name}\``);
    lines.push('');
    lines.push(`**Docs sampled:** ${schema.sampledDocuments}  `);
    lines.push('**Source:** Inferred from samples (schemaless DB). Presence < 100% = optional field.  ');
    lines.push(`**Generated:** ${scannedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push('');

    // ── Issue summary callout (if any) ────────────────────────────────────
    if (collectionIssues.length > 0) {
        const worstLevel = errors.length > 0 ? 'danger' : warnings.length > 0 ? 'warning' : 'info';
        lines.push(`> [!${worstLevel}] ${collectionIssues.length} issue(s) found`);
        lines.push(`> ${errors.length} error(s) · ${warnings.length} warning(s) · ${infos.length} info(s)`);
        lines.push('');
    } else {
        lines.push('> [!success] No issues found');
        lines.push('> This collection passed all LintBase analyzers. ✅');
        lines.push('');
    }

    // ── Fields table ──────────────────────────────────────────────────────
    lines.push('## Fields');
    lines.push('');
    lines.push('| Field | Type | Presence | Stable | Notes |');
    lines.push('|---|---|---|---|---|');

    for (const field of schema.fields) {
        const pct = `${Math.round(field.presenceRate * 100)}%`;
        const icon = fieldStabilityIcon(field.stable, field.presenceRate);
        const typeStr = formatTypes(field.types);
        const link = maybeWikilink(field.name, knownCollections);
        const note = field.note ? field.note : '';
        lines.push(`| \`${field.name}\`${link} | ${typeStr} | ${pct} | ${icon} | ${note} |`);
    }
    lines.push('');

    // ── Observations prose ────────────────────────────────────────────────
    const sparseFields = schema.fields.filter(f => f.presenceRate < 0.6);
    const optionalFields = schema.fields.filter(f => f.presenceRate >= 0.6 && f.presenceRate < 0.8);
    const mixedFields = schema.fields.filter(f => f.types.length > 1);

    if (sparseFields.length > 0 || optionalFields.length > 0 || mixedFields.length > 0) {
        lines.push('## Observations');
        lines.push('');
        for (const f of sparseFields) {
            lines.push(`- \`${f.name}\` is **sparse** — only present in ${Math.round(f.presenceRate * 100)}% of sampled documents. Consider making this explicit or cleaning stale docs.`);
        }
        for (const f of optionalFields) {
            lines.push(`- \`${f.name}\` is **optional** (${Math.round(f.presenceRate * 100)}% presence). Mark as optional in your type definitions.`);
        }
        for (const f of mixedFields) {
            lines.push(`- \`${f.name}\` has **mixed types**: ${f.types.join(', ')}. This will cause runtime type errors.`);
        }
        lines.push('');
    }

    // ── Issues (grouped by severity) ─────────────────────────────────────
    if (collectionIssues.length > 0) {
        lines.push('## Issues');
        lines.push('');

        for (const issue of [...errors, ...warnings, ...infos]) {
            const ct = calloutType(issue.severity);
            lines.push(`> [!${ct}] \`${issue.rule}\``);
            lines.push(`> ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`> `);
                lines.push(`> 💡 ${issue.suggestion}`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

// ── Index / README ───────────────────────────────────────────────────────────

function renderIndexFile(
    report: LintBaseReport,
    outDir: string,
): string {
    const lines: string[] = [];

    lines.push('---');
    lines.push('tool: lintbase');
    lines.push('type: index');
    lines.push(`generatedAt: ${report.scannedAt.toISOString()}`);
    lines.push(`riskScore: ${report.summary.riskScore}`);
    lines.push(`totalCollections: ${report.summary.totalCollections}`);
    lines.push(`errors: ${report.summary.errors}`);
    lines.push(`warnings: ${report.summary.warnings}`);
    lines.push('---');
    lines.push('');
    lines.push('# LintBase — Database Schema Index');
    lines.push('');

    const riskLevel =
        report.summary.riskScore >= 75 ? '🔴 CRITICAL' :
            report.summary.riskScore >= 50 ? '🟠 HIGH' :
                report.summary.riskScore >= 25 ? '🟡 MEDIUM' : '🟢 LOW';

    lines.push(`**Risk Score:** ${report.summary.riskScore}/100 ${riskLevel}  `);
    lines.push(`**Collections:** ${report.summary.totalCollections}  `);
    lines.push(`**Issues:** ${report.summary.errors} errors · ${report.summary.warnings} warnings · ${report.summary.infos} infos  `);
    lines.push(`**Generated:** ${report.scannedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push('');

    // Health callout
    if (report.summary.errors > 0) {
        lines.push('> [!danger] Errors require immediate attention');
        lines.push(`> ${report.summary.errors} error(s) found across your database. See per-collection files below.`);
    } else if (report.summary.warnings > 0) {
        lines.push('> [!warning] Warnings detected');
        lines.push(`> ${report.summary.warnings} warning(s) found. Review per-collection files for details.`);
    } else {
        lines.push('> [!success] Database is clean');
        lines.push('> No errors or warnings found in this scan. ✅');
    }
    lines.push('');

    // ── Collections table ─────────────────────────────────────────────────
    lines.push('## Collections');
    lines.push('');
    lines.push('| Collection | Docs Sampled | Errors | Warnings | Infos | Schema File |');
    lines.push('|---|---|---|---|---|---|');

    for (const col of report.schema ?? []) {
        const colIssues = report.issues.filter(i => i.collection === col.name);
        const e = colIssues.filter(i => i.severity === 'error').length;
        const w = colIssues.filter(i => i.severity === 'warning').length;
        const inf = colIssues.filter(i => i.severity === 'info').length;
        const filename = `${toFilename(col.name)}.md`;
        const icon = e > 0 ? '🔴' : w > 0 ? '🟠' : '🟢';
        lines.push(`| ${icon} [[${col.name}]] | ${col.sampledDocuments} | ${e || '—'} | ${w || '—'} | ${inf || '—'} | [[${toFilename(col.name)}\\|view]] |`);
    }
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('*Generated by [LintBase](https://lintbase.com) · CLI: `npx lintbase scan firestore --key ./sa.json`*');
    lines.push('');

    return lines.join('\n');
}

// ── Main export function ─────────────────────────────────────────────────────

export function writeMarkdownReport(report: LintBaseReport, outDir: string): string[] {
    const absOut = resolve(outDir);

    if (!existsSync(absOut)) {
        mkdirSync(absOut, { recursive: true });
    }

    const written: string[] = [];

    // Build the set of known collection names for wikilink resolution
    const knownCollections = new Set((report.schema ?? []).map(s => s.name.toLowerCase()));

    // One file per collection
    for (const col of report.schema ?? []) {
        const content = renderCollectionFile(col, report.issues, knownCollections, report.scannedAt);
        const filename = `${toFilename(col.name)}.md`;
        const filepath = join(absOut, filename);
        writeFileSync(filepath, content, 'utf-8');
        written.push(filepath);
    }

    // Index / README
    const indexContent = renderIndexFile(report, absOut);
    const indexPath = join(absOut, 'README.md');
    writeFileSync(indexPath, indexContent, 'utf-8');
    written.push(indexPath);

    return written;
}
