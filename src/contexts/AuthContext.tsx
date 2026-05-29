import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType, testConnection } from "../lib/firebase";

export type Role = "customer" | "staff" | "store_owner" | "admin" | "auditor";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testConnection();

    const unsubscribe = auth.onAuthStateChanged(async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        try {
          const userDocRef = doc(db, "users", fUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            setUser({
              id: fUser.uid,
              ...userDoc.data(),
            } as AppUser);
          } else {
            // Create user
            const newUser = {
              email: fUser.email || "",
              name: fUser.displayName || "User",
              role: "customer" as Role,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newUser);
            
            setUser({ id: fUser.uid, ...newUser, role: "customer" });

            // Create customer profile if role is customer
            if (newUser.role === "customer") {
               const custRef = doc(db, "customers", fUser.uid);
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
            handleFirestoreError(error, OperationType.GET, "users");
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
    <AuthContext.Provider value={{ user, firebaseUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
