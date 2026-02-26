'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../../lib/auth';
import styles from './page.module.css';

export default function SettingsPage() {
    const { user, apiKey, plan, signOut } = useAuth();
    const [copied, setCopied] = useState(false);
    const [upgrading, setUpgrading] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

    // Show toast from Stripe redirect (?success=true or ?canceled=true)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            setToast({ type: 'success', msg: '🎉 Welcome to Pro! Your plan has been upgraded.' });
            window.history.replaceState({}, '', '/dashboard/settings');
        } else if (params.get('canceled') === 'true') {
            setToast({ type: 'info', msg: "Upgrade canceled \u2014 you're still on the Free plan." });
            window.history.replaceState({}, '', '/dashboard/settings');
        }
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    function copyKey() {
        if (!apiKey) return;
        navigator.clipboard.writeText(apiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function handleUpgrade() {
        if (!user) return;
        setUpgrading(true);
        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, email: user.email }),
            });
            const data = await res.json() as { url?: string; error?: string };
            if (data.url) {
                window.location.href = data.url;
            } else {
                setToast({ type: 'error', msg: data.error ?? 'Something went wrong. Try again.' });
                setUpgrading(false);
            }
        } catch {
            setToast({ type: 'error', msg: 'Network error. Please try again.' });
            setUpgrading(false);
        }
    }

    return (
        <div className={styles.page}>

            {/* Toast */}
            {toast && (
                <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
                    {toast.msg}
                    <button className={styles.toastClose} onClick={() => setToast(null)}>✕</button>
                </div>
            )}

            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Settings</h1>
                <p className={styles.pageSub}>Manage your account, API access, and preferences</p>
            </div>

            {/* ── Account ── */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Account</h2>
                <div className={styles.card}>
                    <div className={styles.profileRow}>
                        {user?.photoURL
                            ? <img src={user.photoURL} alt="avatar" className={styles.avatar} />
                            : <div className={styles.avatarFallback}>{user?.displayName?.[0] ?? user?.email?.[0] ?? '?'}</div>
                        }
                        <div>
                            <div className={styles.profileName}>{user?.displayName ?? '—'}</div>
                            <div className={styles.profileEmail}>{user?.email}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── API Key ── */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>API Key</h2>
                <p className={styles.sectionDesc}>
                    Use this key with the <code className={styles.inlineCode}>--token</code> flag when running scans.
                    Keep it secret — it grants write access to your dashboard.
                </p>
                <div className={styles.card}>
                    <div className={styles.keyRow}>
                        <code className={styles.keyValue}>
                            {apiKey ?? 'Loading…'}
                        </code>
                        {apiKey && (
                            <button className={styles.copyBtn} onClick={copyKey}>
                                {copied ? '✓ Copied' : 'Copy'}
                            </button>
                        )}
                    </div>
                    <div className={styles.cliExample}>
                        <div className={styles.exampleLabel}>Example usage</div>
                        <code>
                            npx lintbase scan firestore \<br />
                            &nbsp;&nbsp;--key ./serviceAccount.json \<br />
                            &nbsp;&nbsp;--save https://www.lintbase.com \<br />
                            &nbsp;&nbsp;--token {apiKey ?? '<your-token>'}
                        </code>
                    </div>
                </div>
            </section>

            {/* ── Plan ── */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Plan</h2>
                <div className={styles.card}>
                    <div className={styles.planRow}>
                        <div>
                            <div className={styles.planName}>{plan === 'pro' ? 'Pro' : 'Free Tier'}</div>
                            <div className={styles.planDesc}>
                                {plan === 'pro'
                                    ? '90-day history · unlimited scans · exports · alerts'
                                    : '7-day scan history · up to 20 scans/month · manual CLI only'}
                            </div>
                        </div>
                        <span className={styles.planBadge} style={plan === 'pro' ? { color: '#28a745', borderColor: '#c3e6cb', background: '#f0fff4' } : {}}>
                            {plan === 'pro' ? '✓ Active' : 'Current plan'}
                        </span>
                    </div>

                    {plan === 'free' && (
                        <>
                            <div className={styles.planDivider} />
                            <div className={styles.proRow}>
                                <div>
                                    <div className={styles.proName}>Pro — <strong>$39/month</strong></div>
                                    <ul className={styles.proList}>
                                        <li>90-day historical trends</li>
                                        <li>Slack &amp; email alerts</li>
                                        <li>PDF / CSV exports</li>
                                        <li>Unlimited scans</li>
                                    </ul>
                                </div>
                                <button
                                    className={styles.upgradeBtn}
                                    onClick={handleUpgrade}
                                    disabled={upgrading}
                                >
                                    {upgrading ? 'Redirecting…' : 'Upgrade to Pro'}
                                    {!upgrading && <span className={styles.upgradeNote}>$39 / month</span>}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* ── Session ── */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Session</h2>
                <div className={styles.card}>
                    <div className={styles.dangerRow}>
                        <div>
                            <div className={styles.dangerLabel}>Sign out</div>
                            <div className={styles.dangerDesc}>You will be redirected to the login page.</div>
                        </div>
                        <button className={styles.signOutBtn} onClick={signOut}>Sign out</button>
                    </div>
                </div>
            </section>
        </div>
    );
}
