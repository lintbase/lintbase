'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import styles from './layout.module.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && !user) router.replace('/sign-in');
    }, [user, loading, router]);

    if (loading || !user) {
        return (
            <div className={styles.loadingScreen}>
                <div className={styles.loadingDot} />
                <div className={styles.loadingDot} />
                <div className={styles.loadingDot} />
            </div>
        );
    }

    const navItems = [
        { href: '/dashboard', label: 'Overview', icon: '⊞' },
        { href: '/dashboard/scans', label: 'Scan History', icon: '≡' },
        { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
    ];

    return (
        <div className={styles.shell}>
            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarTop}>
                    <Link href="/" className={styles.sidebarLogo}>
                        <div className={styles.logoDot} />
                        Lint<span>Base</span>
                    </Link>

                    <nav className={styles.nav}>
                        <span className={styles.navLabel}>Navigation</span>
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''
                                    }`}
                            >
                                <span className={styles.navIcon}>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className={styles.sidebarUser}>
                    {user.photoURL && (
                        <img
                            src={user.photoURL}
                            alt={user.displayName ?? 'User'}
                            className={styles.avatar}
                            referrerPolicy="no-referrer"
                        />
                    )}
                    <div className={styles.userInfo}>
                        <span className={styles.userName}>{user.displayName ?? 'User'}</span>
                        <span className={styles.userEmail}>{user.email}</span>
                    </div>
                    <button
                        className={styles.signOutBtn}
                        onClick={signOut}
                        title="Sign out"
                    >
                        ↩
                    </button>
                </div>
            </aside>

            {/* ── Main ─────────────────────────────────────────────────────── */}
            <main className={styles.main}>
                {children}
            </main>
        </div>
    );
}
