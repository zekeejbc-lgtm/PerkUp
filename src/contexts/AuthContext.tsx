import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User as AuthUser } from "@/src/lib/supabaseAuthCompat";
import { clearDataCache, doc, getDocFromServer, setDoc, serverTimestamp } from "@/src/lib/dataCompat";
import {
  AUTH_REDIRECT_MESSAGE_KEY,
  GOOGLE_AUTH_INTENT_KEY,
  GOOGLE_SIGNUP_PENDING_KEY,
  auth,
  db,
} from "../lib/backend";
import { signOut } from "@/src/lib/supabaseAuthCompat";
import type { TrustedLoginDevice } from "@/src/lib/trustedDevice";
import { supabase } from "@/src/lib/supabase";
import { useRuntimeMode } from "./RuntimeModeContext";

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
  branchLimit?: number;
  currency?: string;
  skipMfaOnTrustedDevice?: boolean;
  trustedLoginDevices?: TrustedLoginDevice[];
  forcePasswordReset?: boolean;
  accountStatus?: "active" | "suspended" | "banned";
  accountStatusReason?: string;
  isDemo?: boolean;
  demoTenantId?: string;
  demoExpiresAt?: string;
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
  const { config: runtimeConfig } = useRuntimeMode();
  const runtimeModeRef = useRef(runtimeConfig.mode);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runtimeModeRef.current = runtimeConfig.mode;
  }, [runtimeConfig.mode]);

  const rejectGoogleRedirect = async (message: string) => {
    window.sessionStorage.setItem(AUTH_REDIRECT_MESSAGE_KEY, message);
    window.sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
    setAuthUser(null);
    setUser(null);
    await signOut();
  };

  const removeUnregisteredGoogleUser = async () => {
    const { error } = await supabase.functions.invoke("discard-unregistered-auth-user");
    if (error) {
      console.error("Could not discard unregistered Google auth user:", error);
    }
  };

  const getAuthProfile = (sessionUser: AuthUser) => ({
    email: sessionUser.email || "",
    name: sessionUser.displayName || "User",
    avatarUrl: sessionUser.photoURL || "",
    photoURL: sessionUser.photoURL || "",
  });

  const loadUserProfile = async (sessionUser: AuthUser) => {
    const userDocRef = doc(db, "users", sessionUser.uid);
    const userDoc = await getDocFromServer(userDocRef);
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
      const demoHasExpired =
        existingUser.isDemo === true &&
        (!existingUser.demoExpiresAt || Date.parse(existingUser.demoExpiresAt) <= Date.now());
      setUser({
        id: sessionUser.uid,
        ...existingUser,
        ...profilePatch,
        ...(demoHasExpired
          ? {
              accountStatus: "suspended",
              accountStatusReason: "This demo sandbox has expired. Ask an auditor to reactivate it.",
            }
          : {}),
      } as AppUser);
      return;
    }

    if (runtimeModeRef.current === "maintenance") {
      window.sessionStorage.setItem(
        AUTH_REDIRECT_MESSAGE_KEY,
        "Maintenance mode is active. Only Auditor and administrator accounts can sign in.",
      );
      setAuthUser(null);
      setUser(null);
      await signOut();
      return;
    }

    if (googleAuthIntent === "signin") {
      await removeUnregisteredGoogleUser();
      await rejectGoogleRedirect("No account was found, try registering.");
      return;
    }

    if (googleAuthIntent === "signup") {
      window.sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
      const authProfile = getAuthProfile(sessionUser);
      window.sessionStorage.setItem(GOOGLE_SIGNUP_PENDING_KEY, JSON.stringify({
        ...authProfile,
        provider: "google",
      }));
      setUser(null);
      return;
    }

    if (window.sessionStorage.getItem(GOOGLE_SIGNUP_PENDING_KEY)) {
      setUser(null);
      return;
    }

    await removeUnregisteredGoogleUser();
    await rejectGoogleRedirect("No account was found, try registering.");
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
    const unsubscribe = auth.onAuthStateChanged(async (sessionUser) => {
      // Cached RLS-scoped rows must not survive an account/session change.
      clearDataCache();
      setAuthUser(sessionUser);
      try {
        if (sessionUser) {
          await loadUserProfile(sessionUser);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Auth profile initialization failed:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
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
