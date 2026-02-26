import styles from './page.module.css';

export default function LandingPage() {
  return (
    <>
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <div className={styles.navDot} />
          Lint<span>Base</span>
        </div>
        <ul className={styles.navLinks}>
          <li><a href="#features">Features</a></li>
          <li><a href="#how-it-works">How it works</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="https://github.com/lintbase/lintbase" target="_blank" rel="noreferrer">GitHub</a></li>
          <li><a href="https://x.com/DiaNClabs" target="_blank" rel="noreferrer">𝕏</a></li>
        </ul>
        <div className={styles.navCta}>
          <a href="/sign-in" className={styles.btnGhost}>Sign in</a>
          <a href="/sign-up" className={styles.btnPrimary}>Get Pro →</a>
        </div>
      </nav>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className="container">
            <div className={styles.badge}>
              ✦ Open-source · Zero config · Beautiful output
            </div>

            <h1 className={styles.heroTitle}>
              ESLint for<br />
              <em>your database.</em>
            </h1>

            <p className={styles.heroSub}>
              Catch schema drift, performance issues, security vulnerabilities, and cost leaks
              in your NoSQL database — before they become expensive problems.
            </p>

            <div className={styles.heroActions}>
              <a
                href="https://www.npmjs.com/package/lintbase"
                className={`${styles.btnLg} ${styles.btnBrand}`}
              >
                Install CLI →
              </a>
              <a
                href="/dashboard"
                className={`${styles.btnLg} ${styles.btnOutline}`}
              >
                View Dashboard
              </a>
            </div>

            {/* Terminal demo */}
            <div className={styles.terminal}>
              <div className={styles.termBar}>
                <div className={`${styles.termDot} ${styles.termDotRed}`} />
                <div className={`${styles.termDot} ${styles.termDotYellow}`} />
                <div className={`${styles.termDot} ${styles.termDotGreen}`} />
                <span className={styles.termTitle}>zsh — lintbase</span>
              </div>
              <div className={styles.termBody}>
                <span className={styles.termRow}>
                  <span className={styles.termPrompt}>$ </span>
                  <span>npx lintbase scan firestore --key ./service-account.json</span>
                </span>
                <span className={styles.termRow}>&nbsp;</span>
                <span className={styles.termRow}>
                  <span className={styles.termOk}>✔</span>
                  <span> Connected to Firestore · key: ./service-account.json</span>
                </span>
                <span className={styles.termRow}>
                  <span className={styles.termOk}>✔</span>
                  <span> Discovered </span>
                  <span className={styles.termBrand}>23 collection(s)</span>
                  <span className={styles.termDim}> · limit per collection: 100</span>
                </span>
                <span className={styles.termRow}>
                  <span className={styles.termOk}>✔</span>
                  <span> Sampled </span>
                  <span className={styles.termBrand}>377 document(s)</span>
                </span>
                <span className={styles.termRow}>
                  <span className={styles.termOk}>✔</span>
                  <span> Analysis complete </span>
                  <span className={styles.termDim}>· 50 issue(s) found across 4 analyzers</span>
                </span>
                <span className={styles.termRow}>&nbsp;</span>
                <span className={styles.termRow}>
                  <span>  Risk Score  </span>
                  <span style={{ color: '#EF4444' }}>████████████████████</span>
                  <span>  </span>
                  <span style={{ color: '#EF4444', fontWeight: 700 }}>100/100  CRITICAL</span>
                </span>
                <span className={styles.termRow}>&nbsp;</span>
                <span className={styles.termRow}>
                  <span style={{ color: '#EF4444', fontWeight: 700 }}>  ✖  15 errors</span>
                  <span>   </span>
                  <span style={{ color: '#F59E0B', fontWeight: 700 }}>⚠  32 warnings</span>
                  <span>   </span>
                  <span style={{ color: '#06B6D4', fontWeight: 700 }}>ℹ  3 infos</span>
                </span>
                <span className={styles.termRow}>&nbsp;</span>
                <span className={styles.termRow}>
                  <span className={styles.termErr}>  ✖  </span>
                  <span style={{ fontWeight: 700 }}>bankinfo&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  <span className={styles.termDim}>›  </span>
                  <span className={styles.termRule}>security/sensitive-collection</span>
                </span>
                <span className={styles.termRow}>
                  <span className={styles.termErr}>  ✖  </span>
                  <span style={{ fontWeight: 700 }}>pendingrewal&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  <span className={styles.termDim}>›  </span>
                  <span className={styles.termRule}>perf/excessive-nesting</span>
                </span>
                <span className={styles.termRow}>
                  <span className={styles.termWarn}>  ⚠  </span>
                  <span style={{ fontWeight: 700 }}>Membres&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  <span className={styles.termDim}>›  </span>
                  <span className={styles.termRule}>schema/high-field-variance</span>
                </span>
                <span className={styles.termRow}>
                  <span className={styles.termDim}>  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;lintbase.com  ·  Upgrade to Pro for historical tracking & Slack alerts</span>
                </span>
                <span className={styles.termRow}>&nbsp;</span>
                <span className={styles.termRow}>
                  <span className={styles.termPrompt}>$ </span>
                  <span className={styles.blinkCursor} />
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="container">
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statNumber}>16</span>
              <span className={styles.statLabel}>Lint rules across 4 analyzers</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>0ms</span>
              <span className={styles.statLabel}>Config required</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>100%</span>
              <span className={styles.statLabel}>TypeScript, strict mode</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>Free</span>
              <span className={styles.statLabel}>CLI, forever open-source</span>
            </div>
          </div>
        </div>

        {/* ── Problem section ────────────────────────────────────────────── */}
        <section className={`${styles.section}`} id="features">
          <div className="container">
            <span className={styles.sectionTag}>The Problem</span>
            <h2 className={styles.sectionTitle}>
              Your NoSQL database is<br />accumulating invisible debt.
            </h2>
            <p className={styles.sectionSub}>
              Unlike SQL, NoSQL has no enforced schema. Every fast-moving team leaves behind
              landmines that compound over time.
            </p>

            <div className={styles.problemGrid}>
              {[
                { icon: '🔀', title: 'Schema Drift', desc: 'The same field stores strings in some documents and maps in others. Queries return inconsistent data. Bugs appear in production months later.' },
                { icon: '🐢', title: 'Nesting Hell', desc: 'Deeply nested structures (depth 7+) make composite indexes mandatory and slow down every read — especially on mobile clients.' },
                { icon: '🔓', title: 'Security Blind Spots', desc: 'Collections named "bankinfo" or "consoleLog" sitting in production with open read rules. One misconfigured security rule away from a breach.' },
                { icon: '💸', title: 'Runaway Costs', desc: 'Debug collections like requestGet, requestPost, testPayload accumulating millions of documents. Firestore charges every write — forever.' },
              ].map((p) => (
                <div key={p.title} className={styles.problemCard}>
                  <div className={styles.problemIcon}>{p.icon}</div>
                  <div className={styles.problemTitle}>{p.title}</div>
                  <p className={styles.problemDesc}>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Analyzers ─────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className="container">
            <span className={styles.sectionTag}>The Solution</span>
            <h2 className={styles.sectionTitle}>One command.<br />Four analyzers.</h2>
            <p className={styles.sectionSub}>
              LintBase runs four focused analyzers against your sampled documents and
              surfaces actionable issues — ranked by severity.
            </p>

            <div className={styles.analyzersGrid}>
              {[
                {
                  icon: '🔀',
                  name: 'Schema Drift',
                  color: '#7C3AED',
                  desc: 'Detects field type mismatches, sparse fields, and high field-count variance across documents in the same collection.',
                  rules: ['schema/field-type-mismatch', 'schema/sparse-field', 'schema/high-field-variance', 'schema/empty-collection'],
                },
                {
                  icon: '⚡',
                  name: 'Performance',
                  color: '#F59E0B',
                  desc: 'Catches documents nested beyond Firestore\'s recommended depth, oversized documents, and collections that hit the sampling cap.',
                  rules: ['perf/excessive-nesting', 'perf/document-too-large', 'perf/avg-document-large', 'perf/sampling-limit-reached'],
                },
                {
                  icon: '🔐',
                  name: 'Security',
                  color: '#EF4444',
                  desc: 'Identifies sensitive collection names, debug data left in production, orphaned auth collections, and field names that suggest secrets.',
                  rules: ['security/sensitive-collection', 'security/debug-data-in-production', 'security/field-contains-secret', 'security/stub-auth-collection'],
                },
                {
                  icon: '💰',
                  name: 'Cost',
                  color: '#22C55E',
                  desc: 'Flags logging sinks that accumulate unbounded write costs, redundant collections with duplicate schemas, and oversized average document sizes.',
                  rules: ['cost/logging-sink', 'cost/redundant-collections', 'cost/large-avg-document', 'cost/collection-at-limit'],
                },
              ].map((a) => (
                <div key={a.name} className={styles.analyzerCard}>
                  <div className={styles.analyzerAccent} style={{ background: a.color }} />
                  <div className={styles.analyzerIcon}>{a.icon}</div>
                  <div className={styles.analyzerName}>{a.name}</div>
                  <p className={styles.analyzerDesc}>{a.desc}</p>
                  <ul className={styles.analyzerRules}>
                    {a.rules.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section className={styles.section} id="how-it-works">
          <div className="container">
            <span className={styles.sectionTag}>How it works</span>
            <h2 className={styles.sectionTitle}>Zero config.<br />Three steps.</h2>
            <p className={styles.sectionSub}>
              No YAML files. No agents. No servers. Just a service account key and one command.
            </p>

            <div className={styles.steps}>
              {[
                {
                  num: '1',
                  title: 'Install the CLI',
                  desc: 'Install globally via npm or run with npx — no global install required.',
                  code: 'npm install -g lintbase',
                },
                {
                  num: '2',
                  title: 'Run a scan',
                  desc: 'Point it at your database with a service account key. LintBase stays within your --limit to protect billing.',
                  code: 'lintbase scan firestore --key ./sa.json',
                },
                {
                  num: '3',
                  title: 'Fix your issues',
                  desc: 'Get a color-coded report with severity levels, affected document IDs, and actionable suggestions for every issue.',
                  code: '50 issues · CRITICAL 100/100',
                },
              ].map((s) => (
                <div key={s.num} className={styles.step}>
                  <div className={styles.stepNum}>{s.num}</div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <p className={styles.stepDesc}>{s.desc}</p>
                  <code className={styles.stepCode}>{s.code}</code>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <section className={styles.section} id="pricing">
          <div className="container" style={{ textAlign: 'center' }}>
            <span className={styles.sectionTag}>Pricing</span>
            <h2 className={styles.sectionTitle}>Start free. Upgrade when it matters.</h2>
            <p className={styles.sectionSub} style={{ margin: '0 auto' }}>
              The CLI is free and open-source forever. Pro unlocks the dashboard,
              historical tracking, and automated alerts.
            </p>

            <div className={styles.pricingGrid}>
              {/* Free */}
              <div className={styles.pricingCard}>
                <div className={styles.pricingTier}>CLI — Free</div>
                <div className={styles.pricingAmount}>$0</div>
                <div className={styles.pricingPeriod}>forever, open-source</div>
                <ul className={styles.pricingFeatures}>
                  {[
                    ['✓', 'All 4 analyzers (16 rules)'],
                    ['✓', 'Firestore connector'],
                    ['✓', 'Beautiful terminal output'],
                    ['✓', '--json flag for CI/CD'],
                    ['✓', '--ignore & --collection flags'],
                    ['✓', 'MIT license'],
                  ].map(([check, feature]) => (
                    <li key={feature}>
                      <span className={styles.featureCheck}>{check}</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a href="https://www.npmjs.com/package/lintbase" className={styles.btnFullGhost}>
                  Install CLI →
                </a>
              </div>

              {/* Pro */}
              <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
                <div className={styles.pricingBadge}>MOST POPULAR</div>
                <div className={styles.pricingTier}>Pro — SaaS</div>
                <div className={styles.pricingAmount}><sup>$</sup>39</div>
                <div className={styles.pricingPeriod}>per month · cancel anytime</div>
                <ul className={styles.pricingFeatures}>
                  {[
                    ['✓', 'Everything in CLI'],
                    ['✓', 'Web dashboard'],
                    ['✓', 'Historical scan tracking'],
                    ['✓', 'Risk score trends over time'],
                    ['✓', 'Daily automated scans'],
                    ['✓', 'Slack & email alerts'],
                  ].map(([check, feature]) => (
                    <li key={feature}>
                      <span className={styles.featureCheck}>{check}</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a href="/sign-up" className={styles.btnFullPrimary}>
                  Start 14-day free trial →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className={styles.cta}>
          <div className="container">
            <div className={styles.ctaInner}>
              <div className={styles.ctaGlow} />
              <h2 className={styles.ctaTitle}>Run your first scan in 60 seconds.</h2>
              <p className={styles.ctaSub}>
                No account required. No credit card. Just your service account key.
              </p>
              <div className={styles.ctaTerminal}>
                $ npx lintbase scan firestore --key ./service-account.json
              </div>
              <div className={styles.ctaActions}>
                <a href="https://www.npmjs.com/package/lintbase" className={`${styles.btnLg} ${styles.btnBrand}`}>
                  Get started free →
                </a>
                <a href="/sign-up" className={`${styles.btnLg} ${styles.btnOutline}`}>
                  Try Pro dashboard
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerInner}>
            <div className={styles.footerLogo}>
              Lint<span>Base</span>
            </div>
            <ul className={styles.footerLinks}>
              <li><a href="https://github.com/lintbase/lintbase" target="_blank" rel="noreferrer">GitHub</a></li>
              <li><a href="https://www.npmjs.com/package/lintbase" target="_blank" rel="noreferrer">npm</a></li>
              <li><a href="https://x.com/DiaNClabs" target="_blank" rel="noreferrer">𝕏 @DiaNClabs</a></li>
              <li><a href="/privacy">Privacy</a></li>
              <li><a href="/terms">Terms</a></li>
            </ul>
            <p className={styles.footerCopy}>© 2026 LintBase. Built by Mamadou Dia.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
