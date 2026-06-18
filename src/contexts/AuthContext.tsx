import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as AuthUser } from "@/src/lib/supabaseAuthCompat";
import { doc, getDoc, setDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { auth, db, handleDataError, OperationType, testConnection } from "../lib/backend";

export type Role = "customer" | "staff" | "store_owner" | "admin" | "auditor";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  username?: string;
  phone?: string;
  number?: string;
  bio?: string;
  birthday?: string;
  avatarUrl?: string;
  photoURL?: string;
  address?: string;
  storeId?: string;
}

interface AuthContextType {
  user: AppUser | null;
  authUser: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authUser: null,
  loading: true,
  refreshUser: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async (sessionUser: AuthUser) => {
    const userDocRef = doc(db, "users", sessionUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      setUser({
        id: sessionUser.uid,
        ...userDoc.data(),
      } as AppUser);
      return;
    }

    const newUser = {
      email: sessionUser.email || "",
      name: sessionUser.displayName || "User",
      role: "customer" as Role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userDocRef, newUser);

    setUser({ id: sessionUser.uid, ...newUser, role: "customer" });

    const custRef = doc(db, "customers", sessionUser.uid);
    const custDoc = await getDoc(custRef);
    if (!custDoc.exists()) {
      await setDoc(custRef, {
        lifetimeStars: 0,
        updatedAt: serverTimestamp(),
      });
    }
  };

  const refreshUser = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setUser(null);
      return;
    }
    await loadUserProfile(currentUser);
  };

  useEffect(() => {
    testConnection();

    const unsubscribe = auth.onAuthStateChanged(async (sessionUser) => {
      setAuthUser(sessionUser);
      if (sessionUser) {
        try {
          await loadUserProfile(sessionUser);
        } catch (error) {
          console.error("Auth init error:", error);
          if (error instanceof Error && error.message.includes("Missing or insufficient permissions")) {
            console.error("Permission denied. Could be a guest or unverified user.");
          } else {
            handleDataError(error, OperationType.GET, "users");
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, authUser, loading, refreshUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
