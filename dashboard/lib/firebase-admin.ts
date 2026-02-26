// dashboard/lib/firebase-admin.ts
// Firebase Admin SDK — SERVER-SIDE ONLY. Never import in client components.
import * as admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
    if (admin.apps.length > 0) return admin.apps[0]!;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_JSON is not set. Add it to .env.local.'
        );
    }

    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;

    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

export function getAdminDb(): admin.firestore.Firestore {
    return getAdminApp().firestore();
}
