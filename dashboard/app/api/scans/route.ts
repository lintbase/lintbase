import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '../../../lib/firebase-admin';

// POST /api/scans
// Called by the CLI with --save flag.
// Authorization: Bearer <api-key>
// Body: LintBaseReport JSON

export async function POST(req: NextRequest) {
    try {
        // ── Authenticate ───────────────────────────────────────────────────────
        const auth = req.headers.get('Authorization') ?? '';
        const apiKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Missing Authorization header. Use: Authorization: Bearer <your-api-key>' },
                { status: 401 }
            );
        }

        const db = getAdminDb();

        // Look up the API key → user
        const keyDoc = await db.collection('apiKeys').doc(apiKey).get();
        if (!keyDoc.exists) {
            return NextResponse.json(
                { error: 'Invalid API key. Generate one from your LintBase dashboard.' },
                { status: 403 }
            );
        }

        const { userId } = keyDoc.data() as { userId: string };

        // ── Parse body ─────────────────────────────────────────────────────────
        const body = await req.json() as {
            summary: Record<string, unknown>;
            issues: unknown[];
            scannedAt: string;
        };

        if (!body.summary || !body.issues || !body.scannedAt) {
            return NextResponse.json(
                { error: 'Invalid report payload — expected { summary, issues, scannedAt }' },
                { status: 400 }
            );
        }

        // ── Store scan ────────────────────────────────────────────────────────
        const scanRef = db
            .collection('users')
            .doc(userId)
            .collection('scans')
            .doc();

        const scanData = {
            connector: 'firestore',
            summary: body.summary,
            issues: body.issues,
            issueCount: body.issues.length,
            scannedAt: new Date(body.scannedAt as string),
            createdAt: new Date(),
        };

        await scanRef.set(scanData);

        return NextResponse.json(
            { success: true, scanId: scanRef.id, message: 'Scan saved to your LintBase dashboard.' },
            { status: 201 }
        );

    } catch (err) {
        console.error('[POST /api/scans]', err);
        return NextResponse.json(
            { error: 'Internal server error.' },
            { status: 500 }
        );
    }
}
