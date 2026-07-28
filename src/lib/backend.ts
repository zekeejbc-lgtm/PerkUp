import { db } from "./dataCompat";
import { auth, secondaryAuth, signInWithOAuth, signOut } from "./supabaseAuthCompat";

export { auth, db, secondaryAuth };

export type GoogleAuthIntent = "signin" | "signup";

export const GOOGLE_AUTH_INTENT_KEY = "perk:google-auth-intent";
export const AUTH_REDIRECT_MESSAGE_KEY = "perk:auth-redirect-message";
export const GOOGLE_SIGNUP_PENDING_KEY = "perk:google-signup-pending";

export const signInWithGoogle = async (intent: GoogleAuthIntent = "signin") => {
  try {
    window.sessionStorage.setItem(GOOGLE_AUTH_INTENT_KEY, intent);
    await signInWithOAuth("google");
    return null;
  } catch (error: any) {
    window.sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
    if (error?.code !== 'auth/cancelled-popup-request' && error?.code !== 'auth/popup-closed-by-user') {
      console.error("Sign in failed", error);
    }
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut();
  } catch (error) {
    console.error("Sign out failed", error);
    throw error;
  }
};

// Error handling helper
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface DataErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleDataError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error
    ? error.message
    : error && typeof error === "object"
      ? JSON.stringify(error)
      : String(error);
  const errInfo: DataErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Supabase Data Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
