#!/usr/bin/env node
// src/index.ts — LintBase CLI entry point

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

import { FirestoreConnector } from './connectors/firestore.connector.js';
import { MongoDbConnector } from './connectors/mongodb.connector.js';
import * as SchemaDrift from './analyzers/schema-drift.analyzer.js';
import * as Performance from './analyzers/performance.analyzer.js';
import * as Security from './analyzers/security.analyzer.js';
import * as Cost from './analyzers/cost.analyzer.js';
import * as Snapshot from './analyzers/snapshot.analyzer.js';

import {
    printBanner,
    printScanResults,
    printIssues,
    printError,
} from './reporters/terminal.reporter.js';

import { writeMarkdownReport } from './reporters/markdown.reporter.js';
import { writeContextFiles } from './reporters/context.reporter.js';

import { LintBaseDocument, LintBaseIssue, LintBaseReport, LintBaseScanResult, CollectionSchema, FieldSchema } from './types/index.js';

// ── Supported connectors ────────────────────────────────────────────────────
const SUPPORTED_CONNECTORS: Record<string, boolean> = {
    firestore: true,
    mongodb: true,
};

// ── Risk score formula ──────────────────────────────────────────────────────
function computeRiskScore(errors: number, warnings: number, infos: number): number {
    return Math.min(100, errors * 12 + warnings * 4 + infos * 1);
}

// ── Schema derivation ────────────────────────────────────────────────────────
function deriveSchema(documents: LintBaseDocument[], collections: string[]): CollectionSchema[] {
    return collections.map((col) => {
        const docs = documents.filter((d) => d.collection === col);
        const total = docs.length;
        const fieldTypes = new Map<string, Set<string>>();
        const fieldCounts = new Map<string, number>();

        for (const doc of docs) {
            for (const [field, { type }] of Object.entries(doc.fields)) {
                if (!fieldTypes.has(field)) fieldTypes.set(field, new Set());
                fieldTypes.get(field)!.add(type);
                fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
            }
        }

        const fields: FieldSchema[] = [];
        for (const [name, types] of fieldTypes.entries()) {
            const count = fieldCounts.get(name) ?? 0;
            const presenceRate = total > 0 ? count / total : 0;
            const typeList = [...types];
            const stable = presenceRate >= 0.8 && typeList.length === 1;
            let note: string | undefined;
            if (typeList.length > 1) note = `Type mismatch: ${typeList.join(' | ')}`;
            else if (presenceRate < 0.6) note = `Sparse: ${Math.round(presenceRate * 100)}% presence`;
            else if (presenceRate < 0.8) note = `Optional: ${Math.round(presenceRate * 100)}% presence`;
            fields.push({ name, types: typeList, presenceRate, stable, note });
        }

        fields.sort((a, b) => (a.stable !== b.stable ? (a.stable ? -1 : 1) : b.presenceRate - a.presenceRate));
        return { name: col, sampledDocuments: total, fields };
    });
}

// ── CLI option types ────────────────────────────────────────────────────────
interface ScanOptions {
    key?: string;
    uri?: string;
    limit: string;
    json: boolean;
    failOn?: string;
    ignore: string[];      // repeatable: --ignore schema/sparse-field --ignore cost/redundant-collections
    collection: string[];  // repeatable: --collection Users --collection Baux
    save?: string;         // --save https://www.lintbase.com  → POST report to /api/scans
    token?: string;        // --token <api-key>            → Authorization: Bearer header
    format?: string;       // --format md  → write Markdown output
    out?: string;          // --out ./docs/schema  → output directory for --format md
}

// ── Repeatable option collector ─────────────────────────────────────────────
function collect(val: string, prev: string[]): string[] {
    return [...prev, val];
}

// ── Program ─────────────────────────────────────────────────────────────────
const program = new Command();

program
    .name('lintbase')
    .description('ESLint for your database — catch schema drift, security issues, and cost leaks in NoSQL.')
    .version('0.1.0', '-v, --version', 'Show version number');

