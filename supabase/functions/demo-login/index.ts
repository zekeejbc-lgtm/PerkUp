import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";

const DEMO_ROLES = new Set(["customer", "store_owner", "staff", "admin"]);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const clean = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const admin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const runtime = await readRuntimeConfig(admin);
    if (runtime.mode === "maintenance") return jsonResponse(maintenanceError(runtime), 503);
    if (runtime.mode !== "development") {
      return jsonResponse({ error: "Development demo access is disabled." }, 404);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action || "list", 30).toLowerCase();
    const launch = await findLaunchTenant(admin);

    if (action === "list") {
      const availability = Object.fromEntries(
        [...DEMO_ROLES].map((role) => [role, Boolean(launch?.accounts.get(role))]),
      );
      return jsonResponse({
        enabled: true,
        tenantName: launch?.tenant.name || "",
        availability,
      });
    }

    if (action === "signin") {
      const role = clean(body.role, 30).toLowerCase();
      if (!DEMO_ROLES.has(role)) return jsonResponse({ error: "Select a valid demo role." }, 400);
      if (!launch) return jsonResponse({ error: "No active demo sandbox is available." }, 404);
      const account = launch.accounts.get(role);
      if (!account) return jsonResponse({ error: `No ${role.replaceAll("_", " ")} demo account is available.` }, 404);

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: account.email,
      });
      const tokenHash = linkData?.properties?.hashed_token;
      if (linkError || !tokenHash) {
        throw linkError || new Error("A one-click demo session could not be generated.");
      }
      return jsonResponse({
        tokenHash,
        type: "magiclink",
        role,
        tenantName: launch.tenant.name,
      });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("demo-login failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Demo access failed." }, 500);
  }
});

const findLaunchTenant = async (admin: any) => {
  const { data: tenants, error: tenantError } = await admin.from("demo_tenants")
    .select("id,name,expires_at")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (tenantError) throw tenantError;

  for (const tenant of tenants || []) {
    const { data: accounts, error: accountsError } = await admin.from("demo_accounts")
      .select("auth_user_id,role,email,name")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .in("role", [...DEMO_ROLES])
      .order("created_at", { ascending: true });
    if (accountsError) throw accountsError;
    if (!accounts?.length) continue;
    return {
      tenant,
      accounts: new Map(accounts.map((account: any) => [String(account.role), account])),
    };
  }
  return null;
};
