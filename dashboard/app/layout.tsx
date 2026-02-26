import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

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
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
