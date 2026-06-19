import { Provider, Session, User as SupabaseUser } from "@supabase/supabase-js";
import { secondarySupabase, supabase } from "./supabase";

type AuthClient = typeof supabase.auth;
type CompatAuthErrorCode =
  | "auth/email-already-in-use"
  | "auth/email-not-authorized"
  | "auth/invalid-email"
  | "auth/invalid-credential"
  | "auth/operation-not-allowed"
  | "auth/signup-failed"
  | "auth/weak-password";

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  tenantId?: string | null;
  providerData?: { providerId?: string | null; email?: string | null }[];
}

export interface AuthCompat {
  client: AuthClient;
  currentUser: User | null;
  onAuthStateChanged: (callback: (user: User | null) => void | Promise<void>) => () => void;
}

export interface UserCredential {
  user: User;
}

const toCompatUser = (user: SupabaseUser | null): User | null => {
  if (!user) return null;
  return {
    uid: user.id,
    email: user.email ?? null,
    displayName:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
    emailVerified: Boolean(user.email_confirmed_at),
    isAnonymous: user.is_anonymous,
    tenantId: null,
    providerData:
      user.identities?.map((identity) => ({
        providerId: identity.provider,
        email: user.email ?? null,
      })) ?? [],
  };
};

const createAuthCompat = (client: AuthClient): AuthCompat => {
  const compat: AuthCompat = {
    client,
    currentUser: null,
    onAuthStateChanged: (callback) => {
      let active = true;

      const emitSession = async (session: Session | null) => {
        if (!active) return;
        compat.currentUser = toCompatUser(session?.user ?? null);
        await callback(compat.currentUser);
      };

      client.getSession().then(({ data }) => emitSession(data.session));
      const { data } = client.onAuthStateChange((_event, session) => {
        emitSession(session);
      });

      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    },
  };

  return compat;
};

export const auth = createAuthCompat(supabase.auth);
export const secondaryAuth = createAuthCompat(secondarySupabase.auth);

const normalizeEmail = (email: string) => email.trim();

const createCompatAuthError = (message: string, code: CompatAuthErrorCode) => {
  const error = new Error(message) as Error & { code: CompatAuthErrorCode };
  error.code = code;
  return error;
};

const toSignInError = (error: { code?: string; message?: string }) => {
  const code = String(error.code || "");
  const message = String(error.message || "Invalid login credentials");
  const normalizedMessage = message.toLowerCase();

  if (
    code.includes("email_provider_disabled") ||
    code.includes("provider_disabled") ||
    normalizedMessage.includes("email logins are disabled") ||
    normalizedMessage.includes("email provider is disabled")
  ) {
    return createCompatAuthError(message, "auth/operation-not-allowed");
  }

  return createCompatAuthError(message, "auth/signup-failed");
};

const toSignUpError = (error: { code?: string; message?: string }) => {
  const code = String(error.code || "");
  const message = String(error.message || "Could not create user.");
  const normalizedMessage = message.toLowerCase();

  if (
    code.includes("weak_password") ||
    normalizedMessage.includes("password should be") ||
    normalizedMessage.includes("weak password")
  ) {
    return createCompatAuthError(message, "auth/weak-password");
  }

  if (
    code.includes("email_exists") ||
    code.includes("user_already") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  ) {
    return createCompatAuthError(message, "auth/email-already-in-use");
  }

  if (
    code.includes("signup_disabled") ||
    code.includes("email_provider_disabled") ||
    code.includes("provider_disabled") ||
    normalizedMessage.includes("signups not allowed") ||
    normalizedMessage.includes("signup is disabled") ||
    normalizedMessage.includes("email logins are disabled") ||
    normalizedMessage.includes("email provider is disabled")
  ) {
    return createCompatAuthError(message, "auth/operation-not-allowed");
  }

  if (
    code.includes("email_address_invalid") ||
    normalizedMessage.includes("email address") && normalizedMessage.includes("invalid")
  ) {
    return createCompatAuthError(message, "auth/invalid-email");
  }

  if (
    code.includes("email_address_not_authorized") ||
    normalizedMessage.includes("not authorized")
  ) {
    return createCompatAuthError(message, "auth/email-not-authorized");
  }

  return createCompatAuthError(message, "auth/invalid-credential");
};

export async function signInWithEmailAndPassword(
  authClient: AuthCompat,
  email: string,
  password: string,
): Promise<UserCredential> {
  const { data, error } = await authClient.client.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw toSignInError(error);

  const user = toCompatUser(data.user);
  if (!user) throw new Error("No user returned from Supabase sign in.");
  authClient.currentUser = user;
  return { user };
}

export async function createUserWithEmailAndPassword(
  authClient: AuthCompat,
  email: string,
  password: string,
): Promise<UserCredential> {
  const { data, error } = await authClient.client.signUp({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw toSignUpError(error);

  const user = toCompatUser(data.user);
  if (!user) throw new Error("No user returned from Supabase sign up.");
  authClient.currentUser = user;
  return { user };
}

export async function sendPasswordResetEmail(_authClient: AuthCompat, email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(
  _authClient: AuthCompat | User | null,
  newPassword: string,
  currentPassword?: string,
) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    ...(currentPassword ? { current_password: currentPassword } : {}),
  });
  if (error) throw error;
}

export async function updateEmail(_authClient: AuthCompat | User | null, email: string) {
  const { error } = await supabase.auth.updateUser({ email: normalizeEmail(email) });
  if (error) throw error;
}

export async function signOut(authClient: AuthCompat = auth) {
  const { error } = await authClient.client.signOut();
  if (error) throw error;
  authClient.currentUser = null;
}

export async function signInWithOAuth(provider: Provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}
