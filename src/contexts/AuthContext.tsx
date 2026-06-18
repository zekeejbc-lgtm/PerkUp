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
}

interface AuthContextType {
  user: AppUser | null;
  authUser: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authUser: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testConnection();

    const unsubscribe = auth.onAuthStateChanged(async (sessionUser) => {
      setAuthUser(sessionUser);
      if (sessionUser) {
        try {
          const userDocRef = doc(db, "users", sessionUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            setUser({
              id: sessionUser.uid,
              ...userDoc.data(),
            } as AppUser);
          } else {
            // Create user
            const newUser = {
              email: sessionUser.email || "",
              name: sessionUser.displayName || "User",
              role: "customer" as Role,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newUser);
            
            setUser({ id: sessionUser.uid, ...newUser, role: "customer" });

            // Create customer profile if role is customer
            if (newUser.role === "customer") {
               const custRef = doc(db, "customers", sessionUser.uid);
               const custDoc = await getDoc(custRef);
               if (!custDoc.exists()) {
                  await setDoc(custRef, {
                    lifetimeStars: 0,
                    updatedAt: serverTimestamp(),
                  });
               }
            }
          }
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
    <AuthContext.Provider value={{ user, authUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