// ── lintbase scan <database> ────────────────────────────────────────────────
program
    .command('scan <database>')
    .description('Scan a database: discover collections, sample documents, and run all analyzers.')
    .option('--key <path>', 'Path to the Service Account JSON file (required for Firestore)')
    .option('--uri <uri>', 'MongoDB connection string (required for MongoDB)')
    .option('--limit <number>', 'Max documents to sample per collection', '100')
    .option('--json', 'Output the report as JSON (stdout only — great for CI/CD pipes)')
    .option('--ignore <rule>', 'Ignore a specific rule (repeatable)', collect, [] as string[])
    .option('--collection <name>', 'Only scan this collection (repeatable)', collect, [] as string[])
    .option('--save <url>', 'Push scan results to a LintBase dashboard (e.g. --save https://www.lintbase.com)')
    .option('--token <apiKey>', 'API key for --save authentication (from your dashboard settings)')
    .option('--format <fmt>', 'Output format: md  (writes per-collection Markdown files — perfect for Obsidian or AI context)')
    .option('--out <dir>', 'Output directory for --format md', '.lintbase/schema')
    .action(async (database: string, options: ScanOptions) => {
        await performScan(database, options);
    });

// ── lintbase export-context <database> ─────────────────────────────────────
program
    .command('export-context <database>')
    .description('Generate AI contextual ground-truth markdown exported directly from your database.')
    .option('--key <path>', 'Path to the Service Account JSON file (required for Firestore)')
    .option('--uri <uri>', 'MongoDB connection string (required for MongoDB)')
    .option('--limit <number>', 'Max documents to sample per collection', '100')
    .option('--collection <name>', 'Only scan this collection (repeatable)', collect, [] as string[])
    .option('--out <dir>', 'Output directory for context files (default: lintbase-context)')
    .action(async (database: string, options: any) => {
        // Map export-context arguments to an internal scan config
        const scanOpts: ScanOptions = {
            key: options.key,
            uri: options.uri,
            limit: options.limit,
            json: true, // We use JSON mode to suppress standard terminal tables and banners
            ignore: [],
            collection: options.collection,
            format: 'context', // Triggers the context.reporter
            out: options.out ?? 'lintbase-context'
        };

        console.log(chalk.magenta('🚀 Generating UI context via LintBase…\n'));
        const spinner = ora({ text: chalk.dim('Connecting and scanning database schema…'), color: 'magenta' }).start();

        try {
            await performScan(database, scanOpts, true);
            spinner.succeed(chalk.green('Context successfully exported for AI coding tools.'));
            console.log(chalk.dim(`\nDrop the generated files from /${scanOpts.out} into your agent's context interface to align its knowledge with ground truth.`));
        } catch (err: unknown) {
            spinner.fail(chalk.red('Failed to export AI context'));
            printError(err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

// ── lintbase snapshot <database> ───────────────────────────────────────────
program
    .command('snapshot <database>')
    .description('Generate a schema snapshot (.lintbase/schema.json) for CI drift comparison.')
    .option('--key <path>', 'Path to the Service Account JSON file (required for Firestore)')
    .option('--uri <uri>', 'MongoDB connection string (required for MongoDB)')
    .option('--limit <number>', 'Max documents to sample per collection', '100')
    .option('--collection <name>', 'Only scan this collection (repeatable)', collect, [] as string[])
    .action(async (database: string, options: any) => {
        const scanOpts: ScanOptions = {
            key: options.key,
            uri: options.uri,
            limit: options.limit,
            json: true,
            ignore: [],
            collection: options.collection,
        };

        console.log(chalk.blue('📸 Generating LintBase schema snapshot…\n'));
        const spinner = ora({ text: chalk.dim('Scanning live database schema…'), color: 'blue' }).start();

        try {
            process.env.LINTBASE_SNAPSHOT_MODE = 'true'; // Used to trigger save inside performScan
            await performScan(database, scanOpts, true);
            spinner.succeed(chalk.green('Schema snapshot saved to .lintbase/schema.json'));
            console.log(chalk.dim(`\nCommit this file to version control. Future "lintbase check" commands will compare against it.`));
        } catch (err: unknown) {
            spinner.fail(chalk.red('Failed to generate snapshot'));
            printError(err instanceof Error ? err.message : String(err));
            process.exit(1);
        } finally {
            delete process.env.LINTBASE_SNAPSHOT_MODE; // Clean up env var
        }
    });

// ── lintbase check <database> ──────────────────────────────────────────────
program
    .command('check <database>')
    .description('Run LintBase in CI mode. Fails the build if any schema, security, or performance errors are found.')
    .option('--key <path>', 'Path to the Service Account JSON file (required for Firestore)')
    .option('--uri <uri>', 'MongoDB connection string (required for MongoDB)')
    .option('--limit <number>', 'Max documents to sample per collection', '100')
    .option('--fail-on <severity>', 'Fail pipeline only on specific severity level (error, warning, info)', 'error')
    .option('--ignore <rule>', 'Ignore a specific rule (repeatable)', collect, [] as string[])
    .option('--collection <name>', 'Only scan this collection (repeatable)', collect, [] as string[])
    .action(async (database: string, options: ScanOptions) => {
        // Force non-JSON mode for checking so it outputs the standard readable table to CI logs
        options.json = false;

        console.log(chalk.bold.blue('🛡️ LintBase CI Pipeline Check\n'));
        try {
            const report = await performScan(database, options, false);

            const failOnSeverity = options.failOn?.toLowerCase();
            let shouldFail = false;

            if (failOnSeverity === 'error' && report.summary.errors > 0) {
                shouldFail = true;
            } else if (failOnSeverity === 'warning' && (report.summary.errors > 0 || report.summary.warnings > 0)) {
                shouldFail = true;
            } else if (failOnSeverity === 'info' && (report.summary.errors > 0 || report.summary.warnings > 0 || report.summary.infos > 0)) {
                shouldFail = true;
            }

            if (shouldFail) {
                console.log(chalk.red(`\n❌ LintBase checks failed with ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} infos.`));
                process.exit(1);
            } else {
                console.log(chalk.green('\n✅ LintBase checks passed. Database is healthy.'));
                process.exit(0);
            }
        } catch (err: unknown) {
            printError(err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

async function performScan(database: string, options: ScanOptions, quietJSON: boolean = false): Promise<LintBaseReport> {
    const jsonMode = options.json;

    // ── Banner (skip in JSON mode) ─────────────────────────────────────────
    if (!jsonMode) printBanner();

    // ── Validate connector ─────────────────────────────────────────────────
    if (!SUPPORTED_CONNECTORS[database.toLowerCase()]) {
        printError(
            `"${database}" is not a supported database.`,
            `Supported connectors: ${Object.keys(SUPPORTED_CONNECTORS).join(', ')}`
        );
        process.exit(1);
    }

    const limit = parseInt(options.limit, 10);
    if (isNaN(limit) || limit < 1) {
        printError(
            `Invalid --limit value: "${options.limit}"`,
            'Must be a positive integer (e.g. --limit 50)'
        );
        process.exit(1);
    }

    const ignoredRules = new Set(options.ignore);
    if (ignoredRules.size > 0 && !jsonMode) {
        console.log(chalk.dim(`  ⚙  Ignoring rules: ${[...ignoredRules].join(', ')}\n`));
    }

    const collectionFilter = options.collection; // [] means "all"
    if (collectionFilter.length > 0 && !jsonMode) {
        console.log(chalk.dim(`  🔎  Scanning only: ${collectionFilter.join(', ')}\n`));
    }

    // ── Connector Initialization ────────────────────────────────────────────
    let connector: FirestoreConnector | MongoDbConnector;
    let authDisplay: string;

    if (database.toLowerCase() === 'firestore') {
        if (!options.key) {
            printError(
                'A service account key is required for Firestore.',
                'Usage: lintbase scan firestore --key ./service-account.json'
            );
            process.exit(1);
        }
        connector = new FirestoreConnector(options.key);
        authDisplay = `key: ${options.key}`;
    } else if (database.toLowerCase() === 'mongodb') {
        if (!options.uri && !process.env.MONGODB_URI) {
            printError(
                'A MongoDB connection string is required.',
                'Usage: lintbase scan mongodb --uri mongodb://localhost:27017'
            );
            process.exit(1);
        }
        const uri = options.uri || process.env.MONGODB_URI!;
        connector = new MongoDbConnector(uri);

        // Mask password in the URI for display
        try {
            const parsedUri = new URL(uri);
            if (parsedUri.password) parsedUri.password = '****';
            authDisplay = `uri: ${parsedUri.toString()}`;
        } catch {
            authDisplay = 'uri: [MASKED]';
        }
    } else {
        process.exit(1); // Already caught by validation above
    }

    // Step 1 — connect
    const connectSpinner = ora({ text: chalk.dim(`Connecting to ${database}…`), color: 'magenta' }).start();
    try {
        await connector.connect();
        connectSpinner.succeed(
            chalk.green(`Connected to ${database}`) + chalk.dim(` · ${authDisplay}`)
        );
    } catch (err) {
        connectSpinner.fail(chalk.red(`Failed to connect to ${database}`));
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }

    // Step 2 — discover collections + apply --collection filter
    const discoverSpinner = ora({ text: chalk.dim('Discovering collections…'), color: 'magenta' }).start();
    let collections: string[];
    try {
        const allCollections = await connector.getCollections();

        if (collectionFilter.length > 0) {
            const filterSet = new Set(collectionFilter);
            collections = allCollections.filter((c) => filterSet.has(c));

            if (collections.length === 0) {
                discoverSpinner.fail(chalk.red('No matching collections found'));
                printError(
                    `None of the specified collections [${collectionFilter.join(', ')}] exist in this database.`,
                    `Available collections: ${allCollections.join(', ')}`
                );
                process.exit(1);
            }
        } else {
            collections = allCollections;
        }

        discoverSpinner.succeed(
            chalk.green(`Discovered ${collections.length} collection(s)`) +
            chalk.dim(` · limit per collection: ${limit}`)
        );
    } catch (err) {
        discoverSpinner.fail(chalk.red('Failed to list collections'));
        printError(
            err instanceof Error ? err.message : String(err),
            'Make sure the service account has the Cloud Datastore User role.'
        );
        process.exit(1);
    }

    // Step 3 — sample documents from each collection
    // We orchestrate manually here (instead of connector.scan()) so that:
    //   a) we avoid a second connect() + getCollections() call
    //   b) we can apply the --collection filter before sampling
    const sampleSpinner = ora({ text: chalk.dim(`Sampling up to ${limit} docs per collection…`), color: 'magenta' }).start();
    let scanResult: LintBaseScanResult;
    try {
        const allDocuments: LintBaseDocument[] = [];
        for (const col of collections) {
            const docs = await connector.sampleDocuments(col, limit);
            allDocuments.push(...docs);
        }
        scanResult = {
            connector: 'firestore',
            collections,
            documentCount: allDocuments.length,
            documents: allDocuments,
            scannedAt: new Date(),
        };
        sampleSpinner.succeed(chalk.green(`Sampled ${scanResult.documentCount} document(s)`));
    } catch (err) {
        sampleSpinner.fail(chalk.red('Failed to sample documents'));
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }

    // Optional cleanup
    if ('close' in connector && typeof connector.close === 'function') {
        await connector.close();
    }

    // Print scan table (skip in JSON mode)
    if (!jsonMode) {
        console.log('');
        printScanResults(scanResult);
    }

    // Step 4 — run all analyzers in parallel
    const analyzeSpinner = ora({ text: chalk.dim('Running analyzers…'), color: 'magenta' }).start();
    let rawIssues: LintBaseIssue[];
    try {
        const analysisOptions = { limit };
        const [schemaDriftIssues, perfIssues, securityIssues, costIssues] = await Promise.all([
            Promise.resolve(SchemaDrift.analyze(scanResult, analysisOptions)),
            Promise.resolve(Performance.analyze(scanResult, analysisOptions)),
            Promise.resolve(Security.analyze(scanResult, analysisOptions)),
            Promise.resolve(Cost.analyze(scanResult, analysisOptions)),
        ]);
        rawIssues = [...schemaDriftIssues, ...perfIssues, ...securityIssues, ...costIssues];
        analyzeSpinner.succeed(
            chalk.green('Analysis complete') +
            chalk.dim(` · ${rawIssues.length} issue(s) found across 4 analyzers`)
        );
    } catch (err) {
        analyzeSpinner.fail(chalk.red('Analyzer error'));
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }

    // Step 5 — apply --ignore filter
    const issues = ignoredRules.size > 0
        ? rawIssues.filter((i) => !ignoredRules.has(i.rule))
        : rawIssues;

    if (ignoredRules.size > 0) {
        const suppressed = rawIssues.length - issues.length;
        if (!jsonMode && suppressed > 0) {
            console.log(chalk.dim(`\n  ⚙  ${suppressed} issue(s) suppressed by --ignore filters.\n`));
        }
    }

    const derivedSchema = deriveSchema(scanResult.documents, scanResult.collections);

    // Schema Snapshot drift analysis
    let snapshotIssues: LintBaseIssue[] = [];
    if (process.env.LINTBASE_SNAPSHOT_MODE === 'true') {
        Snapshot.saveSnapshot(derivedSchema);
    } else {
        snapshotIssues = Snapshot.compareAgainstSnapshot(derivedSchema);
    }

    // Merge snapshot issues into the main issues array before building the report
    issues.push(...snapshotIssues);

    // Step 6 — build report + output
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const infos = issues.filter((i) => i.severity === 'info').length;

    const report: LintBaseReport = {
        summary: {
            totalCollections: scanResult.collections.length,
            totalDocuments: scanResult.documentCount,
            errors,
            warnings,
            infos,
            riskScore: computeRiskScore(errors, warnings, infos),
        },
        issues,
        scannedAt: scanResult.scannedAt,
        schema: derivedSchema,
        connector: scanResult.connector,
    };

    if (jsonMode && !quietJSON) {
        // Clean JSON to stdout — pipeable to jq, CI systems, dashboards
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else if (!jsonMode) {
        printIssues(report);
    }

    // ── Markdown export (--format md) ──────────────────────────────────
    if (options.format?.toLowerCase() === 'md') {
        const outDir = options.out ?? '.lintbase/schema';
        try {
            const written = writeMarkdownReport(report, outDir);
            if (!jsonMode) {
                console.log(
                    '\n' +
                    chalk.green(`  ✔  Markdown schema written`) +
                    chalk.dim(` · ${written.length} file(s) → ${outDir}`)
                );
                console.log(chalk.dim('     Open in Obsidian or drop into your repo as a "database wiki".'));
            }
        } catch (err) {
            console.error(chalk.red(`  ✖  Failed to write Markdown: ${err instanceof Error ? err.message : String(err)}`));
        }
    } else if (options.format?.toLowerCase() === 'context') {
        // ── AI Context Export (--format context) ──────────────────────────
        const outDir = options.out ?? 'lintbase-context';
        try {
            const written = writeContextFiles(report, outDir);
            if (!jsonMode) {
                console.log(
                    '\n' +
                    chalk.green(`  ✔  AI Context written`) +
                    chalk.dim(` · ${written.length} file(s) → ${outDir}`)
                );
            }
        } catch (err) {
            throw new Error(`Failed to write AI context files: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // Step 7 — push to dashboard with --save
    if (options.save) {
        const saveUrl = options.save.replace(/\/+$/, '') + '/api/scans';
        const saveSpinner = ora({ text: chalk.dim(`Pushing report to ${saveUrl}…`), color: 'magenta' }).start();
        try {
            if (!options.token) {
                saveSpinner.warn(chalk.yellow('--save requires --token <api-key>. Find your key in the LintBase dashboard.'));
            } else {
                const res = await fetch(saveUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${options.token}`,
                    },
                    body: JSON.stringify(report),
                });
                if (res.ok) {
                    try {
                        const data = await res.json() as { scanId?: string };
                        saveSpinner.succeed(
                            chalk.green('Report saved to dashboard') +
                            chalk.dim(` · scanId: ${data.scanId ?? 'unknown'}`)
                        );
                    } catch {
                        saveSpinner.succeed(chalk.green(`Report saved (HTTP ${res.status})`));
                    }
                } else {
                    // Read raw text first so a non-JSON error page doesn't crash us
                    const rawText = await res.text();
                    let errorMsg: string;
                    try {
                        const data = JSON.parse(rawText) as { error?: string };
                        errorMsg = data.error ?? `HTTP ${res.status}`;
                    } catch {
                        // Server returned HTML (e.g. Vercel 500 page) — show status + snippet
                        errorMsg = `HTTP ${res.status} — ${rawText.slice(0, 120).replace(/\s+/g, ' ')}`;
                    }
                    saveSpinner.fail(chalk.red(`Dashboard rejected the report: ${errorMsg}`));
                }
            }
        } catch (err) {
            // --save failures NEVER block the CLI exit code
            saveSpinner.fail(chalk.red(`Could not reach ${saveUrl}: ${err instanceof Error ? err.message : String(err)}`));
        }
    }

    // Exit with code 1 if issues found matching the fail threshold
    if (!quietJSON) {
        const failThreshold = options.failOn || 'error';
        let shouldFail = false;
        if (failThreshold === 'info') {
            shouldFail = (errors > 0 || warnings > 0 || infos > 0);
        } else if (failThreshold === 'warning') {
            shouldFail = (errors > 0 || warnings > 0);
        } else {
            shouldFail = errors > 0;
        }

        if (shouldFail) {
            process.exit(1);
        }
    }

    return report;
}

// ── Parse ────────────────────────────────────────────────────────────────────
program.parseAsync(process.argv).catch((err: unknown) => {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
