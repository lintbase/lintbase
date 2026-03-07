// src/reporters/context.reporter.ts
// Exports scan results as structured context files specifically optimized for AI coding agents
// (Cursor, Claude Code, Copilot Workspace, etc.)

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { LintBaseReport, CollectionSchema, LintBaseIssue } from '../types/index.js';

function formatTypes(types: string[]): string {
    return types.length === 1 ? types[0] : `union(${types.join(' | ')})`;
}

// 1. database-schema.md
function generateDatabaseSchema(schema: CollectionSchema[]): string {
    const lines = [
        '# Database Schema Overview',
        '',
        'This document provides a high-level overview of the NoSQL collections and their relationships.',
        '',
    ];

    if (!schema || schema.length === 0) {
        lines.push('No collections found.');
        return lines.join('\n');
    }

    lines.push('## Core Collections');
    lines.push('');
    for (const col of schema) {
        lines.push(`### \`${col.name}\``);
        lines.push(`- **Sampled Documents:** ${col.sampledDocuments}`);
        lines.push(`- **Field Count:** ${col.fields.length}`);
        lines.push('');
    }

    lines.push('## AI Core Context');
    lines.push('> When querying this database, ALWAYS respect the exact schema names and field types defined here. Do not hallucinate collections or use outdated field names.');
    lines.push('');

    return lines.join('\n');
}

// 2. collections.md
function generateCollections(schema: CollectionSchema[]): string {
    const lines = [
        '# Collections Detailed Schema',
        '',
        'This document defines the exact ground-truth fields for every collection in the database.',
        '',
    ];

    if (!schema || schema.length === 0) {
        lines.push('No collections found.');
        return lines.join('\n');
    }

    for (const col of schema) {
        lines.push(`## ${col.name}`);
        for (const field of col.fields) {
            const optionalStr = field.presenceRate < 1 ? ` (optional, ${Math.round(field.presenceRate * 100)}% presence)` : '';
            const notesStr = field.note ? ` - Note: ${field.note}` : '';
            lines.push(`- \`${field.name}\` (${formatTypes(field.types)})${optionalStr}${notesStr}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// 3. risk-report.md
function generateRiskReport(report: LintBaseReport): string {
    const lines = [
        '# Database Risk & Issues Report',
        '',
        '> This report highlights current technical debt, schema drift, and security risks. Agents should avoid perpetuating these issues.',
        '',
        `**Risk Score:** ${report.summary.riskScore}/100`,
        `**Issues:** ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} infos`,
        '',
    ];

    const errors = report.issues.filter(i => i.severity === 'error');
    const warnings = report.issues.filter(i => i.severity === 'warning');
    const infos = report.issues.filter(i => i.severity === 'info');

    if (errors.length > 0) {
        lines.push('## 🔴 Errors');
        for (const issue of errors) {
            lines.push(`- **[${issue.rule}]** ${issue.collection ? `(\`${issue.collection}\`)` : ''} ${issue.message}`);
            if (issue.suggestion) lines.push(`  - *Fix:* ${issue.suggestion}`);
        }
        lines.push('');
    }

    if (warnings.length > 0) {
        lines.push('## 🟠 Warnings');
        for (const issue of warnings) {
            lines.push(`- **[${issue.rule}]** ${issue.collection ? `(\`${issue.collection}\`)` : ''} ${issue.message}`);
            if (issue.suggestion) lines.push(`  - *Fix:* ${issue.suggestion}`);
        }
        lines.push('');
    }

    if (infos.length > 0) {
        lines.push('## 🟢 Infos');
        for (const issue of infos) {
            lines.push(`- **[${issue.rule}]** ${issue.collection ? `(\`${issue.collection}\`)` : ''} ${issue.message}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// 4. security-rules.md
function generateSecurityRules(schema: CollectionSchema[]): string {
    const lines = [
        '# Security Rules Context',
        '',
        'This file defines the basic security boundaries and rules for the database collections.',
        'Agents writing client-side queries must ensure they align with these rules.',
        '',
        '## Known Collections',
    ];

    for (const col of schema) {
        lines.push(`- \`${col.name}\`: Default rules apply unless specifically overridden.`);
    }

    lines.push('');
    lines.push('> Note: This is an auto-generated baseline based on discovered collections. Verify explicit security scopes in the actual `firestore.rules` or equivalent file.');

    return lines.join('\n');
}

// 5. architecture.md
function generateArchitecture(): string {
    return [
        '# Application Architecture Context',
        '',
        '## Database Layer',
        '- **Technology:** NoSQL (Inferred via LintBase)',
        '- **Validation:** LintBase monitors schema drift and field type consistency.',
        '',
        '## Agent Instructions',
        '- Always review `collections.md` before writing any database queries or mutations.',
        '- Do not assume implicit fields exists. Check presence rates.',
        '- For schema changes, consider the current drift levels reported in `risk-report.md`.'
    ].join('\n');
}

export function writeContextFiles(report: LintBaseReport, outDir: string): string[] {
    const absOut = resolve(outDir);

    if (!existsSync(absOut)) {
        mkdirSync(absOut, { recursive: true });
    }

    const files = [
        { name: 'database-schema.md', content: generateDatabaseSchema(report.schema ?? []) },
        { name: 'collections.md', content: generateCollections(report.schema ?? []) },
        { name: 'risk-report.md', content: generateRiskReport(report) },
        { name: 'security-rules.md', content: generateSecurityRules(report.schema ?? []) },
        { name: 'architecture.md', content: generateArchitecture() },
        { name: 'lintbase-context.json', content: JSON.stringify(report, null, 2) }
    ];

    const written: string[] = [];

    for (const file of files) {
        const filepath = join(absOut, file.name);
        writeFileSync(filepath, file.content, 'utf-8');
        written.push(filepath);
    }

    return written;
}
