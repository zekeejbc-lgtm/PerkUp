import { doc, getDocFromServer, db } from "./dataCompat";
import { auth, secondaryAuth, signInWithOAuth, signOut } from "./supabaseAuthCompat";

export { auth, db, secondaryAuth };

export const signInWithGoogle = async () => {
  try {
    await signInWithOAuth("google");
    return null;
  } catch (error: any) {
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

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Supabase connection test completed.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Supabase configuration.");
    }
  }
}

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
  const errInfo: DataErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
