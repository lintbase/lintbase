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
import { auth, db } from './firebase';

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    apiKey: string | null;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiKey, setApiKey] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Ensure a user document exists and has an API key
                const userRef = doc(db, 'users', firebaseUser.uid);
                const snap = await getDoc(userRef);

                if (!snap.exists()) {
                    const newApiKey = uuidv4();
                    await setDoc(userRef, {
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName,
                        photoURL: firebaseUser.photoURL,
                        apiKey: newApiKey,
                        createdAt: serverTimestamp(),
                    });
                    // Register the API key for fast lookup from the CLI
                    await setDoc(doc(db, 'apiKeys', newApiKey), {
                        userId: firebaseUser.uid,
                        createdAt: serverTimestamp(),
                    });
                    setApiKey(newApiKey);
                } else {
                    setApiKey((snap.data() as { apiKey: string }).apiKey ?? null);
                }
            } else {
                setApiKey(null);
            }

            setLoading(false);
        });

        return unsub;
    }, []);

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };

    const signOut = async () => {
        await firebaseSignOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, loading, apiKey, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
