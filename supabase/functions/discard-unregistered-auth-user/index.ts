import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({ error: "Authentication required." }, 401);
    }
    if (await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile) {
      return jsonResponse({ error: "Registered accounts cannot be discarded." }, 409);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(authData.user.id);
    if (deleteError) throw deleteError;

    return jsonResponse({ discarded: true });
  } catch (error) {
    console.error("discard-unregistered-auth-user failed", error);
    return jsonResponse({ error: "Could not discard the unregistered auth user." }, 500);
  }
});
