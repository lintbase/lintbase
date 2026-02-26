'use client';
// dashboard/lib/auth.tsx
// Auth context — wraps the entire app so any component can call useAuth().

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getFirebaseAuth, getFirebaseDb } from './firebase';

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    apiKey: string | null;
    plan: 'free' | 'pro';
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [plan, setPlan] = useState<'free' | 'pro'>('free');

    useEffect(() => {
        // Guard: only initialize Firebase if the API key is configured.
        // Without this, the landing page would crash for visitors even before
        // Firebase env vars are set in Vercel.
        if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
            setLoading(false);
            return;
        }

        const unsub = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Ensure a user document exists and has an API key
                const userRef = doc(getFirebaseDb(), 'users', firebaseUser.uid);
                const snap = await getDoc(userRef);

                if (!snap.exists()) {
                    const newApiKey = uuidv4();
                    await setDoc(userRef, {
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName,
                        photoURL: firebaseUser.photoURL,
                        apiKey: newApiKey,
                        plan: 'free',
                        createdAt: serverTimestamp(),
                    });
                    await setDoc(doc(getFirebaseDb(), 'apiKeys', newApiKey), {
                        userId: firebaseUser.uid,
                        createdAt: serverTimestamp(),
                    });
                    setApiKey(newApiKey);
                    setPlan('free');
                } else {
                    const data = snap.data() as { apiKey: string; plan?: 'free' | 'pro' };
                    setApiKey(data.apiKey ?? null);
                    setPlan(data.plan ?? 'free');
                }
            } else {
                setApiKey(null);
                setPlan('free');
            }

            setLoading(false);
        });

        return unsub;
    }, []);

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(getFirebaseAuth(), provider);
    };

    const signOut = async () => {
        await firebaseSignOut(getFirebaseAuth());
    };

    return (
        <AuthContext.Provider value={{ user, loading, apiKey, plan, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
