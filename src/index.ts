#!/usr/bin/env node
// src/index.ts — LintBase CLI entry point

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

import { FirestoreConnector } from './connectors/firestore.connector.js';
import * as SchemaDrift from './analyzers/schema-drift.analyzer.js';
import * as Performance from './analyzers/performance.analyzer.js';
import * as Security from './analyzers/security.analyzer.js';
import * as Cost from './analyzers/cost.analyzer.js';

import {
    printBanner,
    printScanResults,
    printIssues,
    printError,
} from './reporters/terminal.reporter.js';

import { LintBaseDocument, LintBaseIssue, LintBaseReport, LintBaseScanResult } from './types/index.js';

// ── Supported connectors ────────────────────────────────────────────────────
const SUPPORTED_CONNECTORS: Record<string, boolean> = {
    firestore: true,
};

// ── Risk score formula ──────────────────────────────────────────────────────
function computeRiskScore(errors: number, warnings: number, infos: number): number {
    return Math.min(100, errors * 12 + warnings * 4 + infos * 1);
}

// ── CLI option types ────────────────────────────────────────────────────────
interface ScanOptions {
    key?: string;
    limit: string;
    json: boolean;
    ignore: string[];      // repeatable: --ignore schema/sparse-field --ignore cost/redundant-collections
    collection: string[];  // repeatable: --collection Users --collection Baux
    save?: string;         // --save https://www.lintbase.com  → POST report to /api/scans
    token?: string;        // --token <api-key>            → Authorization: Bearer header
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
    .option('--limit <number>', 'Max documents to sample per collection', '100')
    .option('--json', 'Output the report as JSON (stdout only — great for CI/CD pipes)')
    .option('--ignore <rule>', 'Ignore a specific rule (repeatable)', collect, [] as string[])
    .option('--collection <name>', 'Only scan this collection (repeatable)', collect, [] as string[])
    .option('--save <url>', 'Push scan results to a LintBase dashboard (e.g. --save https://www.lintbase.com)')
    .option('--token <apiKey>', 'API key for --save authentication (from your dashboard settings)')
    .action(async (database: string, options: ScanOptions) => {
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

        // ── Firestore ──────────────────────────────────────────────────────────
        if (database.toLowerCase() === 'firestore') {
            if (!options.key) {
                printError(
                    'A service account key is required for Firestore.',
                    'Usage: lintbase scan firestore --key ./service-account.json'
                );
                process.exit(1);
            }

            const connector = new FirestoreConnector(options.key);

            // Step 1 — connect
            const connectSpinner = ora({ text: chalk.dim('Connecting to Firestore…'), color: 'magenta' }).start();
            try {
                await connector.connect();
                connectSpinner.succeed(
                    chalk.green('Connected to Firestore') + chalk.dim(` · key: ${options.key}`)
                );
            } catch (err) {
                connectSpinner.fail(chalk.red('Failed to connect to Firestore'));
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
            };

            if (jsonMode) {
                // Clean JSON to stdout — pipeable to jq, CI systems, dashboards
                process.stdout.write(JSON.stringify(report, null, 2) + '\n');
            } else {
                printIssues(report);
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

            // Exit with code 1 if errors found (like a real linter / CI gate)
            if (errors > 0) process.exit(1);
        }
    });

// ── Parse ────────────────────────────────────────────────────────────────────
program.parseAsync(process.argv).catch((err: unknown) => {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
