// src/reporters/terminal.reporter.ts
import chalk from 'chalk';
import Table from 'cli-table3';
import { LintBaseScanResult, LintBaseReport, LintBaseIssue } from '../types/index.js';

// ── Brand palette ──────────────────────────────────────────────────────────
const BRAND = chalk.hex('#7C3AED').bold;
const DIM = chalk.dim;
const BOLD = chalk.bold;

// Severity colours
const S_ERROR = chalk.red.bold;
const S_WARN = chalk.yellow.bold;
const S_INFO = chalk.cyan.bold;
const S_SUCCESS = chalk.green;

// ── Banner ─────────────────────────────────────────────────────────────────
export function printBanner(): void {
    console.log('');
    console.log(BRAND('  ██╗     ██╗███╗   ██╗████████╗██████╗  █████╗ ███████╗███████╗'));
    console.log(BRAND('  ██║     ██║████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝'));
    console.log(BRAND('  ██║     ██║██╔██╗ ██║   ██║   ██████╔╝███████║███████╗█████╗  '));
    console.log(BRAND('  ██║     ██║██║╚██╗██║   ██║   ██╔══██╗██╔══██║╚════██║██╔══╝  '));
    console.log(BRAND('  ███████╗██║██║ ╚████║   ██║   ██████╔╝██║  ██║███████║███████╗'));
    console.log(BRAND('  ╚══════╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝'));
    console.log('');
    console.log(DIM('  ESLint for your database  ·  ') + chalk.hex('#7C3AED')('lintbase.com'));
    console.log('');
}

// ── Scan summary table (Phase 1) ───────────────────────────────────────────
export function printScanResults(result: LintBaseScanResult): void {
    const table = new Table({
        head: [
            chalk.hex('#7C3AED').bold(' Collection'),
            chalk.hex('#7C3AED').bold(' Docs sampled'),
            chalk.hex('#7C3AED').bold(' Avg size (bytes)'),
            chalk.hex('#7C3AED').bold(' Max depth'),
        ],
        colWidths: [30, 16, 20, 14],
        style: { head: [], border: ['dim'], 'padding-left': 1, 'padding-right': 1 },
        chars: { mid: '─', 'left-mid': '├', 'mid-mid': '┼', 'right-mid': '┤' },
    });

    const byCollection = new Map<string, { count: number; totalBytes: number; maxDepth: number }>();

    for (const doc of result.documents) {
        const ex = byCollection.get(doc.collection) ?? { count: 0, totalBytes: 0, maxDepth: 0 };
        byCollection.set(doc.collection, {
            count: ex.count + 1,
            totalBytes: ex.totalBytes + doc.sizeBytes,
            maxDepth: Math.max(ex.maxDepth, doc.depth),
        });
    }

    for (const col of result.collections) {
        if (!byCollection.has(col)) byCollection.set(col, { count: 0, totalBytes: 0, maxDepth: 0 });
    }

    for (const [col, stats] of byCollection.entries()) {
        const avgBytes = stats.count > 0 ? Math.round(stats.totalBytes / stats.count) : 0;
        const depthLabel =
            stats.maxDepth >= 5 ? chalk.red(stats.maxDepth)
                : stats.maxDepth >= 3 ? chalk.yellow(stats.maxDepth)
                    : chalk.green(stats.maxDepth);

        table.push([BOLD(col), chalk.white(stats.count.toString()), DIM(avgBytes.toString()), depthLabel]);
    }

    console.log(chalk.hex('#7C3AED').bold('  📊  Collections discovered\n'));
    console.log(table.toString());
    console.log('');

    console.log(
        S_SUCCESS('  ✅  ') + BOLD('Scan complete') + DIM('  ·  ') +
        chalk.white(`${result.collections.length} collections`) + DIM('  ·  ') +
        chalk.white(`${result.documentCount} documents sampled`) + DIM('  ·  ') +
        DIM(result.scannedAt.toLocaleString())
    );
    console.log('');
}

// ── Issue list (Phase 2) ───────────────────────────────────────────────────

function severityIcon(s: LintBaseIssue['severity']): string {
    if (s === 'error') return chalk.red('✖');
    if (s === 'warning') return chalk.yellow('⚠');
    return chalk.cyan('ℹ');
}

// (severityLabel reserved for future table use)

