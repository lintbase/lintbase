import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import './globals.css';

// AuthProvider uses Firebase which is browser-only.
// ssr: false ensures it NEVER runs during server-side rendering/static generation,
// so the build passes even without NEXT_PUBLIC_FIREBASE_* env vars.
const AuthProvider = dynamic(
  () => import('../lib/auth').then((m) => ({ default: m.AuthProvider })),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'LintBase — ESLint for your database',
  description: 'Catch schema drift, performance issues, security vulnerabilities, and cost leaks in your NoSQL database before they become expensive problems.',
  openGraph: {
    title: 'LintBase — ESLint for your database',
    description: 'npx lintbase scan firestore — beautiful terminal report, zero config.',
    url: 'https://lintbase.com',
    siteName: 'LintBase',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
