// dashboard/lib/firebase.ts
// Firebase client SDK — safe to use in browser/React components.
// Uses lazy initialization so the build doesn't fail when env vars aren't set yet.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy singleton — only initialize when first accessed.
// This prevents build-time failures when env vars aren't set in Vercel yet.
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getApp(): FirebaseApp {
    if (!_app) {
        _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
    }
    return _app;
}

export function getFirebaseAuth(): Auth {
    if (!_auth) _auth = getAuth(getApp());
    return _auth;
}

export function getFirebaseDb(): Firestore {
    if (!_db) _db = getFirestore(getApp());
    return _db;
}

// Convenience re-exports used by most components
export const auth = { get current() { return getFirebaseAuth(); } };
export const db = { get current() { return getFirebaseDb(); } };
export default getApp;
