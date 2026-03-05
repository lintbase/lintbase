// dashboard/lib/firebase-admin.ts
// Firebase Admin SDK — SERVER-SIDE ONLY. Never import in client components.
import * as admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
    if (admin.apps.length > 0) return admin.apps[0]!;

    let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_JSON is not set. Add it to .env.local.'
        );
    }

    // Trim whitespace and strip surrounding single-quotes if present
    // (some editors/shells wrap JSON values in single quotes)
    serviceAccountJson = serviceAccountJson.trim();
    if (serviceAccountJson.startsWith("'") && serviceAccountJson.endsWith("'")) {
        serviceAccountJson = serviceAccountJson.slice(1, -1);
    }

    let serviceAccount: admin.ServiceAccount;
    try {
        serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    } catch (e) {
        throw new Error(
            `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.\n` +
            `Make sure it is a single-line JSON string in .env.local.\n` +
            `Tip: cat your-service-account.json | tr -d '\\n' to collapse it.\n` +
            `Parse error: ${e}`
        );
    }

    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

export function getAdminDb(): admin.firestore.Firestore {
    return getAdminApp().firestore();
}
