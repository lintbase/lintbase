'use client';
// dashboard/app/providers.tsx
// Client boundary that loads AuthProvider (and therefore Firebase) browser-only.
// This file must be 'use client' because next/dynamic with ssr:false is only
// allowed inside Client Components — not in Server Components like layout.tsx.

import dynamic from 'next/dynamic';

const AuthProvider = dynamic(
    () => import('../lib/auth').then((m) => ({ default: m.AuthProvider })),
    { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
}