function riskColor(score: number): (text: string) => string {
    if (score >= 75) return (t) => chalk.red.bold(t);
    if (score >= 50) return (t) => chalk.hex('#FF8C00').bold(t);
    if (score >= 25) return (t) => chalk.yellow.bold(t);
    return (t) => chalk.green.bold(t);
}

function riskLabel(score: number): string {
    if (score >= 75) return chalk.red.bold('CRITICAL');
    if (score >= 50) return chalk.hex('#FF8C00').bold('HIGH');
    if (score >= 25) return chalk.yellow.bold('MEDIUM');
    return chalk.green.bold('LOW');
}

function renderRiskBar(score: number): string {
    const filled = Math.round(score / 5);   // 20 blocks total
    const empty = 20 - filled;
    const color = riskColor(score);
    return color('█'.repeat(filled)) + DIM('░'.repeat(empty));
}

export function printIssues(report: LintBaseReport): void {
    const { summary, issues } = report;
    const hasIssues = issues.length > 0;

    // ── Header bar ─────────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.hex('#7C3AED').bold('  🔍  Analysis Results'));
    console.log('');

    // ── Risk Score ─────────────────────────────────────────────────────────
    const score = summary.riskScore;
    console.log(
        `  Risk Score  ${renderRiskBar(score)}  ` +
        riskColor(score)(`${score}/100`) + '  ' + riskLabel(score)
    );
    console.log('');

    // ── Counts banner ──────────────────────────────────────────────────────
    console.log(
        '  ' +
        (summary.errors > 0 ? chalk.red.bold(`✖  ${summary.errors} error${summary.errors !== 1 ? 's' : ''}`) : DIM('✖  0 errors')) +
        '   ' +
        (summary.warnings > 0 ? chalk.yellow.bold(`⚠  ${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}`) : DIM('⚠  0 warnings')) +
        '   ' +
        (summary.infos > 0 ? chalk.cyan.bold(`ℹ  ${summary.infos} info${summary.infos !== 1 ? 's' : ''}`) : DIM('ℹ  0 infos'))
    );
    console.log('');

    if (!hasIssues) {
        console.log(chalk.green.bold('  ✨  No issues found. Your database looks great!'));
        console.log('');
        return;
    }

    // ── Render issues grouped by severity ─────────────────────────────────
    const ORDER: LintBaseIssue['severity'][] = ['error', 'warning', 'info'];
    const SECTION_LABELS: Record<LintBaseIssue['severity'], string> = {
        error: chalk.red.bold('  ERRORS'),
        warning: chalk.yellow.bold('  WARNINGS'),
        info: chalk.cyan.bold('  INFOS'),
    };

    for (const severity of ORDER) {
        const group = issues.filter((i) => i.severity === severity);
        if (group.length === 0) continue;

        console.log(SECTION_LABELS[severity]);
        console.log(DIM('  ' + '─'.repeat(68)));
        console.log('');

        for (const issue of group) {
            // First line: icon + collection + rule
            console.log(
                `  ${severityIcon(issue.severity)}  ` +
                BOLD(issue.collection.padEnd(24)) +
                DIM('›') + '  ' +
                chalk.hex('#A78BFA')(issue.rule)
            );

            // Message
            console.log(`     ${chalk.white(issue.message)}`);

            // Affected documents (up to 3)
            if (issue.affectedDocuments && issue.affectedDocuments.length > 0) {
                const docs = issue.affectedDocuments.slice(0, 3);
                const more = (issue.affectedDocuments.length > 3)
                    ? ` + ${issue.affectedDocuments.length - 3} more`
                    : '';
                console.log(`     ${DIM('Affected: ')}${DIM(docs.map((d) => `"${d}"`).join(', '))}${DIM(more)}`);
            }

            // Suggestion
            if (issue.suggestion) {
                console.log(`     ${chalk.hex('#4ADE80')('→')}  ${DIM(issue.suggestion)}`);
            }

            console.log('');
        }
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    console.log(DIM('  ─'.repeat(35)));
    console.log('');
    console.log(
        '  ' +
        chalk.hex('#7C3AED')('lintbase.com') +
        DIM('  ·  Upgrade to Pro for historical tracking, daily scans & Slack alerts')
    );
    console.log('');
}

// ── Shared error helper ────────────────────────────────────────────────────
export function printError(message: string, hint?: string): void {
    console.error('');
    console.error(chalk.red.bold('  ✖  Error: ') + chalk.red(message));
    if (hint) console.error(chalk.dim(`  ↳  ${hint}`));
    console.error('');
}
