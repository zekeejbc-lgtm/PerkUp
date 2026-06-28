import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as AuthUser } from "@/src/lib/supabaseAuthCompat";
import { doc, getDoc, setDoc, serverTimestamp } from "@/src/lib/dataCompat";
import {
  AUTH_REDIRECT_MESSAGE_KEY,
  GOOGLE_AUTH_INTENT_KEY,
  auth,
  db,
  handleDataError,
  OperationType,
  testConnection,
} from "../lib/backend";
import { signOut } from "@/src/lib/supabaseAuthCompat";
import type { TrustedLoginDevice } from "@/src/lib/trustedDevice";

export type Role = "customer" | "staff" | "store_owner" | "admin" | "assistant_admin" | "auditor";

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
  skipMfaOnTrustedDevice?: boolean;
  trustedLoginDevices?: TrustedLoginDevice[];
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

  const rejectGoogleRedirect = async (message: string) => {
    window.sessionStorage.setItem(AUTH_REDIRECT_MESSAGE_KEY, message);
    window.sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
    setAuthUser(null);
    setUser(null);
    await signOut();
  };

  const getAuthProfile = (sessionUser: AuthUser) => ({
    email: sessionUser.email || "",
    name: sessionUser.displayName || "User",
    avatarUrl: sessionUser.photoURL || "",
    photoURL: sessionUser.photoURL || "",
  });

  const loadUserProfile = async (sessionUser: AuthUser) => {
    const userDocRef = doc(db, "users", sessionUser.uid);
    const userDoc = await getDoc(userDocRef);
    const googleAuthIntent = window.sessionStorage.getItem(GOOGLE_AUTH_INTENT_KEY);

    if (userDoc.exists()) {
      if (googleAuthIntent === "signup") {
        await rejectGoogleRedirect("An account already exists for this Google account. Please sign in instead.");
        return;
      }

      window.sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
      const existingUser = userDoc.data() as AppUser;
      const authProfile = getAuthProfile(sessionUser);
      const profilePatch: Partial<AppUser> = {};
      if (!existingUser.name && authProfile.name) profilePatch.name = authProfile.name;
      if (!existingUser.avatarUrl && authProfile.avatarUrl) profilePatch.avatarUrl = authProfile.avatarUrl;
      if (!existingUser.photoURL && authProfile.photoURL) profilePatch.photoURL = authProfile.photoURL;
      if (Object.keys(profilePatch).length > 0) {
        await setDoc(userDocRef, { ...profilePatch, updatedAt: serverTimestamp() }, { merge: true });
      }
      setUser({
        id: sessionUser.uid,
        ...existingUser,
        ...profilePatch,
      } as AppUser);
      return;
    }

    if (googleAuthIntent === "signin") {
      await rejectGoogleRedirect("No account was found, try registering.");
      return;
    }

    window.sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
    const authProfile = getAuthProfile(sessionUser);
    const newUser = {
      ...authProfile,
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
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
