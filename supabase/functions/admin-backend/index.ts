import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sessionNeedsMfa } from "../_shared/auth.ts";
import { createPayMongoPaymentLink } from "../_shared/paymongo.ts";
import { maintenanceError, readRuntimeConfig } from "../_shared/runtime.ts";
import {
  buildSubscriptionUpgradeQuote,
  findPlan,
  listEligibleUpgradePlans,
  normalizePlanCatalog,
  SUBSCRIPTION_UPGRADE_TERMS_VERSION,
  type PlanSnapshot,
  type RenewalInvoiceState,
  type UpgradeQuote,
} from "../_shared/subscription-upgrade.ts";

const DEFAULT_GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbxfacR_tG28iu-riTquHZK9fRHN1aRAswJNUXAdRD36dd-YlxoqskAzQkgQvm1BWUQ/exec";
const DEFAULT_APP_URL = "https://www.perktoday.com";
const PERMANENT_AUDITOR_EMAIL = "ezequieljohncrisostomo20@gmail.com";
const PRIVILEGED_ROLES = new Set(["admin", "assistant_admin", "auditor"]);
const MANAGED_ROLES = new Set([
  "customer",
  "staff",
  "store_owner",
  "admin",
  "assistant_admin",
  "auditor",
]);
const AUTO_AUDITED_MUTATIONS = new Set([
  "update_public_feedback",
  "update_error_report",
  "sync_subscription_billing",
  "cancel_subscription_auto_renewal",
  "confirm_subscription_upgrade",
  "cancel_subscription_upgrade",
  "admin_cancel_subscription_upgrade",
  "retry_billing_invoice",
  "update_subscription_access",
  "update_account_restriction",
  "create_store",
  "create_branch",
  "decide_branch_request",
  "reject_application",
  "reset_password",
  "complete_first_login_password_change",
  "adjust_card_stars",
  "adjust_card_promotion",
  "delete_store",
  "delete_store_group",
]);
const ACCOUNT_STATUSES = new Set(["active", "suspended", "banned"]);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || "").trim().slice(0, maxLength);

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const toIsoTimestamp = (value: unknown) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (value && typeof value === "object" && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : "";
  }
  return "";
};

const getSubscriptionBranchLimit = (dependencies: unknown) => {
  const value = dependencies && typeof dependencies === "object"
    ? Number((dependencies as Record<string, unknown>).branchLimit ?? 1)
    : 1;
  const configuredLimit = Math.trunc(value);
  if (!Number.isFinite(configuredLimit)) return 1;
  return configuredLimit <= 0 ? 100 : Math.min(100, configuredLimit);
};

const isStrongPassword = (password: string, name: string, email: string) => {
  const normalized = password.toLowerCase();
  const personalTerms = [
    ...name.toLowerCase().split(/[^a-z0-9]+/),
    email.toLowerCase().split("@")[0],
  ].filter((term) => term.length >= 3);
  return getPasswordRequirementChecks(password, normalized, personalTerms).every(Boolean);
};

const getPasswordRequirementChecks = (password: string, normalized: string, personalTerms: string[]) => [
  password.length >= 12,
  /[a-z]/.test(password) && /[A-Z]/.test(password),
  /\d/.test(password),
  /[^A-Za-z0-9\s]/.test(password),
  !/\s/.test(password),
  personalTerms.every((term) => !normalized.includes(term)),
];

const assertPasswordNotCompromised = async (password: string) => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!response.ok) {
    throw new Error("Password safety could not be verified. Please try again.");
  }
  const suffix = hash.slice(5);
  const compromised = (await response.text()).split(/\r?\n/).some((line) =>
    line.slice(0, 35).toUpperCase() === suffix
  );
  if (compromised) {
    throw new Error("This password appears in known data breaches. Choose a different password.");
  }
};

type UserProfile = {
  role?: string;
  storeId?: string;
  isDemo?: boolean;
  demoTenantId?: string;
  demoExpiresAt?: string;
  email?: string;
  name?: string;
  username?: string;
  phone?: string;
  number?: string;
  avatarUrl?: string;
  photoURL?: string;
  accountStatus?: string;
  accountStatusReason?: string;
  forcePasswordReset?: boolean;
  branchLimit?: number;
};

const handleAdminRequest = async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 60);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);
    if (action !== "end_maintenance_mode" && await sessionNeedsMfa(userClient, authorization)) {
      return jsonResponse({ error: "Complete multi-factor authentication to continue.", code: "mfa_required" }, 403);
    }

    const { data: actorRow, error: actorError } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (actorError) throw actorError;

    const actor = (actorRow?.data || {}) as UserProfile;
    const actorStatus = cleanText(actor.accountStatus || "active", 20).toLowerCase();
    if (actorStatus === "suspended" || actorStatus === "banned") {
      return jsonResponse({ error: `This account is ${actorStatus}. Contact a PerkUp administrator.` }, 403);
    }
    const actorIsAdmin = PRIVILEGED_ROLES.has(cleanText(actor.role, 30));
    const actorHasMaintenanceAccess = actorIsAdmin && actor.isDemo !== true;
    const actorCanReview = actorIsAdmin;
    const runtimeConfig = await readRuntimeConfig(admin);

    if (action === "get_runtime_config") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      return jsonResponse({ config: runtimeConfig });
    }

    if (action === "set_runtime_mode") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const mode = cleanText(body.mode, 30).toLowerCase();
      if (!["production", "development"].includes(mode)) {
        return jsonResponse({ error: "Select production or development mode." }, 400);
      }
      if (runtimeConfig.mode === "maintenance") {
        return jsonResponse({ error: "End maintenance through the authenticated maintenance recovery flow first." }, 409);
      }
      const now = new Date().toISOString();
      const { error } = await admin.from("system_runtime_config").update({
        mode,
        mode_before_maintenance: mode,
        mode_changed_at: now,
        mode_changed_by: authData.user.id,
      }).eq("id", "global");
      if (error) throw error;
      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "set_runtime_mode",
        entityType: "system_runtime",
        entityId: "global",
        metadata: { previousMode: runtimeConfig.mode, mode },
      });
      return jsonResponse({ config: { ...runtimeConfig, mode, mode_before_maintenance: mode, mode_changed_at: now } });
    }

    if (action === "initiate_maintenance_mode") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      if (runtimeConfig.mode === "maintenance") {
        return jsonResponse({ error: "Maintenance mode is already active." }, 409);
      }
      const password = String(body.password || "");
      const confirmation = cleanText(body.confirmation, 80);
      const title = cleanText(body.title, 120) || "Scheduled maintenance";
      const reason = cleanText(body.reason, 2000);
      const details = cleanText(body.details, 4000);
      if (confirmation !== "INITIATE MAINTENANCE MODE") {
        return jsonResponse({ error: 'Type "INITIATE MAINTENANCE MODE" exactly to continue.' }, 400);
      }
      if (!reason) return jsonResponse({ error: "Enter the maintenance reason shown to visitors." }, 400);
      if (!password || !authData.user.email || !await verifyActorPassword(supabaseUrl, anonKey, authData.user.email, password)) {
        return jsonResponse({ error: "The auditor password is incorrect." }, 403);
      }
      const now = new Date().toISOString();
      const { error } = await admin.from("system_runtime_config").update({
        mode: "maintenance",
        mode_before_maintenance: runtimeConfig.mode === "development" ? "development" : "production",
        maintenance_title: title,
        maintenance_reason: reason,
        maintenance_details: details,
        maintenance_started_at: now,
        maintenance_started_by: authData.user.id,
        mode_changed_at: now,
        mode_changed_by: authData.user.id,
      }).eq("id", "global");
      if (error) throw error;
      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "initiate_maintenance_mode",
        entityType: "system_runtime",
        entityId: "global",
        metadata: { previousMode: runtimeConfig.mode, title, reason, details },
      });
      return jsonResponse({
        config: {
          mode: "maintenance",
          mode_before_maintenance: runtimeConfig.mode,
          maintenance_title: title,
          maintenance_reason: reason,
          maintenance_details: details,
          maintenance_started_at: now,
        },
      });
    }

    if (action === "end_maintenance_mode") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const password = String(body.password || "");
      const confirmation = cleanText(body.confirmation, 80);
      if (confirmation !== "END MAINTENANCE MODE") {
        return jsonResponse({ error: 'Type "END MAINTENANCE MODE" exactly to continue.' }, 400);
      }
      if (!password || !authData.user.email || !await verifyActorPassword(supabaseUrl, anonKey, authData.user.email, password)) {
        return jsonResponse({ error: "The auditor password is incorrect." }, 403);
      }
      const nextMode = "production";
      const now = new Date().toISOString();
      const { error } = await admin.from("system_runtime_config").update({
        mode: nextMode,
        mode_before_maintenance: nextMode,
        maintenance_started_at: null,
        maintenance_started_by: null,
        mode_changed_at: now,
        mode_changed_by: authData.user.id,
      }).eq("id", "global");
      if (error) throw error;
      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "end_maintenance_mode",
        entityType: "system_runtime",
        entityId: "global",
        metadata: { previousMode: runtimeConfig.mode, mode: nextMode },
      });
      return jsonResponse({ config: { ...runtimeConfig, mode: nextMode, mode_before_maintenance: nextMode, mode_changed_at: now } });
    }

    if (runtimeConfig.mode === "maintenance" && !actorHasMaintenanceAccess) {
      return jsonResponse(maintenanceError(runtimeConfig), 503);
    }

    if (actor.isDemo && actor.role === "admin" && !["list_accounts", "list_account_stores"].includes(action)) {
      return jsonResponse({ error: "Demo administrator access is a read-only sandbox preview." }, 403);
    }

    if (action === "list_accounts") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);

      const [profileRows, authUsers, storeRows] = await Promise.all([
        readAllRows(admin, "users", "id,public_id,data,created_at,updated_at"),
        listAllAuthUsers(admin),
        readAllRows(admin, "stores", "id,data,created_at"),
      ]);
      const authById = new Map(authUsers.map((authUser: any) => [String(authUser.id), authUser]));
      const storesById = new Map(storeRows.map((row: any) => [String(row.id), row.data || {}]));
      const search = cleanText(body.search, 160).toLowerCase();
      const roleFilter = cleanText(body.role, 30).toLowerCase() || "all";
      const statusFilter = cleanText(body.status, 30).toLowerCase() || "all";
      const storeFilter = cleanText(body.storeId, 100) || "all";
      const page = Math.max(1, Math.trunc(Number(body.page) || 1));
      const pageSize = Math.max(10, Math.min(100, Math.trunc(Number(body.pageSize) || 25)));
      const productionProfileRows = actor.isDemo && actor.demoTenantId
        ? profileRows.filter((row: any) =>
          row.data?.isDemo === true && row.data?.demoTenantId === actor.demoTenantId
        )
        : profileRows.filter((row: any) => row.data?.isDemo !== true);

      const accounts = productionProfileRows.map((row: any) => {
        const profile = (row.data || {}) as UserProfile;
        const authUser = authById.get(String(row.id)) as any;
        const email = cleanText(authUser?.email || profile.email, 254).toLowerCase();
        const storeId = cleanText(profile.storeId, 100);
        const store = storesById.get(storeId) as any;
        return {
          id: String(row.id),
          publicId: cleanText(row.public_id, 20),
          email,
          name: cleanText(profile.name, 120) || "Unnamed account",
          phone: cleanText(profile.phone || profile.number, 40),
          avatarUrl: cleanText(profile.avatarUrl || profile.photoURL, 2000),
          role: cleanText(profile.role || "customer", 30),
          accountStatus: cleanText(profile.accountStatus || (authUser?.banned_until ? "banned" : "active"), 20),
          accountStatusReason: cleanText(profile.accountStatusReason, 500),
          storeId,
          storeName: cleanText(store?.businessName || store?.name, 160),
          lastAccessedAt: cleanText(authUser?.last_sign_in_at, 100) || null,
          createdAt: cleanText(authUser?.created_at || row.created_at, 100) || null,
          updatedAt: cleanText(row.updated_at, 100) || null,
          isPermanentAuditor: email === PERMANENT_AUDITOR_EMAIL,
        };
      }).filter((account: any) => {
        if (roleFilter !== "all" && account.role !== roleFilter) return false;
        if (statusFilter !== "all" && account.accountStatus !== statusFilter) return false;
        if (storeFilter !== "all" && account.storeId !== storeFilter) return false;
        if (!search) return true;
        return [
          account.name,
          account.email,
          account.phone,
          account.role,
          account.accountStatus,
          account.storeName,
          account.publicId,
          account.storeId,
        ].some((value) => String(value || "").toLowerCase().includes(search));
      }).sort((left: any, right: any) => {
        const leftTime = Date.parse(left.lastAccessedAt || left.createdAt || "") || 0;
        const rightTime = Date.parse(right.lastAccessedAt || right.createdAt || "") || 0;
        return rightTime - leftTime || left.name.localeCompare(right.name);
      });

      const from = (page - 1) * pageSize;
      const summary = productionProfileRows.reduce((result: Record<string, number>, row: any) => {
        const profile = (row.data || {}) as UserProfile;
        const status = cleanText(profile.accountStatus || "active", 20);
        result.total += 1;
        result[cleanText(profile.role || "customer", 30)] = (result[cleanText(profile.role || "customer", 30)] || 0) + 1;
        result[status] = (result[status] || 0) + 1;
        return result;
      }, { total: 0, active: 0, suspended: 0, banned: 0 });

      return jsonResponse({
        accounts: accounts.slice(from, from + pageSize),
        page,
        pageSize,
        total: accounts.length,
        summary,
      });
    }

    if (action === "list_account_stores") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeRows = await readAllRows(admin, "stores", "id,data,created_at");
      const stores = storeRows.filter((row: any) =>
        actor.isDemo && actor.demoTenantId
          ? row.data?.isDemo === true && row.data?.demoTenantId === actor.demoTenantId
          : row.data?.isDemo !== true
      ).map((row: any) => ({
        id: String(row.id),
        name: cleanText(row.data?.businessName || row.data?.name, 160) || "Unnamed store",
        ownerId: cleanText(row.data?.ownerId, 100),
        status: cleanText(row.data?.status || "active", 30),
        isPrimaryBranch: row.data?.isPrimaryBranch === true,
        parentStoreId: cleanText(row.data?.parentStoreId, 100),
      })).sort((left, right) => left.name.localeCompare(right.name));
      return jsonResponse({ stores });
    }

    if (action === "list_demo_tenants") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      await reconcileExpiredDemoTenants(admin);

      const [tenantRows, accountRows, authUsers] = await Promise.all([
        readAllRows(admin, "demo_tenants", "id,public_id,name,slug,status,store_id,owner_user_id,expires_at,created_by,deactivated_at,deactivated_by,created_at,updated_at"),
        readAllRows(admin, "demo_accounts", "auth_user_id,tenant_id,role,email,name,status,created_at,updated_at"),
        listAllAuthUsers(admin),
      ]);
      const authById = new Map(authUsers.map((authUser: any) => [String(authUser.id), authUser]));
      const accountsByTenant = new Map<string, any[]>();
      for (const account of accountRows) {
        const tenantId = String(account.tenant_id);
        const tenantAccounts = accountsByTenant.get(tenantId) || [];
        const authUser = authById.get(String(account.auth_user_id)) as any;
        tenantAccounts.push({
          id: String(account.auth_user_id),
          role: cleanText(account.role, 30),
          email: cleanText(account.email, 254),
          name: cleanText(account.name, 120),
          status: cleanText(account.status, 30),
          lastAccessedAt: cleanText(authUser?.last_sign_in_at, 100) || null,
          createdAt: account.created_at,
        });
        accountsByTenant.set(tenantId, tenantAccounts);
      }

      const search = cleanText(body.search, 160).toLowerCase();
      const statusFilter = cleanText(body.status, 30).toLowerCase() || "all";
      const expiryFilter = cleanText(body.expiry, 30).toLowerCase() || "all";
      const page = Math.max(1, Math.trunc(Number(body.page) || 1));
      const pageSize = Math.max(5, Math.min(100, Math.trunc(Number(body.pageSize) || 10)));
      const now = Date.now();
      const tenants = tenantRows.map((row: any) => {
        const accounts = (accountsByTenant.get(String(row.id)) || [])
          .sort((left, right) => left.role.localeCompare(right.role) || left.name.localeCompare(right.name));
        return {
          id: String(row.id),
          publicId: cleanText(row.public_id, 20),
          name: cleanText(row.name, 120),
          slug: cleanText(row.slug, 60),
          status: cleanText(row.status, 30),
          storeId: cleanText(row.store_id, 100),
          ownerUserId: cleanText(row.owner_user_id, 100),
          expiresAt: row.expires_at,
          createdBy: cleanText(row.created_by, 100),
          deactivatedAt: row.deactivated_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          accounts,
        };
      }).filter((tenant: any) => {
        if (statusFilter !== "all" && tenant.status !== statusFilter) return false;
        const remaining = Date.parse(tenant.expiresAt) - now;
        if (expiryFilter === "24h" && (remaining <= 0 || remaining > 86_400_000)) return false;
        if (expiryFilter === "7d" && (remaining <= 0 || remaining > 7 * 86_400_000)) return false;
        if (!search) return true;
        return [
          tenant.name,
          tenant.slug,
          tenant.storeId,
          tenant.publicId,
          ...tenant.accounts.flatMap((account: any) => [account.name, account.email, account.role]),
        ].some((value) => String(value || "").toLowerCase().includes(search));
      }).sort((left: any, right: any) => {
        if (left.status === "active" && right.status !== "active") return -1;
        if (right.status === "active" && left.status !== "active") return 1;
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      });

      const from = (page - 1) * pageSize;
      return jsonResponse({
        tenants: tenants.slice(from, from + pageSize),
        page,
        pageSize,
        total: tenants.length,
        summary: {
          total: tenantRows.length,
          active: tenantRows.filter((row: any) => row.status === "active").length,
          deactivated: tenantRows.filter((row: any) => row.status === "deactivated").length,
          expired: tenantRows.filter((row: any) => row.status === "expired").length,
          accounts: accountRows.length,
        },
      });
    }

    if (action === "create_demo_tenant") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const name = cleanText(body.name, 120);
      const durationHours = Math.trunc(Number(body.durationHours));
      const staffCount = Math.trunc(Number(body.staffCount ?? 1));
      const includeCustomer = body.includeCustomer !== false;
      const includeAdmin = body.includeAdmin === true;
      if (name.length < 2) return jsonResponse({ error: "Enter a demo sandbox name." }, 400);
      if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 2_160) {
        return jsonResponse({ error: "Demo access must last between 1 hour and 90 days." }, 400);
      }
      if (!Number.isInteger(staffCount) || staffCount < 1 || staffCount > 10) {
        return jsonResponse({ error: "Create between 1 and 10 staff accounts at a time." }, 400);
      }

      const tenantId = crypto.randomUUID();
      const storeId = `demo-${tenantId}`;
      const slug = `${slugify(name).slice(0, 36) || "sandbox"}-${randomToken(6).toLowerCase()}`;
      const expiresAt = new Date(Date.now() + durationHours * 3_600_000).toISOString();
      const createdUserIds: string[] = [];
      let storeCreated = false;

      try {
        const credentials: DemoCredential[] = [];
        const ownerCredential = await createDemoAccount(admin, {
          tenantId,
          storeId,
          expiresAt,
          role: "store_owner",
          email: demoEmail(slug, "owner"),
          name: `${name} Owner`,
        });
        createdUserIds.push(ownerCredential.userId);
        credentials.push(ownerCredential);

        for (let index = 1; index <= staffCount; index += 1) {
          const staffCredential = await createDemoAccount(admin, {
            tenantId,
            storeId,
            expiresAt,
            role: "staff",
            email: demoEmail(slug, `staff${index}`),
            name: `${name} Staff ${index}`,
          });
          createdUserIds.push(staffCredential.userId);
          credentials.push(staffCredential);
        }

        if (includeCustomer) {
          const customerCredential = await createDemoAccount(admin, {
            tenantId,
            storeId,
            expiresAt,
            role: "customer",
            email: demoEmail(slug, "customer"),
            name: `${name} Customer`,
            username: `demo.${randomToken(10).toLowerCase()}`,
          });
          createdUserIds.push(customerCredential.userId);
          credentials.push(customerCredential);
        }

        if (includeAdmin) {
          const adminCredential = await createDemoAccount(admin, {
            tenantId,
            storeId,
            expiresAt,
            role: "admin",
            email: demoEmail(slug, "admin"),
            name: `${name} Admin`,
          });
          createdUserIds.push(adminCredential.userId);
          credentials.push(adminCredential);
        }

        const now = timestamp();
        const { error: storeError } = await admin.from("stores").insert({
          id: storeId,
          data: {
            name: `${name} Demo Store`,
            businessName: `${name} Demo Store`,
            branchName: "Sandbox",
            isPrimaryBranch: true,
            ownerId: ownerCredential.userId,
            isDemo: true,
            demoTenantId: tenantId,
            demoExpiresAt: expiresAt,
            status: "active",
            category: "Demo",
            location: "Private demo sandbox",
            address: "Private demo sandbox",
            lat: 14.5995,
            lng: 120.9842,
            subscriptionLevel: "Demo Sandbox",
            subscriptionStart: new Date().toISOString(),
            subscriptionEnd: expiresAt,
            subscriptionDependencies: {
              staffLimit: Math.max(10, staffCount),
              branchLimit: 1,
              promotionLimit: 100,
              productLimit: 100,
              galleryPhotoLimit: 10,
            },
            subscriptionAccess: {
              status: "active",
              automationEnabled: false,
              warningLeadDays: 0,
              gracePeriodDays: 0,
            },
            initialPaymentRequired: false,
            initialPaymentStatus: "not_required",
            createdAt: now,
            updatedAt: now,
          },
        });
        if (storeError) throw storeError;
        storeCreated = true;

        const { error: tenantError } = await admin.from("demo_tenants").insert({
          id: tenantId,
          name,
          slug,
          status: "active",
          store_id: storeId,
          owner_user_id: ownerCredential.userId,
          expires_at: expiresAt,
          created_by: authData.user.id,
        });
        if (tenantError) throw tenantError;

        const { error: accountsError } = await admin.from("demo_accounts").insert(
          credentials.map((credential) => ({
            auth_user_id: credential.userId,
            tenant_id: tenantId,
            role: credential.role,
            email: credential.email,
            name: credential.name,
            status: "active",
          })),
        );
        if (accountsError) throw accountsError;

        await writeAuditEvent(admin, {
          actorUserId: authData.user.id,
          actorEmail: authData.user.email || actor.email,
          actorRole: actor.role,
          action: "create_demo_tenant",
          entityType: "demo_tenant",
          entityId: tenantId,
          metadata: { name, storeId, expiresAt, staffCount, includeCustomer, includeAdmin, isDemo: true },
        });

        return jsonResponse({
          tenant: { id: tenantId, name, slug, status: "active", storeId, expiresAt },
          credentials,
        });
      } catch (error) {
        await admin.from("demo_accounts").delete().eq("tenant_id", tenantId);
        await admin.from("demo_tenants").delete().eq("id", tenantId);
        if (createdUserIds.length) {
          await admin.from("customers").delete().in("id", createdUserIds);
          await admin.from("users").delete().in("id", createdUserIds);
        }
        for (const userId of createdUserIds) {
          await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        }
        if (storeCreated) await admin.from("stores").delete().eq("id", storeId);
        throw error;
      }
    }

    if (action === "add_demo_staff") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const tenantId = cleanText(body.tenantId, 100);
      const count = Math.trunc(Number(body.count ?? 1));
      if (!tenantId || !Number.isInteger(count) || count < 1 || count > 10) {
        return jsonResponse({ error: "Select a sandbox and add between 1 and 10 staff accounts." }, 400);
      }
      const tenant = await getActiveDemoTenant(admin, tenantId);
      const { count: existingStaffCount, error: countError } = await admin.from("demo_accounts")
        .select("auth_user_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("role", "staff");
      if (countError) throw countError;
      if ((existingStaffCount || 0) + count > 25) {
        return jsonResponse({ error: "A demo sandbox can contain at most 25 staff accounts." }, 409);
      }

      const credentials: DemoCredential[] = [];
      try {
        for (let index = 1; index <= count; index += 1) {
          const number = (existingStaffCount || 0) + index;
          const credential = await createDemoAccount(admin, {
            tenantId,
            storeId: tenant.store_id,
            expiresAt: tenant.expires_at,
            role: "staff",
            email: demoEmail(tenant.slug, `staff${number}-${randomToken(4).toLowerCase()}`),
            name: `${tenant.name} Staff ${number}`,
          });
          credentials.push(credential);
          const { error } = await admin.from("demo_accounts").insert({
            auth_user_id: credential.userId,
            tenant_id: tenantId,
            role: "staff",
            email: credential.email,
            name: credential.name,
            status: "active",
          });
          if (error) throw error;
        }
      } catch (error) {
        for (const credential of credentials) {
          await admin.from("users").delete().eq("id", credential.userId);
          await admin.auth.admin.deleteUser(credential.userId).catch(() => undefined);
        }
        throw error;
      }

      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "add_demo_staff",
        entityType: "demo_tenant",
        entityId: tenantId,
        metadata: { count, isDemo: true },
      });
      return jsonResponse({ credentials });
    }

    if (action === "deactivate_demo_tenant" || action === "reactivate_demo_tenant") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const tenantId = cleanText(body.tenantId, 100);
      if (!tenantId) return jsonResponse({ error: "Demo sandbox is required." }, 400);
      const isReactivate = action === "reactivate_demo_tenant";
      const durationHours = Math.trunc(Number(body.durationHours ?? 24));
      if (isReactivate && (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 2_160)) {
        return jsonResponse({ error: "Renewed demo access must last between 1 hour and 90 days." }, 400);
      }
      const tenant = await getDemoTenant(admin, tenantId);
      const expiresAt = isReactivate
        ? new Date(Date.now() + durationHours * 3_600_000).toISOString()
        : tenant.expires_at;
      await setDemoTenantState(admin, tenant, isReactivate ? "active" : "deactivated", {
        expiresAt,
        actorId: authData.user.id,
      });
      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action,
        entityType: "demo_tenant",
        entityId: tenantId,
        metadata: { expiresAt, isDemo: true },
      });
      return jsonResponse({ updated: true, status: isReactivate ? "active" : "deactivated", expiresAt });
    }

    if (action === "reset_demo_password") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const userId = cleanText(body.userId, 100);
      const { data: account, error: accountError } = await admin.from("demo_accounts")
        .select("auth_user_id,tenant_id,role,email,name,status")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return jsonResponse({ error: "Demo account was not found." }, 404);
      await getActiveDemoTenant(admin, String(account.tenant_id));
      const password = generateDemoPassword();
      const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
        password,
        ban_duration: "none",
      });
      if (passwordError) throw passwordError;
      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "reset_demo_password",
        entityType: "demo_account",
        entityId: userId,
        metadata: { tenantId: account.tenant_id, role: account.role, isDemo: true },
      });
      return jsonResponse({
        credentials: [{
          userId,
          role: account.role,
          name: account.name,
          email: account.email,
          password,
        }],
      });
    }

    if (action === "update_account") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const userId = cleanText(body.userId, 100);
      const target = await getUserProfile(admin, userId);
      if (!target) return jsonResponse({ error: "Account was not found." }, 404);
      if (target.isDemo) {
        return jsonResponse({ error: "Manage demo accounts from the auditor Demo Management page." }, 403);
      }

      const { data: targetAuthResult, error: targetAuthError } =
        await admin.auth.admin.getUserById(userId);
      if (targetAuthError || !targetAuthResult.user) {
        return jsonResponse({ error: targetAuthError?.message || "Authentication account was not found." }, 404);
      }
      const currentEmail = cleanText(targetAuthResult.user.email || target.email, 254).toLowerCase();
      const email = cleanText(body.email || currentEmail, 254).toLowerCase();
      const name = cleanText(body.name || target.name, 120);
      const phone = cleanText(body.phone ?? target.phone ?? target.number, 40);
      const role = cleanText(body.role || target.role, 30).toLowerCase();
      const accountStatus = cleanText(body.accountStatus || target.accountStatus || "active", 20).toLowerCase();
      const accountStatusReason = cleanText(body.accountStatusReason, 500);
      const storeId = cleanText(body.storeId, 100);
      const isPermanentAuditor = currentEmail === PERMANENT_AUDITOR_EMAIL;

      if (!email || !email.includes("@") || !name) {
        return jsonResponse({ error: "A valid name and email are required." }, 400);
      }
      if (!MANAGED_ROLES.has(role) || !ACCOUNT_STATUSES.has(accountStatus)) {
        return jsonResponse({ error: "Select a valid role and account status." }, 400);
      }
      if (["staff", "store_owner"].includes(role) && !storeId) {
        return jsonResponse({ error: "Select the store assigned to this staff member or store owner." }, 400);
      }
      if (userId === authData.user.id && (role !== target.role || accountStatus !== "active")) {
        return jsonResponse({ error: "You cannot change your own role or restrict your own account." }, 400);
      }
      if (
        isPermanentAuditor &&
        (email !== PERMANENT_AUDITOR_EMAIL || role !== "auditor" || accountStatus !== "active")
      ) {
        return jsonResponse({ error: "The permanent auditor cannot be renamed by email, demoted, suspended, or banned." }, 403);
      }

      let selectedStore: any = null;
      if (storeId) {
        const { data, error } = await admin.from("stores").select("id,data").eq("id", storeId).maybeSingle();
        if (error) throw error;
        if (!data) return jsonResponse({ error: "The selected store was not found." }, 404);
        selectedStore = data;
      }
      if (role === "staff") {
        await assertStaffSlotAvailable(admin, storeId, userId);
      }

      const authPatch: Record<string, unknown> = {
        ban_duration: accountStatus === "banned" ? "876000h" : "none",
        user_metadata: {
          ...(targetAuthResult.user.user_metadata || {}),
          full_name: name,
          name,
        },
      };
      if (email !== currentEmail) {
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, authPatch);
      if (authUpdateError) throw authUpdateError;

      const previousRole = cleanText(target.role, 30);
      const previousStoreId = cleanText(target.storeId, 100);
      const nextProfile: Record<string, unknown> = {
        ...target,
        email,
        name,
        phone,
        number: phone,
        role,
        accountStatus,
        accountStatusReason: accountStatus === "active" ? "" : accountStatusReason,
        accountStatusUpdatedAt: timestamp(),
        accountStatusUpdatedBy: authData.user.id,
        updatedAt: timestamp(),
      };
      if (role === "staff" || role === "store_owner") nextProfile.storeId = storeId;
      else delete nextProfile.storeId;

      const { error: profileUpdateError } = await admin.from("users")
        .update({ data: nextProfile }).eq("id", userId);
      if (profileUpdateError) throw profileUpdateError;

      if (previousRole === "store_owner" && (role !== "store_owner" || previousStoreId !== storeId)) {
        const { data: ownedStores, error: ownedStoresError } = await admin
          .from("stores").select("id,data").eq("data->>ownerId", userId);
        if (ownedStoresError) throw ownedStoresError;
        for (const ownedStore of ownedStores || []) {
          if (role === "store_owner" && String(ownedStore.id) === storeId) continue;
          const { error } = await admin.from("stores").update({
            data: { ...ownedStore.data, ownerId: "", updatedAt: timestamp() },
          }).eq("id", ownedStore.id);
          if (error) throw error;
        }
      }
      if (role === "store_owner" && selectedStore) {
        const { error: ownerAssignError } = await admin.from("stores").update({
          data: { ...selectedStore.data, ownerId: userId, updatedAt: timestamp() },
        }).eq("id", storeId);
        if (ownerAssignError) throw ownerAssignError;
      }

      if (role === "customer") {
        const { error: customerError } = await admin.from("customers").upsert({
          id: userId,
          data: {
            email,
            name,
            phone,
            number: phone,
            avatarUrl: cleanText(target.avatarUrl || target.photoURL, 2000),
            updatedAt: timestamp(),
          },
        });
        if (customerError) throw customerError;
      } else if (previousRole === "customer") {
        const { error: customerDeleteError } = await admin.from("customers").delete().eq("id", userId);
        if (customerDeleteError) throw customerDeleteError;
      }

      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "update_account",
        entityType: "user",
        entityId: userId,
        metadata: {
          previousRole,
          role,
          previousStoreId,
          storeId: role === "staff" || role === "store_owner" ? storeId : null,
          accountStatus,
        },
      });

      return jsonResponse({
        account: {
          id: userId,
          email,
          name,
          phone,
          role,
          accountStatus,
          accountStatusReason: accountStatus === "active" ? "" : accountStatusReason,
          storeId: role === "staff" || role === "store_owner" ? storeId : "",
          storeName: cleanText(selectedStore?.data?.businessName || selectedStore?.data?.name, 160),
          lastAccessedAt: targetAuthResult.user.last_sign_in_at || null,
          isPermanentAuditor,
        },
      });
    }

    if (action === "get_audit_overview") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const { data, error } = await admin.rpc("get_auditor_audit_overview");
      if (error) throw error;
      if (!data || typeof data !== "object") {
        throw new Error("Audit overview returned an invalid response.");
      }
      return jsonResponse(data);
    }

    if (action === "list_audit_records") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const section = cleanText(body.section, 30).toLowerCase();
      const search = cleanText(body.search, 160).toLowerCase();
      const status = cleanText(body.status, 40).toLowerCase() || "all";
      const page = Math.max(1, Math.trunc(Number(body.page) || 1));
      const pageSize = Math.max(10, Math.min(100, Math.trunc(Number(body.pageSize) || 25)));
      if (!["financial", "receipts", "loyalty", "events"].includes(section)) {
        return jsonResponse({ error: "Select a valid audit section." }, 400);
      }
      const auditTableBySection: Record<string, string> = {
        financial: "billing_invoices",
        receipts: "billing_notifications",
        loyalty: "promotions_scanned",
        events: "audit_events",
      };
      let resolvedSearch = search;
      if (/^[A-Z]{3}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(search.toUpperCase())) {
        const { data: matchedReference, error: referenceError } = await admin
          .from(auditTableBySection[section])
          .select("id")
          .eq("public_id", search.toUpperCase())
          .maybeSingle();
        if (referenceError) throw referenceError;
        if (matchedReference?.id) resolvedSearch = String(matchedReference.id).toLowerCase();
      }
      const { data, error } = await admin.rpc("list_auditor_audit_records", {
        p_section: section,
        p_search: resolvedSearch,
        p_status: status,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      if (!data || typeof data !== "object") {
        throw new Error("Audit records returned an invalid response.");
      }
      const response = data as { records?: Array<Record<string, unknown>> };
      const records = Array.isArray(response.records) ? response.records : [];
      const recordIds = records.map((record) => String(record.id || "")).filter(Boolean);
      if (!recordIds.length) return jsonResponse(data);
      const { data: references, error: referencesError } = await admin
        .from(auditTableBySection[section])
        .select("id,public_id")
        .in("id", recordIds);
      if (referencesError) throw referencesError;
      const publicIds = new Map((references || []).map((row) => [String(row.id), String(row.public_id || "")]));
      return jsonResponse({
        ...response,
        records: records.map((record) => ({
          ...record,
          public_id: publicIds.get(String(record.id || "")) || null,
        })),
      });
    }

    if (action === "get_system_health") {
      if (actor.role !== "auditor") return jsonResponse({ error: "Auditor access required." }, 403);
      const now = new Date();
      const [
        usersResult,
        storesResult,
        openErrorsResult,
        failedWebhooksResult,
        failedNotificationsResult,
        queuedNotificationsResult,
        overdueInvoicesResult,
        latestInvoiceResult,
        latestWebhookResult,
        authResult,
        gasEmailDiagnosticsResult,
      ] = await Promise.all([
        admin.from("users").select("id", { count: "exact", head: true })
          .or("data->>isDemo.is.null,data->>isDemo.eq.false"),
        admin.from("stores").select("id", { count: "exact", head: true })
          .or("data->>isDemo.is.null,data->>isDemo.eq.false"),
        admin.from("client_error_reports").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        admin.from("paymongo_webhook_events").select("event_id", { count: "exact", head: true }).eq("status", "failed"),
        admin.from("billing_notifications").select("id", { count: "exact", head: true }).eq("status", "failed"),
        admin.from("billing_notifications")
          .select("id,status,next_attempt_at", { count: "exact" })
          .in("status", ["pending", "failed", "sending"])
          .order("next_attempt_at", { ascending: true })
          .limit(1),
        admin.from("billing_invoices").select("id", { count: "exact", head: true }).in("status", ["pending", "link_created"]).lt("due_at", now.toISOString()),
        admin.from("billing_invoices").select("id,status,updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("paymongo_webhook_events").select("event_id,status,received_at,processed_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
        admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
        getGasEmailDiagnostics(),
      ]);
      const queryResults = [
        usersResult,
        storesResult,
        openErrorsResult,
        failedWebhooksResult,
        failedNotificationsResult,
        queuedNotificationsResult,
        overdueInvoicesResult,
        latestInvoiceResult,
        latestWebhookResult,
      ];
      const databaseError = queryResults.find((result: any) => result.error)?.error;
      const queuedEmailCount = queuedNotificationsResult.count || 0;
      const remainingEmailQuota = gasEmailDiagnosticsResult.remainingDailyRecipientQuota;
      const nextQueuedAttempt = queuedNotificationsResult.data?.[0]?.next_attempt_at || "";
      const emailCapacityStatus = gasEmailDiagnosticsResult.error || remainingEmailQuota === null
        ? "warning"
        : remainingEmailQuota <= 10
        ? "warning"
        : "healthy";
      const checks = [
        {
          id: "database",
          name: "Database",
          status: databaseError ? "critical" : "healthy",
          value: databaseError ? "Query failed" : `${usersResult.count || 0} accounts · ${storesResult.count || 0} stores`,
          detail: databaseError?.message || "Core account and store tables responded successfully.",
          checkedAt: now.toISOString(),
        },
        {
          id: "authentication",
          name: "Authentication",
          status: authResult.error ? "critical" : "healthy",
          value: authResult.error ? "Unavailable" : "Operational",
          detail: authResult.error?.message || "Supabase Auth admin API responded successfully.",
          checkedAt: now.toISOString(),
        },
        {
          id: "billing",
          name: "Subscription billing",
          status: (overdueInvoicesResult.count || 0) > 0 ? "warning" : "healthy",
          value: `${overdueInvoicesResult.count || 0} overdue`,
          detail: latestInvoiceResult.data
            ? `Latest invoice activity: ${latestInvoiceResult.data.updated_at}.`
            : "No invoices have been issued yet.",
          checkedAt: now.toISOString(),
        },
        {
          id: "paymongo_webhooks",
          name: "PayMongo webhooks",
          status: (failedWebhooksResult.count || 0) > 0 ? "critical" : "healthy",
          value: `${failedWebhooksResult.count || 0} failed`,
          detail: latestWebhookResult.data
            ? `Latest event: ${latestWebhookResult.data.status} at ${latestWebhookResult.data.received_at}.`
            : "No webhook events received yet.",
          checkedAt: now.toISOString(),
        },
        {
          id: "notifications",
          name: "Billing email and receipts",
          status: (failedNotificationsResult.count || 0) > 0 ? "warning" : "healthy",
          value: `${failedNotificationsResult.count || 0} failed`,
          detail: "Tracks payment reminders, confirmations, and receipt delivery.",
          checkedAt: now.toISOString(),
        },
        {
          id: "gas_email_capacity",
          name: "GAS email quota & queue",
          status: emailCapacityStatus,
          value: remainingEmailQuota === null
            ? `${queuedEmailCount} queued · quota unavailable`
            : `${remainingEmailQuota} left today · ${queuedEmailCount} queued`,
          detail: gasEmailDiagnosticsResult.error
            ? `GAS quota check failed: ${gasEmailDiagnosticsResult.error}`
            : remainingEmailQuota === 0 && queuedEmailCount > 0
            ? `Quota is exhausted. Messages remain queued and the hourly worker will retry them${nextQueuedAttempt ? ` after ${nextQueuedAttempt}` : ""}.`
            : queuedEmailCount > 0
            ? `Queued messages will be attempted by the hourly billing worker${nextQueuedAttempt ? ` at or after ${nextQueuedAttempt}` : ""}.`
            : "Google Apps Script recipient capacity is available and the billing email queue is empty.",
          checkedAt: gasEmailDiagnosticsResult.checkedAt || now.toISOString(),
        },
        {
          id: "client_errors",
          name: "Client diagnostics",
          status: (openErrorsResult.count || 0) > 0 ? "warning" : "healthy",
          value: `${openErrorsResult.count || 0} unresolved`,
          detail: "Open and in-progress client error reports.",
          checkedAt: now.toISOString(),
        },
      ];
      return jsonResponse({
        checks,
        overall: checks.some((check) => check.status === "critical")
          ? "critical"
          : checks.some((check) => check.status === "warning")
          ? "warning"
          : "healthy",
        generatedAt: now.toISOString(),
      });
    }

    if (action === "list_public_engagement") {
      if (!actorCanReview) return jsonResponse({ error: "Admin access required." }, 403);

      const [feedbackResult, newsletterResult, errorReportsResult] = await Promise.all([
        admin
          .from("site_feedback_submissions")
          .select("id,public_id,name,email,category,message,reference_number,status,public_response,internal_notes,created_at,status_updated_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        admin
          .from("newsletter_subscribers")
          .select("id,email,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        admin
          .from("client_error_reports")
          .select("id,public_id,error_code,status,message,stack_trace,page_url,route,user_agent,app_version,context,reporter_user_id,reporter_role,internal_notes,created_at,status_updated_at,updated_at,resolved_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      if (feedbackResult.error) throw feedbackResult.error;
      if (newsletterResult.error) throw newsletterResult.error;
      if (errorReportsResult.error) throw errorReportsResult.error;

      return jsonResponse({
        feedback: (feedbackResult.data || []).map((row) => ({
          id: row.id,
          publicId: row.public_id,
          name: row.name || "",
          email: row.email || "",
          category: row.category,
          message: row.message,
          referenceNumber: row.public_id,
          legacyReferenceNumber: row.reference_number,
          status: row.status,
          publicResponse: row.public_response || "",
          internalNotes: row.internal_notes || "",
          createdAt: row.created_at,
          statusUpdatedAt: row.status_updated_at,
          updatedAt: row.updated_at,
        })),
        subscribers: newsletterResult.data || [],
        errorReports: (errorReportsResult.data || []).map((row) => ({
          id: row.id,
          publicId: row.public_id,
          errorCode: row.error_code,
          status: row.status,
          message: row.message,
          stack: row.stack_trace || "",
          pageUrl: row.page_url || "",
          route: row.route || "",
          userAgent: row.user_agent || "",
          appVersion: row.app_version || "",
          context: row.context || {},
          reporterUserId: row.reporter_user_id || "",
          reporterRole: row.reporter_role || "",
          internalNotes: row.internal_notes || "",
          createdAt: row.created_at,
          statusUpdatedAt: row.status_updated_at,
          updatedAt: row.updated_at,
          resolvedAt: row.resolved_at || "",
        })),
      });
    }

    if (action === "update_public_feedback") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const feedbackId = cleanText(body.feedbackId, 100);
      const status = cleanText(body.status, 30).toLowerCase();
      const publicResponse = cleanText(body.publicResponse, 2000);
      const internalNotes = cleanText(body.internalNotes, 4000);
      if (!feedbackId || !["received", "reviewing", "planned", "in_progress", "resolved", "closed"].includes(status)) {
        return jsonResponse({ error: "A feedback record and valid status are required." }, 400);
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("site_feedback_submissions")
        .update({
          status,
          public_response: publicResponse || null,
          internal_notes: internalNotes || null,
          status_updated_at: now,
          updated_at: now,
        })
        .eq("id", feedbackId)
        .select("id,status,public_response,internal_notes,status_updated_at,updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "Feedback was not found." }, 404);

      return jsonResponse({
        feedback: {
          id: data.id,
          status: data.status,
          publicResponse: data.public_response || "",
          internalNotes: data.internal_notes || "",
          statusUpdatedAt: data.status_updated_at,
          updatedAt: data.updated_at,
        },
      });
    }

    if (action === "update_error_report") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const reportId = cleanText(body.reportId, 100);
      const status = cleanText(body.status, 30).toLowerCase();
      const internalNotes = cleanText(body.internalNotes, 4000);
      if (!reportId || !["open", "in_progress", "fixed"].includes(status)) {
        return jsonResponse({ error: "An error report and valid status are required." }, 400);
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("client_error_reports")
        .update({
          status,
          internal_notes: internalNotes || null,
          status_updated_at: now,
          updated_at: now,
          resolved_at: status === "fixed" ? now : null,
          resolved_by: status === "fixed" ? authData.user.id : null,
        })
        .eq("id", reportId)
        .select("id,status,internal_notes,status_updated_at,updated_at,resolved_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "Error report was not found." }, 404);

      return jsonResponse({
        errorReport: {
          id: data.id,
          status: data.status,
          internalNotes: data.internal_notes || "",
          statusUpdatedAt: data.status_updated_at,
          updatedAt: data.updated_at,
          resolvedAt: data.resolved_at || "",
        },
      });
    }

    if (action === "list_billing_invoices") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);

      const page = Math.max(1, Math.trunc(Number(body.page) || 1));
      const pageSize = Math.max(10, Math.min(100, Math.trunc(Number(body.pageSize) || 25)));
      const statusFilter = cleanText(body.status, 20).toLowerCase() || "all";
      const statusGroups: Record<string, string[]> = {
        outstanding: ["pending", "link_created"],
        paid: ["paid"],
        failed: ["failed"],
        closed: ["expired", "void"],
      };
      if (statusFilter !== "all" && !statusGroups[statusFilter]) {
        return jsonResponse({ error: "Select a valid invoice status filter." }, 400);
      }

      const invoiceColumns = [
        "id",
        "public_id",
        "subscription_id",
        "store_id",
        "owner_user_id",
        "invoice_type",
        "status",
        "created_at",
        "due_at",
        "period_start",
        "period_end",
        "amount_centavos",
        "currency",
        "payment_url",
        "paymongo_reference_number",
        "manual_payment_reference",
        "livemode",
        "paid_at",
        "payment_method",
        "paymongo_payment_id",
        "gross_amount_centavos",
        "fee_centavos",
        "net_amount_centavos",
        "last_error",
      ].join(",");
      let invoiceQuery = admin
        .from("billing_invoices")
        .select(invoiceColumns, { count: "exact" })
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") invoiceQuery = invoiceQuery.in("status", statusGroups[statusFilter]);

      const from = (page - 1) * pageSize;
      const invoiceResult = await invoiceQuery.range(from, from + pageSize - 1);
      if (invoiceResult.error) throw invoiceResult.error;
      const invoiceRows = invoiceResult.data || [];

      const storeIds = [...new Set(invoiceRows.map((row: any) => String(row.store_id)))];
      const subscriptionIds = [...new Set(invoiceRows.map((row: any) => String(row.subscription_id)))];
      const [storesResult, subscriptionsResult, totalResult, paidResult, outstandingResult, failedResult] = await Promise.all([
        storeIds.length
          ? admin.from("stores").select("id,data").in("id", storeIds)
          : Promise.resolve({ data: [], error: null }),
        subscriptionIds.length
          ? admin.from("billing_subscriptions")
            .select("id,billing_email,plan_id,interval_days,grace_period_days")
            .in("id", subscriptionIds)
          : Promise.resolve({ data: [], error: null }),
        admin.from("billing_invoices").select("id", { count: "exact", head: true }),
        admin.from("billing_invoices").select("id", { count: "exact", head: true }).eq("status", "paid"),
        admin.from("billing_invoices").select("id", { count: "exact", head: true }).in("status", statusGroups.outstanding),
        admin.from("billing_invoices").select("id", { count: "exact", head: true }).eq("status", "failed"),
      ]);
      if (storesResult.error) throw storesResult.error;
      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (totalResult.error) throw totalResult.error;
      if (paidResult.error) throw paidResult.error;
      if (outstandingResult.error) throw outstandingResult.error;
      if (failedResult.error) throw failedResult.error;

      const storesById = new Map((storesResult.data || []).map((row: any) => [String(row.id), row.data || {}]));
      const subscriptionsById = new Map(
        (subscriptionsResult.data || []).map((row: any) => [String(row.id), row]),
      );

      return jsonResponse({
        invoices: invoiceRows.map((invoice: any) => {
          const store = storesById.get(String(invoice.store_id)) || {};
          const subscription = subscriptionsById.get(String(invoice.subscription_id)) || {};
          return {
            ...invoice,
            business: {
              name: cleanText(store.businessName || store.name, 160) || "PerkUp merchant",
              address: cleanText(store.address || store.location, 300) || null,
              contact: cleanText(store.contact || store.contactNumber || store.phone, 100) || null,
            },
            subscription: {
              billing_email: subscription.billing_email || null,
              plan_id: subscription.plan_id || cleanText(store.subscriptionLevel, 80) || null,
              interval_days: subscription.interval_days || Number(store.billingIntervalDays) || null,
              grace_period_days: subscription.grace_period_days ?? null,
            },
          };
        }),
        page,
        pageSize,
        total: invoiceResult.count || 0,
        summary: {
          total: totalResult.count || 0,
          paid: paidResult.count || 0,
          outstanding: outstandingResult.count || 0,
          failed: failedResult.count || 0,
        },
      });
    }

    if (action === "get_subscription_upgrade_options") {
      if (cleanText(actor.role, 30) !== "store_owner") {
        return jsonResponse({ error: "Store-owner access required." }, 403);
      }
      if (Deno.env.get("SUBSCRIPTION_UPGRADES_ENABLED") !== "true") {
        return jsonResponse({
          enabled: false,
          currentPlan: null,
          eligiblePlans: [],
          pendingChange: null,
          blockedReason: "Subscription upgrades are not available yet.",
        });
      }

      const storeId = cleanText(body.storeId, 100);
      if (!storeId) return jsonResponse({ error: "Store is required." }, 400);
      const upgradeState = await loadSubscriptionUpgradeState(
        admin,
        storeId,
        authData.user.id,
      );
      return jsonResponse({
        enabled: true,
        currentPlan: upgradeState.currentPlan,
        eligiblePlans: upgradeState.eligiblePlans,
        pendingChange: upgradeState.pendingChange,
        blockedReason: upgradeState.blockedReason,
      });
    }

    if (action === "quote_subscription_upgrade") {
      if (cleanText(actor.role, 30) !== "store_owner") {
        return jsonResponse({ error: "Store-owner access required." }, 403);
      }
      if (Deno.env.get("SUBSCRIPTION_UPGRADES_ENABLED") !== "true") {
        return jsonResponse({
          error: "Subscription upgrades are not available yet.",
          code: "SUBSCRIPTION_UPGRADES_DISABLED",
        }, 409);
      }

      const storeId = cleanText(body.storeId, 100);
      const targetPlanId = cleanText(body.targetPlanId, 80).toLocaleLowerCase();
      if (!storeId || !targetPlanId) {
        return jsonResponse({ error: "Store and target plan are required." }, 400);
      }
      const upgradeState = await loadSubscriptionUpgradeState(
        admin,
        storeId,
        authData.user.id,
      );
      if (upgradeState.blockedReason) {
        return jsonResponse({ error: upgradeState.blockedReason }, 409);
      }
      const quote = await quoteSubscriptionUpgrade(upgradeState, targetPlanId);
      return jsonResponse({ quote });
    }

    if (action === "confirm_subscription_upgrade") {
      if (cleanText(actor.role, 30) !== "store_owner") {
        return jsonResponse({ error: "Store-owner access required." }, 403);
      }
      if (Deno.env.get("SUBSCRIPTION_UPGRADES_ENABLED") !== "true") {
        return jsonResponse({
          error: "Subscription upgrades are not available yet.",
          code: "SUBSCRIPTION_UPGRADES_DISABLED",
        }, 409);
      }

      const storeId = cleanText(body.storeId, 100);
      const targetPlanId = cleanText(body.targetPlanId, 80).toLocaleLowerCase();
      const termsVersion = cleanText(body.termsVersion, 80);
      const quoteFingerprint = cleanText(body.quoteFingerprint, 128).toLocaleLowerCase();
      if (
        !storeId
        || !targetPlanId
        || body.termsAccepted !== true
        || termsVersion !== SUBSCRIPTION_UPGRADE_TERMS_VERSION
        || !/^[a-f0-9]{64}$/.test(quoteFingerprint)
      ) {
        return jsonResponse({
          error: "Review all current upgrade terms and acknowledge them before confirming.",
        }, 400);
      }

      const upgradeState = await loadSubscriptionUpgradeState(
        admin,
        storeId,
        authData.user.id,
      );
      if (upgradeState.blockedReason) {
        return jsonResponse({ error: upgradeState.blockedReason }, 409);
      }
      const quote = await quoteSubscriptionUpgrade(upgradeState, targetPlanId);
      if (quote.quoteFingerprint !== quoteFingerprint) {
        return jsonResponse({
          error: "The plan price or renewal timing changed. Review the refreshed terms before confirming.",
          code: "STALE_UPGRADE_QUOTE",
          quote,
        }, 409);
      }

      const { data: change, error: changeError } = await admin.rpc(
        "confirm_subscription_upgrade",
        {
          p_store_id: storeId,
          p_owner_user_id: authData.user.id,
          p_from_plan_snapshot: quote.currentPlan,
          p_to_plan_snapshot: quote.targetPlan,
          p_current_amount_centavos: quote.currentPlan.priceCentavos,
          p_target_amount_centavos: quote.targetPlan.priceCentavos,
          p_target_period_start: quote.targetRenewal.periodStart,
          p_target_period_end: quote.targetRenewal.periodEnd,
          p_terms_version: quote.termsVersion,
          p_quote_fingerprint: quote.quoteFingerprint,
        },
      );
      if (changeError) {
        if (["23505", "40001"].includes(String(changeError.code))) {
          return jsonResponse({
            error: "The subscription changed before confirmation. Request and review a new quote.",
            code: "STALE_UPGRADE_QUOTE",
          }, 409);
        }
        throw changeError;
      }

      return jsonResponse({
        updated: true,
        change,
        quote: {
          fromPlanId: quote.currentPlan.id,
          toPlanId: quote.targetPlan.id,
          targetPeriodStart: quote.targetRenewal.periodStart,
          termsVersion: quote.termsVersion,
          quoteFingerprint: quote.quoteFingerprint,
        },
      });
    }

    if (action === "cancel_subscription_upgrade") {
      if (cleanText(actor.role, 30) !== "store_owner") {
        return jsonResponse({ error: "Store-owner access required." }, 403);
      }
      if (Deno.env.get("SUBSCRIPTION_UPGRADES_ENABLED") !== "true") {
        return jsonResponse({
          error: "Subscription upgrades are not available yet.",
          code: "SUBSCRIPTION_UPGRADES_DISABLED",
        }, 409);
      }

      const planChangeId = cleanText(body.planChangeId, 100);
      if (!planChangeId) return jsonResponse({ error: "Scheduled upgrade is required." }, 400);
      const { data: change, error: changeError } = await admin.rpc(
        "cancel_subscription_upgrade",
        {
          p_plan_change_id: planChangeId,
          p_owner_user_id: authData.user.id,
          p_cancelled_by: authData.user.id,
          p_reason: "Client cancelled the scheduled upgrade.",
        },
      );
      if (changeError) {
        const status = ["23514", "55000"].includes(String(changeError.code)) ? 409 : 500;
        return jsonResponse({
          error: changeError.message || "The scheduled upgrade could not be cancelled.",
        }, status);
      }
      return jsonResponse({ updated: true, change });
    }

    if (action === "admin_cancel_subscription_upgrade") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      if (Deno.env.get("SUBSCRIPTION_UPGRADES_ENABLED") !== "true") {
        return jsonResponse({
          error: "Subscription upgrades are not available yet.",
          code: "SUBSCRIPTION_UPGRADES_DISABLED",
        }, 409);
      }

      const planChangeId = cleanText(body.planChangeId, 100);
      const reason = cleanText(body.reason, 500);
      if (!planChangeId || reason.length < 10) {
        return jsonResponse({
          error: "A scheduled upgrade and cancellation reason of at least 10 characters are required.",
        }, 400);
      }
      const { data: existingChange, error: existingChangeError } = await admin
        .from("subscription_plan_changes")
        .select("id,owner_user_id")
        .eq("id", planChangeId)
        .maybeSingle();
      if (existingChangeError) throw existingChangeError;
      if (!existingChange) return jsonResponse({ error: "Scheduled upgrade was not found." }, 404);

      const { data: change, error: changeError } = await admin.rpc(
        "cancel_subscription_upgrade",
        {
          p_plan_change_id: planChangeId,
          p_owner_user_id: existingChange.owner_user_id,
          p_cancelled_by: authData.user.id,
          p_reason: reason,
        },
      );
      if (changeError) {
        const status = ["23514", "55000"].includes(String(changeError.code)) ? 409 : 500;
        return jsonResponse({
          error: changeError.message || "The scheduled upgrade could not be cancelled.",
        }, status);
      }
      return jsonResponse({ updated: true, change, reason });
    }

    if (action === "sync_subscription_billing") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      const { data: selectedStore, error: selectedStoreError } = await admin
        .from("stores").select("id,data").eq("id", storeId).maybeSingle();
      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) return jsonResponse({ error: "Store was not found." }, 404);
      const ownerId = cleanText(selectedStore.data?.ownerId, 100);
      const primaryStore = ownerId ? await getPrimaryStoreForOwner(admin, ownerId) : selectedStore;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const billingSubscription = await syncBillingSubscription(admin, primaryStore);
      return jsonResponse({ updated: true, storeId: primaryStore.id, billingSubscription });
    }

    if (action === "cancel_subscription_auto_renewal") {
      if (cleanText(actor.role, 30) !== "store_owner") {
        return jsonResponse({ error: "Store-owner access required." }, 403);
      }
      const storeId = cleanText(body.storeId, 100);
      if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

      const { data: ownedStore, error: ownedStoreError } = await admin
        .from("stores")
        .select("id,data")
        .eq("id", storeId)
        .eq("data->>ownerId", authData.user.id)
        .maybeSingle();
      if (ownedStoreError) throw ownedStoreError;
      if (!ownedStore) return jsonResponse({ error: "The primary store was not found for this owner." }, 404);

      const primaryStore = await getPrimaryStoreForOwner(admin, authData.user.id);
      if (!primaryStore || primaryStore.id !== ownedStore.id) {
        return jsonResponse({ error: "Automatic renewal can only be cancelled from the primary store." }, 409);
      }

      const { data: subscription, error: subscriptionError } = await admin
        .from("billing_subscriptions")
        .select("id,initial_payment_required")
        .eq("store_id", primaryStore.id)
        .eq("owner_user_id", authData.user.id)
        .maybeSingle();
      if (subscriptionError) throw subscriptionError;
      if (!subscription) return jsonResponse({ error: "Billing subscription was not found." }, 404);
      if (subscription.initial_payment_required === true) {
        return jsonResponse({ error: "Complete the initial subscription payment before cancelling automatic renewal." }, 409);
      }

      const { data: cancellation, error: cancellationError } = await admin.rpc(
        "cancel_subscription_auto_renewal",
        {
          p_store_id: primaryStore.id,
          p_owner_user_id: authData.user.id,
        },
      );
      if (cancellationError) throw cancellationError;

      return jsonResponse({
        updated: true,
        storeId: primaryStore.id,
        cancellation,
      });
    }

    if (action === "retry_billing_invoice") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const invoiceId = cleanText(body.invoiceId, 100);
      if (!invoiceId) return jsonResponse({ error: "Invoice ID is required." }, 400);

      const { data: invoice, error: invoiceError } = await admin
        .from("billing_invoices")
        .select("id,status,paymongo_link_id")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) return jsonResponse({ error: "Billing invoice was not found." }, 404);
      if (["paid", "void", "expired"].includes(String(invoice.status))) {
        return jsonResponse({ error: "This invoice is already closed and cannot be retried." }, 400);
      }

      const nextStatus = invoice.paymongo_link_id ? "link_created" : "pending";
      const now = new Date().toISOString();
      const { error: retryError } = await admin.from("billing_invoices").update({
        status: nextStatus,
        next_attempt_at: now,
        last_error: null,
      }).eq("id", invoice.id);
      if (retryError) throw retryError;

      const { error: notificationRetryError } = await admin.from("billing_notifications").update({
        status: "pending",
        next_attempt_at: now,
        last_error: null,
      }).eq("invoice_id", invoice.id).eq("status", "failed");
      if (notificationRetryError) throw notificationRetryError;

      return jsonResponse({ updated: true, invoiceId: invoice.id, status: nextStatus });
    }

    if (action === "record_manual_invoice_payment") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const invoiceId = cleanText(body.invoiceId, 100);
      const paymentMethod = cleanText(body.paymentMethod, 30).toLowerCase();
      const paymentReference = cleanText(body.paymentReference, 100);
      const paidAtInput = cleanText(body.paidAt, 100);
      const paidAt = new Date(paidAtInput);
      const allowedMethods = ["bank_transfer", "cash", "gcash", "maya", "cheque", "other"];

      if (!invoiceId) return jsonResponse({ error: "Invoice ID is required." }, 400);
      if (!allowedMethods.includes(paymentMethod)) {
        return jsonResponse({ error: "Select a valid manual payment method." }, 400);
      }
      if (paymentReference.length < 3) {
        return jsonResponse({ error: "Enter the receipt or transaction reference (at least 3 characters)." }, 400);
      }
      if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 5 * 60_000) {
        return jsonResponse({ error: "Enter a valid paid date that is not in the future." }, 400);
      }

      const { data: invoice, error: invoiceError } = await admin
        .from("billing_invoices")
        .select("id,status")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) return jsonResponse({ error: "Billing invoice was not found." }, 404);
      if (invoice.status === "paid") {
        return jsonResponse({ error: "This invoice is already marked as paid." }, 409);
      }
      if (["void", "expired"].includes(String(invoice.status))) {
        return jsonResponse({ error: "A closed invoice cannot be marked as paid." }, 409);
      }

      const { data: duplicateReference, error: duplicateReferenceError } = await admin
        .from("billing_invoices")
        .select("id")
        .eq("manual_payment_reference", paymentReference)
        .neq("id", invoiceId)
        .limit(1)
        .maybeSingle();
      if (duplicateReferenceError) throw duplicateReferenceError;
      if (duplicateReference) {
        return jsonResponse({ error: "That manual payment reference is already attached to another invoice." }, 409);
      }

      const { data: fulfillment, error: fulfillmentError } = await admin.rpc(
        "fulfill_billing_invoice_manually",
        {
          p_invoice_id: invoiceId,
          p_payment_method: paymentMethod,
          p_payment_reference: paymentReference,
          p_paid_at: paidAt.toISOString(),
          p_recorded_by: authData.user.id,
        },
      );
      if (fulfillmentError) throw fulfillmentError;

      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "record_manual_invoice_payment",
        entityType: "billing_invoice",
        entityId: invoiceId,
        metadata: { paymentMethod, paymentReference, paidAt: paidAt.toISOString() },
      });
      return jsonResponse({ updated: true, fulfillment });
    }

    if (action === "update_subscription_access") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      const input = body.subscriptionAccess && typeof body.subscriptionAccess === "object"
        ? body.subscriptionAccess as Record<string, unknown>
        : {};
      const status = cleanText(input.status, 20).toLowerCase();
      if (!storeId || !["active", "warning", "grace", "frozen"].includes(status)) {
        return jsonResponse({ error: "A valid store and subscription access status are required." }, 400);
      }

      const gracePeriodDays = Math.trunc(Number(input.gracePeriodDays || 0));
      if (!Number.isFinite(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 365 || (status === "grace" && gracePeriodDays < 1)) {
        return jsonResponse({ error: "Grace period must be between 1 and 365 days when grace access is enabled." }, 400);
      }
      const { data: selectedStore, error: selectedStoreError } = await admin
        .from("stores")
        .select("id,data")
        .eq("id", storeId)
        .maybeSingle();
      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) return jsonResponse({ error: "Store was not found." }, 404);

      const ownerId = cleanText(selectedStore.data?.ownerId, 100);
      const primaryStore = ownerId ? await getPrimaryStoreForOwner(admin, ownerId) : selectedStore;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      if (primaryStore.data?.initialPaymentRequired === true && status !== "frozen") {
        return jsonResponse({ error: "This store is waiting for its initial PayMongo payment and must remain frozen until payment is confirmed." }, 409);
      }

      const now = new Date();
      const existingAccess = primaryStore.data?.subscriptionAccess && typeof primaryStore.data.subscriptionAccess === "object"
        ? primaryStore.data.subscriptionAccess as Record<string, unknown>
        : {};
      const subscriptionAccess = {
        ...existingAccess,
        status,
        warningMessage: cleanText(input.warningMessage, 500) || "Your PerkUp subscription is almost ending. Please settle your balance to avoid an interruption.",
        gracePeriodDays,
        graceStartedAt: status === "grace" ? now.toISOString() : "",
        graceEndsAt: status === "grace" ? new Date(now.getTime() + gracePeriodDays * 86_400_000).toISOString() : "",
        paymentInstructions: cleanText(input.paymentInstructions, 2000) || "Contact PerkUp support for payment instructions and send your proof of payment for verification.",
        paymentLink: cleanText(input.paymentLink, 2000),
        paymentContact: cleanText(input.paymentContact, 254) || "perkup.shop@youthserviceph.org",
        automationEnabled: input.automationEnabled === true,
        renewalMode: input.automationEnabled === true
          ? "automatic"
          : cleanText(existingAccess.renewalMode, 20) || "automatic",
        autoRenewCancelledAt: input.automationEnabled === true
          ? ""
          : cleanText(existingAccess.autoRenewCancelledAt, 100),
        warningLeadDays: Math.max(0, Math.min(365, Math.trunc(Number(input.warningLeadDays ?? 7) || 0))),
        updatedAt: now.toISOString(),
        updatedBy: authData.user.id,
      };
      const { error: updateError } = await admin.from("stores").update({
        data: { ...primaryStore.data, subscriptionAccess, updatedAt: timestamp() },
      }).eq("id", primaryStore.id);
      if (updateError) throw updateError;

      const billingSubscription = await syncBillingSubscription(admin, {
        ...primaryStore,
        data: { ...primaryStore.data, subscriptionAccess },
      });

      return jsonResponse({ updated: true, storeId: primaryStore.id, subscriptionAccess, billingSubscription });
    }

    if (action === "update_account_restriction") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const storeId = cleanText(body.storeId, 100);
      const input = body.accountRestriction && typeof body.accountRestriction === "object"
        ? body.accountRestriction as Record<string, unknown>
        : {};
      const status = cleanText(input.status, 20).toLowerCase();
      const reason = cleanText(input.reason, 500);
      const internalNote = cleanText(input.internalNote, 2000);
      if (!storeId || !["active", "suspended"].includes(status)) {
        return jsonResponse({ error: "A valid store and restriction status are required." }, 400);
      }
      if (status === "suspended" && !reason) {
        return jsonResponse({ error: "Add the message the store owner will see before suspending access." }, 400);
      }

      const { data: selectedStore, error: selectedStoreError } = await admin
        .from("stores").select("id,data").eq("id", storeId).maybeSingle();
      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) return jsonResponse({ error: "Store was not found." }, 404);
      const ownerId = cleanText(selectedStore.data?.ownerId, 100);
      const primaryStore = ownerId ? await getPrimaryStoreForOwner(admin, ownerId) : selectedStore;
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);

      const now = new Date().toISOString();
      const existing = primaryStore.data?.accountRestriction && typeof primaryStore.data.accountRestriction === "object"
        ? primaryStore.data.accountRestriction as Record<string, unknown>
        : {};
      const accountRestriction = {
        ...existing,
        status,
        reason: reason || cleanText(existing.reason, 500),
        internalNote: status === "suspended" ? internalNote : cleanText(existing.internalNote, 2000),
        suspendedAt: status === "suspended" ? now : cleanText(existing.suspendedAt, 100),
        suspendedBy: status === "suspended" ? authData.user.id : cleanText(existing.suspendedBy, 100),
        updatedAt: now,
        updatedBy: authData.user.id,
      };
      const { error: updateError } = await admin.from("stores").update({
        data: { ...primaryStore.data, accountRestriction, updatedAt: timestamp() },
      }).eq("id", primaryStore.id);
      if (updateError) throw updateError;
      return jsonResponse({ updated: true, storeId: primaryStore.id, accountRestriction });
    }

    if (action === "create_store") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = String(body.password || "");
      const name = cleanText(body.name, 80);
      const storeInput = body.store && typeof body.store === "object"
        ? body.store as Record<string, unknown>
        : {};
      const storeName = cleanText(storeInput.name, 120);
      const alreadyPaid = body.alreadyPaid === true;
      const requestedSubscriptionAccess = storeInput.subscriptionAccess && typeof storeInput.subscriptionAccess === "object"
        ? storeInput.subscriptionAccess as Record<string, unknown>
        : {};
      const automaticBillingEnabled = requestedSubscriptionAccess.automationEnabled === true;
      if (!email || !name || !storeName || !isStrongPassword(password, name, email)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, no spaces, and no owner name or email." }, 400);
      }
      await assertPasswordNotCompromised(password);
      if (!alreadyPaid && !automaticBillingEnabled) {
        return jsonResponse({ error: "Enable the PayMongo standard or mark the initial subscription as already paid before creating the store." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || "Owner account creation failed." }, 400);
      }

      const ownerId = created.user.id;
      const storeId = crypto.randomUUID();
      const profile = {
        email,
        name,
        role: "store_owner",
        storeId,
        branchLimit: Math.max(1, Math.min(100, Math.trunc(Number(storeInput.branchLimit || 1)))),
        forcePasswordReset: Boolean(body.forcePasswordReset),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const store: Record<string, unknown> = {
        ...storeInput,
        name: storeName,
        businessName: cleanText(storeInput.businessName, 120) || storeName,
        branchName: cleanText(storeInput.branchName, 80) || "Main",
        isPrimaryBranch: true,
        parentStoreId: storeId,
        ownerId,
        status: ["pending", "active", "suspended"].includes(String(storeInput.status))
          ? String(storeInput.status)
          : "pending",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const initialPaymentRequired = automaticBillingEnabled && !alreadyPaid;
      const initialPaymentAt = new Date();
      const billingIntervalDays = Math.max(1, Math.min(365, Math.trunc(Number(storeInput.billingIntervalDays ?? 30) || 30)));
      if (alreadyPaid) {
        store.subscriptionStart = initialPaymentAt.toISOString();
        store.subscriptionEnd = new Date(initialPaymentAt.getTime() + billingIntervalDays * 86_400_000).toISOString();
      }
      if (automaticBillingEnabled) {
        store.subscriptionAccess = {
          ...requestedSubscriptionAccess,
          status: initialPaymentRequired ? "frozen" : cleanText(requestedSubscriptionAccess.status, 20) || "active",
          paymentLink: "",
          graceStartedAt: "",
          graceEndsAt: "",
          updatedAt: new Date().toISOString(),
          updatedBy: initialPaymentRequired ? "initial-payment-gate" : authData.user.id,
        };
      }
      store.initialPaymentRequired = initialPaymentRequired;
      store.initialPaymentStatus = initialPaymentRequired ? "pending" : alreadyPaid ? "paid" : "waived";
      store.billingIntervalDays = billingIntervalDays;

      const { error: profileError } = await admin.from("users").insert({ id: ownerId, data: profile });
      if (profileError) {
        await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
        throw profileError;
      }
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) {
        await admin.from("users").delete().eq("id", ownerId);
        await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
        throw storeError;
      }

      let paidInitialInvoice: Record<string, unknown> | null = null;
      if ((store.subscriptionAccess as Record<string, unknown> | undefined)?.automationEnabled === true) {
        try {
          const billingSubscription = await syncBillingSubscription(admin, { id: storeId, data: store });
          if (initialPaymentRequired) {
            const periodStart = toIsoTimestamp(store.subscriptionStart);
            const periodEnd = toIsoTimestamp(store.subscriptionEnd);
            if (!billingSubscription?.id || !periodStart || !periodEnd) {
              throw new Error("The initial PayMongo invoice could not be prepared.");
            }
            const invoiceId = crypto.randomUUID();
            const dueAt = new Date().toISOString();
            const { error: invoiceError } = await admin.from("billing_invoices").insert({
              id: invoiceId,
              subscription_id: billingSubscription.id,
              store_id: storeId,
              owner_user_id: ownerId,
              invoice_type: "initial",
              period_start: periodStart,
              period_end: periodEnd,
              due_at: dueAt,
              amount_centavos: billingSubscription.amount_centavos,
              currency: billingSubscription.currency,
              status: "pending",
              next_attempt_at: dueAt,
            });
            if (invoiceError) throw invoiceError;

            let linkPersisted = false;
            try {
              const link = await createPayMongoPaymentLink({
                id: invoiceId,
                subscriptionId: billingSubscription.id,
                storeId,
                amountCentavos: billingSubscription.amount_centavos,
                currency: billingSubscription.currency,
                planId: cleanText(store.subscriptionLevel, 80),
              }, requiredEnv("PAYMONGO_SECRET_KEY"));
              const mode = (Deno.env.get("PAYMONGO_MODE") || "test").toLowerCase();
              if (mode !== "test" && mode !== "live") {
                throw new Error("PAYMONGO_MODE must be test or live.");
              }
              if ((mode === "live") !== link.livemode) {
                throw new Error("PayMongo payment mode does not match the configured billing mode.");
              }

              const { error: linkUpdateError } = await admin.from("billing_invoices").update({
                status: "link_created",
                paymongo_link_id: link.id,
                paymongo_reference_number: link.referenceNumber,
                payment_url: link.url,
                livemode: link.livemode,
                attempt_count: 1,
                next_attempt_at: dueAt,
                last_error: null,
              }).eq("id", invoiceId);
              if (linkUpdateError) throw linkUpdateError;
              linkPersisted = true;

              const existingAccess = store.subscriptionAccess && typeof store.subscriptionAccess === "object"
                ? store.subscriptionAccess as Record<string, unknown>
                : {};
              store.subscriptionAccess = {
                ...existingAccess,
                paymentLink: link.url,
                updatedAt: new Date().toISOString(),
                updatedBy: "admin-account-creation",
              };
              const { error: storeLinkError } = await admin.from("stores").update({ data: store }).eq("id", storeId);
              if (storeLinkError) throw storeLinkError;
            } catch (linkError) {
              const message = linkError instanceof Error ? linkError.message : "PayMongo link creation failed.";
              await admin.from("billing_invoices").update({
                status: linkPersisted ? "link_created" : "failed",
                attempt_count: 1,
                next_attempt_at: new Date(Date.now() + 10_000).toISOString(),
                last_error: message.slice(0, 1000),
              }).eq("id", invoiceId);
              console.error("Initial PayMongo link could not be created immediately", {
                invoiceId,
                storeId,
                error: message,
              });
            }
          } else if (alreadyPaid && billingSubscription?.id) {
            const invoiceId = crypto.randomUUID();
            const referenceNumber = `ADMIN-${invoiceId.slice(0, 8).toUpperCase()}`;
            const { error: invoiceError } = await admin.from("billing_invoices").insert({
              id: invoiceId,
              subscription_id: billingSubscription.id,
              store_id: storeId,
              owner_user_id: ownerId,
              invoice_type: "initial",
              period_start: store.subscriptionStart,
              period_end: store.subscriptionEnd,
              due_at: initialPaymentAt.toISOString(),
              amount_centavos: billingSubscription.amount_centavos,
              currency: billingSubscription.currency,
              status: "paid",
              paid_at: initialPaymentAt.toISOString(),
              payment_method: "admin_confirmed",
              gross_amount_centavos: billingSubscription.amount_centavos,
              paymongo_reference_number: referenceNumber,
              next_attempt_at: initialPaymentAt.toISOString(),
            });
            if (invoiceError) throw invoiceError;
            paidInitialInvoice = {
              invoiceId,
              storeName: store.businessName || store.name,
              planName: store.subscriptionLevel,
              amountCentavos: billingSubscription.amount_centavos,
              grossAmountCentavos: billingSubscription.amount_centavos,
              currency: billingSubscription.currency,
              dueAt: initialPaymentAt.toISOString(),
              paidAt: initialPaymentAt.toISOString(),
              renewedUntil: store.subscriptionEnd,
              paymentMethod: "admin_confirmed",
              referenceNumber,
              adminConfirmed: true,
              testMode: false,
            };
          }
        } catch (billingError) {
          await admin.from("stores").delete().eq("id", storeId);
          await admin.from("users").delete().eq("id", ownerId);
          await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
          throw billingError;
        }
      }

      const storeLogoFileId = extractDriveFileId(storeInput.logoUrl);
      if (storeLogoFileId) {
        const { error: ownershipError } = await admin
          .from("drive_files")
          .update({ owner_id: ownerId, purpose: "store-logo" })
          .eq("file_id", storeLogoFileId);
        if (ownershipError) {
          await admin.from("stores").delete().eq("id", storeId);
          await admin.from("users").delete().eq("id", ownerId);
          await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
          throw ownershipError;
        }
      }

      const applicationId = cleanText(body.applicationId, 100);
      if (applicationId) {
        const { data: applicationRow } = await admin
          .from("applications")
          .select("data")
          .eq("id", applicationId)
          .maybeSingle();
        if (applicationRow) {
          await admin.from("applications").update({
            data: {
              ...applicationRow.data,
              status: "approved",
              approvedStoreId: storeId,
              approvedAt: timestamp(),
            },
          }).eq("id", applicationId);
          const { data: applicationFile } = await admin
            .from("application_files")
            .select("file_id,url")
            .eq("application_id", applicationId)
            .maybeSingle();
          if (applicationFile) {
            await admin.from("drive_files").upsert({
              file_id: applicationFile.file_id,
              owner_id: ownerId,
              purpose: "store-logo",
              url: applicationFile.url,
            });
            await admin.from("application_files").delete().eq("file_id", applicationFile.file_id);
          }
        }
      }

      let notification = { sent: false, error: "" };
      let receiptNotification = { sent: false, error: "" };
      try {
        const ownerPortalUrl =
          `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/owner`;
        const { data: loginLinkData, error: loginLinkError } =
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: ownerPortalUrl },
          });
        if (loginLinkError || !loginLinkData.properties?.action_link) {
          throw loginLinkError || new Error("One-time owner login link could not be generated.");
        }

        await sendStoreCreatedEmail({
          recipientEmail: email,
          userName: name,
          store,
          requirePasswordChange: Boolean(body.forcePasswordReset),
          loginLink: loginLinkData.properties.action_link,
        });
        notification = { sent: true, error: "" };
      } catch (emailError) {
        notification.error = emailError instanceof Error ? emailError.message : "Store email could not be sent.";
        console.error("Store creation email failed", { storeId, ownerId, error: notification.error });
      }

      if (alreadyPaid) {
        try {
          const amountCentavos = Math.round(Number(store.owedAmount || 0) * 100);
          await sendSubscriptionPaymentReceivedEmail({
            recipientEmail: email,
            userName: name,
            invoice: paidInitialInvoice || {
              invoiceId: crypto.randomUUID(),
              storeName: store.businessName || store.name,
              planName: store.subscriptionLevel,
              amountCentavos,
              grossAmountCentavos: amountCentavos,
              currency: "PHP",
              dueAt: initialPaymentAt.toISOString(),
              paidAt: initialPaymentAt.toISOString(),
              renewedUntil: store.subscriptionEnd,
              paymentMethod: "admin_confirmed",
              referenceNumber: `ADMIN-${storeId.slice(0, 8).toUpperCase()}`,
              adminConfirmed: true,
              testMode: false,
            },
          });
          if (paidInitialInvoice?.invoiceId) {
            const { error: receiptRecordError } = await admin.from("billing_notifications").upsert({
              invoice_id: paidInitialInvoice.invoiceId,
              channel: "email",
              notification_type: "payment_received",
              recipient: email,
              status: "sent",
              attempt_count: 1,
              sent_at: new Date().toISOString(),
              next_attempt_at: new Date().toISOString(),
              last_error: null,
            }, { onConflict: "invoice_id,channel,notification_type" });
            if (receiptRecordError) {
              console.error("Initial payment receipt delivery could not be recorded", {
                storeId,
                ownerId,
                error: receiptRecordError.message,
              });
            }
          }
          receiptNotification = { sent: true, error: "" };
        } catch (emailError) {
          receiptNotification.error = emailError instanceof Error ? emailError.message : "Payment receipt could not be sent.";
          console.error("Initial payment receipt email failed", { storeId, ownerId, error: receiptNotification.error });
          if (paidInitialInvoice?.invoiceId) {
            await admin.from("billing_notifications").upsert({
              invoice_id: paidInitialInvoice.invoiceId,
              channel: "email",
              notification_type: "payment_received",
              recipient: email,
              status: "failed",
              attempt_count: 1,
              next_attempt_at: new Date().toISOString(),
              last_error: receiptNotification.error.slice(0, 1000),
            }, { onConflict: "invoice_id,channel,notification_type" });
          }
        }
      }

      return jsonResponse({
        store: { id: storeId, ...store },
        owner: { id: ownerId, ...profile },
        notification,
        receiptNotification,
      });
    }

    if (action === "create_branch") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const ownerId = cleanText(body.ownerId, 100);
      const storeInput = body.store && typeof body.store === "object"
        ? body.store as Record<string, unknown>
        : {};
      const branchName = cleanText(storeInput.branchName || storeInput.name, 80);
      const branchAddress = cleanText(storeInput.address || storeInput.location, 300);
      const branchLatitude = Number(storeInput.lat);
      const branchLongitude = Number(storeInput.lng);
      const hasValidCoordinates = storeInput.lat !== null && storeInput.lat !== undefined &&
        storeInput.lat !== "" && storeInput.lng !== null && storeInput.lng !== undefined &&
        storeInput.lng !== "" && Number.isFinite(branchLatitude) &&
        branchLatitude >= -90 && branchLatitude <= 90 &&
        Number.isFinite(branchLongitude) &&
        branchLongitude >= -180 && branchLongitude <= 180;
      if (!ownerId || !branchName || !branchAddress || !hasValidCoordinates) {
        return jsonResponse({ error: "An owner, branch label, address, and valid map location are required." }, 400);
      }
      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      const primaryStore = await getPrimaryStoreForOwner(admin, ownerId);
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const { count, error: countError } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("data->>ownerId", ownerId);
      if (countError) throw countError;
      const branchLimit = getSubscriptionBranchLimit(primaryStore.data?.subscriptionDependencies);
      if ((count || 0) >= branchLimit) {
        return jsonResponse({ error: `This subscription allows up to ${branchLimit} branch${branchLimit === 1 ? "" : "es"}.` }, 409);
      }
      const businessName = cleanText(primaryStore.data?.businessName || primaryStore.data?.name, 120);
      const storeName = `${businessName} - ${branchName}`;
      const storeId = crypto.randomUUID();
      const branchInput = { ...storeInput };
      delete branchInput.subscriptionLevel;
      delete branchInput.subscriptionDependencies;
      delete branchInput.subscriptionStart;
      delete branchInput.subscriptionEnd;
      delete branchInput.paymentSchedule;
      delete branchInput.owedAmount;
      delete branchInput.pendingOwedAmount;
      delete branchInput.pendingOwedAmountEffectiveAt;
      delete branchInput.branchLimit;
      const store = {
        ...branchInput,
        name: storeName,
        businessName,
        branchName,
        address: branchAddress,
        location: branchAddress,
        lat: branchLatitude,
        lng: branchLongitude,
        parentStoreId: cleanText(primaryStore.data?.parentStoreId, 100) || String(primaryStore.id),
        isPrimaryBranch: false,
        ownerId,
        status: ["pending", "active", "suspended"].includes(String(storeInput.status))
          ? String(storeInput.status)
          : "active",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) throw storeError;
      return jsonResponse({ store: { id: storeId, ...store } });
    }

    if (action === "decide_branch_request") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const requestId = cleanText(body.requestId, 100);
      const decision = cleanText(body.decision, 20);
      if (!requestId || !["approved", "denied"].includes(decision)) {
        return jsonResponse({ error: "A branch request and valid decision are required." }, 400);
      }

      const { data: requestRow, error: requestError } = await admin
        .from("branch_requests")
        .select("id,data")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!requestRow) return jsonResponse({ error: "Branch request was not found." }, 404);

      const request = (requestRow.data || {}) as Record<string, unknown>;
      if (request.status !== "pending") {
        return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
      }

      const reviewedAt = timestamp();
      if (decision === "denied") {
        const deniedRequest = {
          ...request,
          status: "denied",
          reviewedAt,
          reviewedBy: authData.user.id,
          updatedAt: reviewedAt,
        };
        const { data: deniedRows, error: denyError } = await admin
          .from("branch_requests")
          .update({ data: deniedRequest })
          .eq("id", requestId)
          .eq("data->>status", "pending")
          .select("id");
        if (denyError) throw denyError;
        if (!deniedRows?.length) return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
        return jsonResponse({ request: { id: requestId, ...deniedRequest } });
      }

      const ownerId = cleanText(request.ownerId, 100);
      const branchName = cleanText(request.branchName, 80);
      const branchAddress = cleanText(request.address, 300);
      const branchLatitude = Number(request.lat);
      const branchLongitude = Number(request.lng);
      if (!ownerId || !branchName || !branchAddress || !Number.isFinite(branchLatitude) ||
        branchLatitude < -90 || branchLatitude > 90 || !Number.isFinite(branchLongitude) ||
        branchLongitude < -180 || branchLongitude > 180) {
        return jsonResponse({ error: "The branch request has incomplete or invalid location details." }, 400);
      }

      const ownerProfile = await getUserProfile(admin, ownerId);
      if (!ownerProfile || ownerProfile.role !== "store_owner") {
        return jsonResponse({ error: "Store owner was not found." }, 404);
      }
      const primaryStore = await getPrimaryStoreForOwner(admin, ownerId);
      if (!primaryStore) return jsonResponse({ error: "Primary store was not found." }, 404);
      const { count, error: countError } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("data->>ownerId", ownerId);
      if (countError) throw countError;
      const branchLimit = getSubscriptionBranchLimit(primaryStore.data?.subscriptionDependencies);
      if ((count || 0) >= branchLimit) {
        return jsonResponse({ error: `This subscription allows up to ${branchLimit} branch${branchLimit === 1 ? "" : "es"}.` }, 409);
      }

      const primaryData = (primaryStore.data || {}) as Record<string, unknown>;
      const businessName = cleanText(primaryData.businessName || primaryData.name, 120);
      const storeId = crypto.randomUUID();
      const processingRequest = {
        ...request,
        status: "processing",
        updatedAt: reviewedAt,
      };
      const { data: claimedRows, error: claimError } = await admin
        .from("branch_requests")
        .update({ data: processingRequest })
        .eq("id", requestId)
        .eq("data->>status", "pending")
        .select("id");
      if (claimError) throw claimError;
      if (!claimedRows?.length) {
        return jsonResponse({ error: "This branch request has already been reviewed." }, 409);
      }
      const store = {
        name: `${businessName} - ${branchName}`,
        businessName,
        branchName,
        address: branchAddress,
        location: branchAddress,
        lat: branchLatitude,
        lng: branchLongitude,
        parentStoreId: cleanText(primaryData.parentStoreId, 100) || String(primaryStore.id),
        isPrimaryBranch: false,
        ownerId,
        status: "active",
        logoUrl: primaryData.logoUrl || "",
        category: primaryData.category || "",
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      };
      const { error: storeError } = await admin.from("stores").insert({ id: storeId, data: store });
      if (storeError) {
        await admin.from("branch_requests").update({ data: request }).eq("id", requestId).eq("data->>status", "processing");
        throw storeError;
      }

      const approvedRequest = {
        ...request,
        status: "approved",
        storeId,
        reviewedAt,
        reviewedBy: authData.user.id,
        updatedAt: reviewedAt,
      };
      const { error: approveError } = await admin
        .from("branch_requests")
        .update({ data: approvedRequest })
        .eq("id", requestId)
        .eq("data->>status", "processing");
      if (approveError) {
        await admin.from("stores").delete().eq("id", storeId);
        throw approveError;
      }
      return jsonResponse({
        request: { id: requestId, ...approvedRequest },
        store: { id: storeId, ...store },
      });
    }

    if (action === "reject_application") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const applicationId = cleanText(body.applicationId, 100);
      const { data: applicationRow, error: applicationError } = await admin
        .from("applications")
        .select("data")
        .eq("id", applicationId)
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!applicationRow) return jsonResponse({ error: "Application was not found." }, 404);

      const { data: fileRows, error: filesError } = await admin
        .from("application_files")
        .select("file_id")
        .eq("application_id", applicationId);
      if (filesError) throw filesError;
      for (const file of fileRows || []) {
        await deleteDriveFile(file.file_id).catch((error) => {
          console.error("Could not delete rejected application file", file.file_id, error);
        });
      }
      await admin.from("application_files").delete().eq("application_id", applicationId);
      const { error: updateError } = await admin.from("applications").update({
        data: {
          ...applicationRow.data,
          status: "rejected",
          logoUrl: "",
          rejectedAt: timestamp(),
          updatedAt: timestamp(),
        },
      }).eq("id", applicationId);
      if (updateError) throw updateError;
      return jsonResponse({ rejected: true });
    }

    if (action === "create_account") {
      const role = cleanText(body.role, 30);
      const storeId = cleanText(body.storeId, 100);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = String(body.password || "");
      const name = cleanText(body.name, 80);
      if (actor.isDemo) {
        return jsonResponse({ error: "Demo staff accounts can only be added by an auditor in Demo Management." }, 403);
      }

      const canCreate =
        actorIsAdmin ||
        (actor.role === "store_owner" && role === "staff" && storeId && await ownsStore(admin, storeId, authData.user.id));
      const allowedRole =
        (actorIsAdmin && MANAGED_ROLES.has(role)) ||
        (actor.role === "store_owner" && role === "staff");
      if (!canCreate || !allowedRole) {
        return jsonResponse({ error: "You are not allowed to create this account." }, 403);
      }
      if (email === PERMANENT_AUDITOR_EMAIL && role !== "auditor") {
        return jsonResponse({ error: "The permanent auditor email must use the auditor role." }, 400);
      }
      if (["staff", "store_owner"].includes(role) && !storeId) {
        return jsonResponse({ error: "Select the store assigned to this staff member or store owner." }, 400);
      }
      if (!email || !name || !isStrongPassword(password, name, email)) {
        return jsonResponse({ error: "Use a 12+ character password with upper and lowercase letters, a number, a symbol, no spaces, and no account name or email." }, 400);
      }
      await assertPasswordNotCompromised(password);
      if (role === "staff") await assertStaffSlotAvailable(admin, storeId);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message || "Account creation failed." }, 400);
      }

      const profile = {
        email,
        name,
        role,
        ...(storeId ? { storeId } : {}),
        accountStatus: "active",
        accountStatusReason: "",
        forcePasswordReset: Boolean(body.forcePasswordReset),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const { error: profileError } = await admin.from("users").insert({
        id: created.user.id,
        data: profile,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
        throw profileError;
      }

      if (role === "customer") {
        const { error: customerError } = await admin.from("customers").insert({
          id: created.user.id,
          data: { email, name, phone: "", number: "", createdAt: timestamp(), updatedAt: timestamp() },
        });
        if (customerError) {
          await admin.from("users").delete().eq("id", created.user.id);
          await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
          throw customerError;
        }
      }
      if (role === "store_owner") {
        const { data: storeRow, error: storeError } = await admin.from("stores")
          .select("id,data").eq("id", storeId).maybeSingle();
        if (storeError) throw storeError;
        if (!storeRow) {
          await admin.from("users").delete().eq("id", created.user.id);
          await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
          return jsonResponse({ error: "The selected store was not found." }, 404);
        }
        const { error: assignmentError } = await admin.from("stores").update({
          data: { ...storeRow.data, ownerId: created.user.id, updatedAt: timestamp() },
        }).eq("id", storeId);
        if (assignmentError) throw assignmentError;
      }

      let notification = { sent: false, error: "" };
      if (role === "staff") {
        try {
          const staffPortalUrl =
            `${(Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/+$/, "")}/staff`;
          const { data: loginLinkData, error: loginLinkError } =
            await admin.auth.admin.generateLink({
              type: "magiclink",
              email,
              options: { redirectTo: staffPortalUrl },
            });
          if (loginLinkError || !loginLinkData.properties?.action_link) {
            throw loginLinkError || new Error("One-time staff login link could not be generated.");
          }
          const { data: storeRow, error: storeError } = await admin
            .from("stores")
            .select("data")
            .eq("id", storeId)
            .maybeSingle();
          if (storeError) throw storeError;
          await sendStaffCreatedEmail({
            recipientEmail: email,
            userName: name,
            storeName: cleanText(storeRow?.data?.name, 120) || "your store",
            requirePasswordChange: Boolean(body.forcePasswordReset),
            loginLink: loginLinkData.properties.action_link,
          });
          notification = { sent: true, error: "" };
        } catch (emailError) {
          notification.error = emailError instanceof Error ? emailError.message : "Staff email could not be sent.";
          console.error("Staff creation email failed", { userId: created.user.id, storeId, error: notification.error });
        }
      }

      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "create_account",
        entityType: "user",
        entityId: created.user.id,
        metadata: { role, storeId: storeId || null },
      });

      return jsonResponse({ user: { id: created.user.id, ...profile }, notification });
    }

    if (action === "reset_password") {
      const userId = cleanText(body.userId, 100);
      const password = String(body.password || "");
      const target = await getUserProfile(admin, userId);
      if (target?.isDemo) {
        return jsonResponse({ error: "Only an auditor can reset demo credentials from Demo Management." }, 403);
      }
      const canReset =
        actorIsAdmin ||
        (actor.role === "store_owner" &&
          target?.role === "staff" &&
          Boolean(target.storeId) &&
          await ownsStore(admin, String(target.storeId), authData.user.id));
      if (!canReset) return jsonResponse({ error: "You are not allowed to reset this password." }, 403);
      const targetName = cleanText(target?.name, 120);
      const targetEmail = cleanText(target?.email, 254).toLowerCase();
      if (!isStrongPassword(password, targetName, targetEmail)) {
        return jsonResponse({ error: "Use a strong 12+ character password with upper and lowercase letters, a number, a symbol, no spaces, and no account name or email." }, 400);
      }
      await assertPasswordNotCompromised(password);

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await mergeUserData(admin, userId, {
        forcePasswordReset: Boolean(body.forcePasswordReset),
        passwordResetAt: timestamp(),
      });
      return jsonResponse({ updated: true });
    }

    if (action === "complete_first_login_password_change") {
      if (!actor.forcePasswordReset) {
        return jsonResponse({ error: "A first-login password change is not required." }, 400);
      }
      const password = String(body.password || "");
      const accountName = cleanText(actor.name, 80);
      const accountEmail = cleanText(actor.email || authData.user.email, 254).toLowerCase();
      if (!isStrongPassword(password, accountName, accountEmail)) {
        return jsonResponse({ error: "Meet all password security requirements." }, 400);
      }
      await assertPasswordNotCompromised(password);
      const { error: passwordError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
      if (passwordError) throw passwordError;
      await mergeUserData(admin, authData.user.id, {
        forcePasswordReset: false,
        passwordChangedAt: timestamp(),
        updatedAt: timestamp(),
      });
      return jsonResponse({ updated: true });
    }

    if (action === "delete_user") {
      const userId = cleanText(body.userId, 100);
      const target = await getUserProfile(admin, userId);
      if (target?.isDemo) {
        return jsonResponse({ error: "Demo accounts are lifecycle-managed from the auditor Demo Management page." }, 403);
      }
      const canDelete =
        actorIsAdmin ||
        (actor.role === "store_owner" &&
          target?.role === "staff" &&
          Boolean(target.storeId) &&
          await ownsStore(admin, String(target.storeId), authData.user.id));
      if (!canDelete) return jsonResponse({ error: "You are not allowed to delete this account." }, 403);
      if (userId === authData.user.id) {
        return jsonResponse({ error: "You cannot delete your own privileged account." }, 400);
      }
      const { data: targetAuthResult, error: targetAuthError } = await admin.auth.admin.getUserById(userId);
      if (targetAuthError && !targetAuthError.message.toLowerCase().includes("not found")) throw targetAuthError;
      const targetEmail = cleanText(targetAuthResult?.user?.email || target?.email, 254).toLowerCase();
      if (targetEmail === PERMANENT_AUDITOR_EMAIL) {
        return jsonResponse({ error: "The permanent auditor account cannot be deleted." }, 403);
      }
      if (target?.role === "store_owner") {
        const { count, error: ownedStoreError } = await admin.from("stores")
          .select("id", { count: "exact", head: true }).eq("data->>ownerId", userId);
        if (ownedStoreError) throw ownedStoreError;
        if ((count || 0) > 0) {
          return jsonResponse({
            error: "This store owner still owns one or more stores. Reassign or delete those stores first.",
          }, 409);
        }
      }
      await admin.from("users").delete().eq("id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !error.message.toLowerCase().includes("not found")) throw error;
      await writeAuditEvent(admin, {
        actorUserId: authData.user.id,
        actorEmail: authData.user.email || actor.email,
        actorRole: actor.role,
        action: "delete_account",
        entityType: "user",
        entityId: userId,
        metadata: { role: target?.role || null },
      });
      return jsonResponse({ deleted: true });
    }

    if (action === "verify_account_deletion_otp") {
      if (actor.role !== "customer") {
        return jsonResponse({ error: "Customer access required." }, 403);
      }
      const otpToken = cleanText(body.otpToken, 100);
      const otpCode = cleanText(body.otpCode, 10);
      if (!otpToken || !/^\d{6}$/.test(otpCode) || !authData.user.email) {
        return jsonResponse({ error: "A valid deletion OTP is required." }, 400);
      }
      await verifyDeletionOtp(otpToken, otpCode, authData.user.email);
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const deletionProof = await createDeletionProof(
        serviceKey,
        authData.user.id,
        expiresAt,
      );
      return jsonResponse({ deletionProof, expiresAt });
    }

    if (action === "delete_my_account") {
      if (actor.role !== "customer") {
        return jsonResponse({
          error: "Self-service deletion is currently available for customer accounts only.",
        }, 403);
      }

      const userId = authData.user.id;
      const username = cleanText(body.username, 80).toLowerCase();
      const password = String(body.password || "");
      const deletionProof = cleanText(body.deletionProof, 1000);
      if (!actor.username || username !== String(actor.username).trim().toLowerCase()) {
        return jsonResponse({ error: "The username does not match this account." }, 403);
      }
      if (!await verifyDeletionProof(serviceKey, deletionProof, userId)) {
        return jsonResponse({ error: "Deletion verification expired. Request a new OTP." }, 403);
      }
      if (!authData.user.email || !password) {
        return jsonResponse({ error: "Your current password is required." }, 400);
      }
      const passwordClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });
      const { data: passwordData, error: passwordError } =
        await passwordClient.auth.signInWithPassword({
          email: authData.user.email,
          password,
        });
      if (passwordError || passwordData.user?.id !== userId) {
        return jsonResponse({ error: "The password is incorrect." }, 403);
      }

      const deletedAt = timestamp();

      // Keep only an unlinkable store-facing tombstone. All reward progress is erased.
      const { data: cardRows, error: cardReadError } = await admin
        .from("cards")
        .select("id,data")
        .eq("data->>customerId", userId);
      if (cardReadError) throw cardReadError;
      for (const card of cardRows || []) {
        const { error } = await admin.from("cards").update({
          data: {
            storeId: card.data?.storeId,
            joinedAt: card.data?.joinedAt,
            customerId: `deleted:${crypto.randomUUID()}`,
            customerName: "Deleted account",
            accountDeleted: true,
            deletedAt,
            status: "deleted",
            stars: 0,
            promoProgress: {},
          },
        }).eq("id", card.id);
        if (error) throw error;
      }

      const { error: scanError } = await admin
        .from("promotions_scanned")
        .delete()
        .eq("data->>customerId", userId);
      if (scanError) throw scanError;
      const { error: feedbackError } = await admin
        .from("feedback")
        .delete()
        .eq("data->>customerId", userId);
      if (feedbackError) throw feedbackError;
      const { error: referralError } = await admin
        .from("store_referral_redemptions")
        .delete()
        .eq("customer_id", userId);
      if (referralError) throw referralError;

      const { data: files, error: filesError } = await admin
        .from("drive_files")
        .select("file_id")
        .eq("owner_id", userId);
      if (filesError) throw filesError;
      for (const file of files || []) {
        await permanentlyDeleteDriveFile(file.file_id);
        const { error: driveRowError } = await admin
          .from("drive_files")
          .delete()
          .eq("file_id", file.file_id)
          .eq("owner_id", userId);
        if (driveRowError) throw driveRowError;
      }

      const { error: customerError } = await admin.from("customers").delete().eq("id", userId);
      if (customerError) throw customerError;
      const { error: phoneError } = await admin.from("customer_phones").delete().eq("customer_id", userId);
      if (phoneError) throw phoneError;
      const { error: profileError } = await admin.from("users").delete().eq("id", userId);
      if (profileError) throw profileError;

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteError && !authDeleteError.message.toLowerCase().includes("not found")) {
        throw authDeleteError;
      }

      return jsonResponse({
        deleted: true,
        retained: "A de-identified deleted-account marker for each affected loyalty card",
      });
    }

    if (action === "adjust_card_stars") {
      const cardId = cleanText(body.cardId, 100);
      const delta = Math.trunc(Number(body.delta));
      if (!cardId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
        return jsonResponse({ error: "A valid card and point adjustment are required." }, 400);
      }
      const { data: cardRow, error: cardError } = await admin
        .from("cards")
        .select("data")
        .eq("id", cardId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!cardRow) return jsonResponse({ error: "Card was not found." }, 404);
      const storeId = cleanText(cardRow.data?.storeId, 100);
      const customerId = cleanText(cardRow.data?.customerId, 100);
      if (!actorIsAdmin && !(storeId && await ownsStore(admin, storeId, authData.user.id))) {
        return jsonResponse({ error: "You are not allowed to adjust this card." }, 403);
      }
      const currentStars = Number(cardRow.data?.stars || 0);
      const effectiveDelta = Math.max(delta, -currentStars);
      if (effectiveDelta !== 0) {
        const { error: incrementError } = await admin.rpc("increment_loyalty_totals", {
          p_customer_id: customerId,
          p_card_id: cardId,
          p_points: effectiveDelta,
        });
        if (incrementError) throw incrementError;
      }
      return jsonResponse({ stars: Math.max(0, currentStars + effectiveDelta) });
    }

    if (action === "adjust_card_promotion") {
      const cardId = cleanText(body.cardId, 100);
      const promotionId = cleanText(body.promotionId, 100);
      const delta = Math.trunc(Number(body.delta));
      if (!cardId || !promotionId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
        return jsonResponse({ error: "A valid card, promotion, and adjustment are required." }, 400);
      }
      const { data: cardRow, error: cardError } = await admin
        .from("cards")
        .select("data")
        .eq("id", cardId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!cardRow) return jsonResponse({ error: "Card was not found." }, 404);
      const storeId = cleanText(cardRow.data?.storeId, 100);
      if (!actorIsAdmin && !(storeId && await ownsStore(admin, storeId, authData.user.id))) {
        return jsonResponse({ error: "You are not allowed to adjust this card." }, 403);
      }
      const { data: promotionRow, error: promotionError } = await admin
        .from("promotions")
        .select("data")
        .eq("id", promotionId)
        .eq("data->>storeId", storeId)
        .maybeSingle();
      if (promotionError) throw promotionError;
      if (!promotionRow) return jsonResponse({ error: "Promotion was not found for this store." }, 404);
      const requiredStamps = Math.max(1, Math.trunc(Number(promotionRow.data?.requiredStamps || 0)));
      const progress = cardRow.data?.promoProgress && typeof cardRow.data.promoProgress === "object"
        ? { ...cardRow.data.promoProgress as Record<string, unknown> }
        : {};
      const currentProgress = Math.max(0, Number(progress[promotionId] || 0));
      if (delta > 0 && currentProgress >= requiredStamps) {
        return jsonResponse({ error: "This stamp card is already complete." }, 409);
      }
      const nextProgress = Math.min(requiredStamps, Math.max(0, currentProgress + delta));
      progress[promotionId] = nextProgress;
      const { error: updateError } = await admin.from("cards").update({
        data: { ...cardRow.data, promoProgress: progress, updatedAt: timestamp() },
      }).eq("id", cardId);
      if (updateError) throw updateError;
      return jsonResponse({ progress: nextProgress });
    }

    if (action === "delete_store" || action === "delete_store_group") {
      if (!actorIsAdmin) return jsonResponse({ error: "Admin access required." }, 403);
      const lastSignInAt = new Date(String(authData.user.last_sign_in_at || ""));
      const recentlyAuthenticated = !Number.isNaN(lastSignInAt.getTime()) && Date.now() - lastSignInAt.getTime() <= 5 * 60_000;
      if (!recentlyAuthenticated) return jsonResponse({ error: "Please re-authenticate before deleting a store or branch." }, 401);
      const storeId = cleanText(body.storeId, 100);
      if (!storeId) return jsonResponse({ error: "Store is required." }, 400);

      const { data: storeRow, error: storeError } = await admin
        .from("stores")
        .select("data")
        .eq("id", storeId)
        .maybeSingle();
      if (storeError) throw storeError;
      if (!storeRow) return jsonResponse({ error: "Store was not found." }, 404);

      const ownerId = cleanText(storeRow.data?.ownerId, 100);
      const deleteGroup = action === "delete_store_group";
      const { data: groupStoreRows, error: groupStoreError } = deleteGroup && ownerId
        ? await admin.from("stores").select("id,data").eq("data->>ownerId", ownerId)
        : { data: [{ id: storeId, data: storeRow.data }], error: null };
      if (groupStoreError) throw groupStoreError;
      const targetStores = groupStoreRows || [];
      const storeIds = targetStores.map((row: any) => String(row.id));
      if (!storeIds.length) return jsonResponse({ error: "No store branches were found." }, 404);
      const { data: remainingStoreRows, error: remainingStoresError } = !deleteGroup && ownerId
        ? await admin
          .from("stores")
          .select("id,data")
          .eq("data->>ownerId", ownerId)
          .neq("id", storeId)
          .order("created_at", { ascending: true })
        : { data: [], error: null };
      if (remainingStoresError) throw remainingStoresError;
      const remainingStores = remainingStoreRows || [];
      const retainedPrimaryStore = !deleteGroup && remainingStores.length > 0
        ? remainingStores.find((row: any) => row.data?.isPrimaryBranch === true) || remainingStores[0]
        : null;
      const primaryStoreId = retainedPrimaryStore ? String(retainedPrimaryStore.id) : null;
      const { data: staffRows, error: usersError } = await admin
        .from("users")
        .select("id,data")
        .in("data->>storeId", storeIds)
        .eq("data->>role", "staff");
      if (usersError) throw usersError;
      const deleteOwner = Boolean(ownerId) && (deleteGroup || (remainingStoreRows || []).length === 0);
      const userIds = Array.from(new Set([
        ...(staffRows || []).map((row) => String(row.id)),
        ...(deleteOwner ? [ownerId] : []),
      ]));

      const driveFileIds = new Set<string>();
      for (const targetStore of targetStores) collectDriveFileIds(targetStore.data, driveFileIds);
      for (const staffRow of staffRows || []) collectDriveFileIds(staffRow.data, driveFileIds);
      if (deleteOwner && ownerId) {
        const { data: ownerRow, error: ownerReadError } = await admin.from("users").select("data").eq("id", ownerId).maybeSingle();
        if (ownerReadError) throw ownerReadError;
        collectDriveFileIds(ownerRow?.data, driveFileIds);
      }
      if (userIds.length) {
        const { data: ownedFiles, error: ownedFilesError } = await admin.from("drive_files").select("file_id").in("owner_id", userIds);
        if (ownedFilesError) throw ownedFilesError;
        for (const file of ownedFiles || []) driveFileIds.add(String(file.file_id));
      }

      const assetRowsByTable = new Map<string, any[]>();
      for (const table of ["products", "promotions", "store_reviews"]) {
        const { data: rows, error: readError } = await admin
          .from(table)
          .select("data")
          .in("data->>storeId", storeIds);
        if (readError) throw readError;
        const assetRows = rows || [];
        assetRowsByTable.set(table, assetRows);
        for (const row of assetRows) collectDriveFileIds(row.data, driveFileIds);
      }

      const { data: applicationRows, error: applicationReadError } = await admin
        .from("applications")
        .select("id")
        .in("data->>approvedStoreId", storeIds);
      if (applicationReadError) throw applicationReadError;
      const applicationIds = (applicationRows || []).map((row) => String(row.id));
      if (applicationIds.length) {
        const { data: applicationFiles, error: applicationFilesError } = await admin
          .from("application_files")
          .select("file_id")
          .in("application_id", applicationIds);
        if (applicationFilesError) throw applicationFilesError;
        for (const file of applicationFiles || []) driveFileIds.add(String(file.file_id));
      }

      // A branch can reuse its primary branch logo (or another managed image). Never
      // delete a file that is still referenced by a surviving branch or its data.
      const retainedDriveFileIds = new Set<string>();
      if (!deleteGroup && (remainingStoreRows || []).length) {
        const remainingStoreIds = (remainingStoreRows || []).map((row: any) => String(row.id));
        for (const remainingStore of remainingStoreRows || []) {
          collectDriveFileIds(remainingStore.data, retainedDriveFileIds);
        }
        for (const table of ["products", "promotions", "store_reviews"]) {
          const { data: rows, error: retainedReadError } = await admin
            .from(table)
            .select("data")
            .in("data->>storeId", remainingStoreIds);
          if (retainedReadError) throw retainedReadError;
          for (const row of rows || []) collectDriveFileIds(row.data, retainedDriveFileIds);
        }
      }

      // Review images belong to customers and may be reused on a review outside the
      // deletion scope, including at a store owned by someone else.
      const reviewCustomerIds = Array.from(new Set(
        (assetRowsByTable.get("store_reviews") || [])
          .map((row: any) => cleanText(row.data?.customerId, 100))
          .filter(Boolean),
      ));
      if (reviewCustomerIds.length) {
        const { data: otherCustomerReviews, error: otherReviewsError } = await admin
          .from("store_reviews")
          .select("data")
          .in("data->>customerId", reviewCustomerIds);
        if (otherReviewsError) throw otherReviewsError;
        for (const row of otherCustomerReviews || []) {
          if (!storeIds.includes(String(row.data?.storeId || ""))) {
            collectDriveFileIds(row.data, retainedDriveFileIds);
          }
        }
      }
      for (const fileId of retainedDriveFileIds) driveFileIds.delete(fileId);

      for (const table of ["promotions_scanned", "feedback", "store_reviews", "cards", "products", "promotions"]) {
        const { error } = await admin.from(table).delete().in("data->>storeId", storeIds);
        if (error) throw error;
      }
      const { error: linkedRequestDeleteError } = await admin
        .from("branch_requests")
        .delete()
        .in("data->>storeId", storeIds);
      if (linkedRequestDeleteError) throw linkedRequestDeleteError;
      if (deleteGroup && ownerId) {
        const { error: requestDeleteError } = await admin.from("branch_requests").delete().eq("data->>ownerId", ownerId);
        if (requestDeleteError) throw requestDeleteError;
      }
      if (applicationIds.length) {
        const { error: applicationDeleteError } = await admin.from("applications").delete().in("id", applicationIds);
        if (applicationDeleteError) throw applicationDeleteError;
      }
      const { error: referralDeleteError } = await admin.from("store_referral_redemptions").delete().in("store_id", storeIds);
      if (referralDeleteError) throw referralDeleteError;

      if (primaryStoreId) {
        // Billing belongs to the store group. Preserve its subscription and
        // invoice history when a surviving branch becomes the new primary.
        const { error: invoiceRelinkError } = await admin
          .from("billing_invoices")
          .update({ store_id: primaryStoreId })
          .in("store_id", storeIds);
        if (invoiceRelinkError) throw invoiceRelinkError;
        const { error: subscriptionRelinkError } = await admin
          .from("billing_subscriptions")
          .update({ store_id: primaryStoreId })
          .in("store_id", storeIds);
        if (subscriptionRelinkError) throw subscriptionRelinkError;
      } else {
        // Invoices use restrictive foreign keys so deletion must be explicit
        // and must happen before subscriptions, stores, and owner profiles.
        const { error: invoiceDeleteError } = await admin
          .from("billing_invoices")
          .delete()
          .in("store_id", storeIds);
        if (invoiceDeleteError) throw invoiceDeleteError;
        const { error: subscriptionDeleteError } = await admin
          .from("billing_subscriptions")
          .delete()
          .in("store_id", storeIds);
        if (subscriptionDeleteError) throw subscriptionDeleteError;
      }

      const { error: deleteStoreError } = await admin.from("stores").delete().in("id", storeIds);
      if (deleteStoreError) throw deleteStoreError;
      if (!deleteGroup && ownerId && retainedPrimaryStore && primaryStoreId) {
        const existingPrimary = remainingStores.find((row: any) => row.data?.isPrimaryBranch === true);
        const promotedStore = retainedPrimaryStore;

        if (!existingPrimary) {
          const subscriptionFields = [
            "subscriptionLevel", "subscriptionDependencies", "subscriptionStart", "subscriptionEnd",
            "paymentSchedule", "owedAmount", "pendingOwedAmount", "pendingOwedAmountEffectiveAt",
            "branchLimit", "subscriptionAccess",
          ];
          const promotedData = { ...promotedStore.data };
          for (const field of subscriptionFields) {
            if (storeRow.data?.[field] !== undefined) promotedData[field] = storeRow.data[field];
          }
          const { error: promoteError } = await admin.from("stores").update({
            data: { ...promotedData, isPrimaryBranch: true, parentStoreId: primaryStoreId, updatedAt: timestamp() },
          }).eq("id", primaryStoreId);
          if (promoteError) throw promoteError;
        }

        for (const remainingStore of remainingStores) {
          if (String(remainingStore.id) === primaryStoreId) continue;
          const { error: relinkError } = await admin.from("stores").update({
            data: { ...remainingStore.data, isPrimaryBranch: false, parentStoreId: primaryStoreId, updatedAt: timestamp() },
          }).eq("id", remainingStore.id);
          if (relinkError) throw relinkError;
        }
        await mergeUserData(admin, ownerId, { storeId: primaryStoreId });
      }
      const deletedUserIds: string[] = [];
      const failedUserIds: string[] = [];
      for (const userId of userIds) {
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
        if (authDeleteError) {
          failedUserIds.push(userId);
          console.error("Could not delete Auth user", userId, authDeleteError);
        } else {
          deletedUserIds.push(userId);
        }
      }
      if (deletedUserIds.length) {
        const { error: deleteProfilesError } = await admin.from("users").delete().in("id", deletedUserIds);
        if (deleteProfilesError) throw deleteProfilesError;
      }

      let deletedFiles = 0;
      const failedFileIds: string[] = [];
      for (const fileId of driveFileIds) {
        try {
          await permanentlyDeleteDriveFile(fileId);
          const { error: registryDeleteError } = await admin.from("drive_files").delete().eq("file_id", fileId);
          if (registryDeleteError) throw registryDeleteError;
          deletedFiles += 1;
        } catch (error) {
          failedFileIds.push(fileId);
          console.error("Could not delete Drive file", fileId, error);
        }
      }

      const cleanupComplete = failedUserIds.length === 0 && failedFileIds.length === 0;

      return jsonResponse({
        deleted: true,
        deletedStoreIds: storeIds,
        primaryStoreId,
        cleanupComplete,
        deletedUsers: deletedUserIds.length,
        failedUsers: failedUserIds.length,
        deletedFiles,
        failedFiles: failedFileIds.length,
        retainedSharedFiles: retainedDriveFileIds.size,
        ...(!cleanupComplete ? {
          cleanupWarning: "The store data was deleted, but one or more Auth accounts or Drive files need administrator cleanup.",
        } : {}),
      });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("admin-backend failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Backend operation failed." }, 500);
  }
};

Deno.serve(async (req) => {
  const auditRequest = req.clone();
  const response = await handleAdminRequest(req);
  if (req.method !== "POST" || response.status < 200 || response.status >= 300) return response;

  try {
    const body = (await auditRequest.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 60);
    if (!AUTO_AUDITED_MUTATIONS.has(action)) return response;

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = auditRequest.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return response;
    const { data: actorRow } = await admin
      .from("users")
      .select("data")
      .eq("id", authData.user.id)
      .maybeSingle();
    const actor = (actorRow?.data || {}) as UserProfile;
    const responseBody = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
    const entityType = mutationEntityType(action);
    const entityId = mutationEntityId(action, body, responseBody) ||
      (entityType === "user" ? authData.user.id : "");
    await writeAuditEvent(admin, {
      actorUserId: authData.user.id,
      actorEmail: authData.user.email || actor.email,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      metadata: mutationAuditMetadata(action, body, responseBody),
    });
  } catch (auditError) {
    console.error("Could not audit successful admin-backend mutation", auditError);
  }

  return response;
});

type DemoCredential = {
  userId: string;
  role: "customer" | "staff" | "store_owner" | "admin";
  name: string;
  email: string;
  password: string;
};

type DemoTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "deactivated" | "expired";
  store_id: string;
  expires_at: string;
};

const verifyActorPassword = async (
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
) => {
  const verifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (data.session) await verifier.auth.signOut().catch(() => undefined);
  return !error && Boolean(data.user);
};

const randomToken = (length: number) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

const generateDemoPassword = () => `Demo!7${randomToken(18)}`;

const slugify = (value: string) => value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const demoEmail = (slug: string, label: string) =>
  `demo-${slug.slice(0, 24)}-${slugify(label).slice(0, 12)}-${randomToken(8).toLowerCase()}@sandbox.perktoday.com`;

const createDemoAccount = async (
  admin: any,
  input: {
    tenantId: string;
    storeId: string;
    expiresAt: string;
    role: DemoCredential["role"];
    email: string;
    name: string;
    username?: string;
  },
): Promise<DemoCredential> => {
  const password = generateDemoPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: input.name,
      name: input.name,
      is_demo: true,
      demo_tenant_id: input.tenantId,
    },
    app_metadata: {
      is_demo: true,
      demo_tenant_id: input.tenantId,
    },
  });
  if (createError || !created.user) {
    throw createError || new Error(`Could not create ${input.role} demo account.`);
  }

  const now = timestamp();
  const profile = {
    email: input.email,
    name: input.name,
    role: input.role,
    ...(input.role !== "customer" ? { storeId: input.storeId } : {}),
    ...(input.username ? { username: input.username } : {}),
    isDemo: true,
    demoTenantId: input.tenantId,
    demoExpiresAt: input.expiresAt,
    accountStatus: "active",
    accountStatusReason: "",
    forcePasswordReset: false,
    createdAt: now,
    updatedAt: now,
  };

  const { error: profileError } = await admin.from("users").insert({
    id: created.user.id,
    data: profile,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    throw profileError;
  }

  if (input.role === "customer") {
    const { error: customerError } = await admin.from("customers").insert({
      id: created.user.id,
      data: {
        name: input.name,
        email: input.email,
        username: input.username,
        isDemo: true,
        demoTenantId: input.tenantId,
        demoExpiresAt: input.expiresAt,
        lifetimeStars: 0,
        qrVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
    if (customerError) {
      await admin.from("users").delete().eq("id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw customerError;
    }
  }

  return {
    userId: created.user.id,
    role: input.role,
    name: input.name,
    email: input.email,
    password,
  };
};

const getDemoTenant = async (admin: any, tenantId: string): Promise<DemoTenantRow> => {
  const { data, error } = await admin.from("demo_tenants")
    .select("id,name,slug,status,store_id,expires_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Demo sandbox was not found.");
  return data as DemoTenantRow;
};

const getActiveDemoTenant = async (admin: any, tenantId: string): Promise<DemoTenantRow> => {
  const tenant = await getDemoTenant(admin, tenantId);
  if (tenant.status === "active" && Date.parse(tenant.expires_at) <= Date.now()) {
    await setDemoTenantState(admin, tenant, "expired", { expiresAt: tenant.expires_at });
    throw new Error("This demo sandbox has expired. Reactivate it before changing its accounts.");
  }
  if (tenant.status !== "active") {
    throw new Error(`This demo sandbox is ${tenant.status}. Reactivate it before changing its accounts.`);
  }
  return tenant;
};

const setDemoTenantState = async (
  admin: any,
  tenant: DemoTenantRow,
  status: DemoTenantRow["status"],
  options: { expiresAt: string; actorId?: string },
) => {
  const isActive = status === "active";
  const accountStatus = isActive ? "active" : "suspended";
  const reason = isActive
    ? ""
    : status === "expired"
    ? "This demo sandbox has expired."
    : "This demo sandbox was deactivated by an auditor.";

  const { data: accountRows, error: accountsError } = await admin.from("demo_accounts")
    .select("auth_user_id")
    .eq("tenant_id", tenant.id);
  if (accountsError) throw accountsError;
  const userIds = (accountRows || []).map((row: any) => String(row.auth_user_id));

  const { data: storeRow, error: storeError } = await admin.from("stores")
    .select("data")
    .eq("id", tenant.store_id)
    .maybeSingle();
  if (storeError) throw storeError;
  if (storeRow) {
    const { error } = await admin.from("stores").update({
      data: {
        ...storeRow.data,
        status: isActive ? "active" : "suspended",
        demoExpiresAt: options.expiresAt,
        subscriptionEnd: options.expiresAt,
        updatedAt: timestamp(),
      },
    }).eq("id", tenant.store_id);
    if (error) throw error;
  }

  const { error: tenantError } = await admin.from("demo_tenants").update({
    status,
    expires_at: options.expiresAt,
    deactivated_at: status === "deactivated" ? new Date().toISOString() : null,
    deactivated_by: status === "deactivated" ? options.actorId || null : null,
  }).eq("id", tenant.id);
  if (tenantError) throw tenantError;

  const { error: accountUpdateError } = await admin.from("demo_accounts").update({
    status,
  }).eq("tenant_id", tenant.id);
  if (accountUpdateError) throw accountUpdateError;

  if (userIds.length) {
    const { data: profileRows, error: profilesError } = await admin.from("users")
      .select("id,data")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    for (const row of profileRows || []) {
      const { error } = await admin.from("users").update({
        data: {
          ...row.data,
          demoExpiresAt: options.expiresAt,
          accountStatus,
          accountStatusReason: reason,
          accountStatusUpdatedAt: timestamp(),
          accountStatusUpdatedBy: options.actorId || null,
          updatedAt: timestamp(),
        },
      }).eq("id", row.id);
      if (error) throw error;
    }

    for (const userId of userIds) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? "none" : "876000h",
        app_metadata: {
          is_demo: true,
          demo_tenant_id: tenant.id,
          demo_status: status,
        },
      });
      if (error) throw error;
    }
  }
};

const reconcileExpiredDemoTenants = async (admin: any) => {
  const { data, error } = await admin.from("demo_tenants")
    .select("id,name,slug,status,store_id,expires_at")
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString())
    .limit(100);
  if (error) throw error;
  for (const tenant of data || []) {
    await setDemoTenantState(admin, tenant as DemoTenantRow, "expired", {
      expiresAt: tenant.expires_at,
    });
  }
};

const readAllRows = async (
  admin: any,
  table: string,
  columns: string,
  maximumRows = 50_000,
) => {
  const rows: any[] = [];
  const batchSize = 1000;
  for (let from = 0; from < maximumRows; from += batchSize) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order("created_at", { ascending: false })
      .range(from, Math.min(from + batchSize - 1, maximumRows - 1));
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows;
};

const listAllAuthUsers = async (admin: any, maximumUsers = 50_000) => {
  const users: any[] = [];
  const perPage = 1000;
  for (let page = 1; users.length < maximumUsers; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users.slice(0, maximumUsers);
};

const assertStaffSlotAvailable = async (
  admin: any,
  storeId: string,
  excludingUserId = "",
) => {
  const { data: storeRow, error: storeLimitError } = await admin
    .from("stores")
    .select("data")
    .eq("id", storeId)
    .maybeSingle();
  if (storeLimitError) throw storeLimitError;
  if (!storeRow) throw new Error("The selected store was not found.");

  const staffLimit = Math.trunc(Number(storeRow.data?.subscriptionDependencies?.staffLimit || 0));
  if (staffLimit <= 0) return;

  let countQuery = admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("data->>storeId", storeId)
    .eq("data->>role", "staff");
  if (excludingUserId) countQuery = countQuery.neq("id", excludingUserId);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;
  if ((count || 0) >= staffLimit) {
    throw new Error(
      `This subscription allows up to ${staffLimit} staff account${staffLimit === 1 ? "" : "s"}.`,
    );
  }
};

const mutationEntityType = (action: string) => {
  if (["update_public_feedback"].includes(action)) return "site_feedback";
  if (["update_error_report"].includes(action)) return "client_error_report";
  if (["sync_subscription_billing", "cancel_subscription_auto_renewal", "update_subscription_access"].includes(action)) {
    return "billing_subscription";
  }
  if ([
    "confirm_subscription_upgrade",
    "cancel_subscription_upgrade",
    "admin_cancel_subscription_upgrade",
  ].includes(action)) return "subscription_plan_change";
  if (["retry_billing_invoice"].includes(action)) return "billing_invoice";
  if (["update_account_restriction", "create_store", "create_branch", "delete_store", "delete_store_group"].includes(action)) {
    return "store";
  }
  if (["decide_branch_request"].includes(action)) return "branch_request";
  if (["reject_application"].includes(action)) return "application";
  if (["reset_password", "complete_first_login_password_change"].includes(action)) return "user";
  if (["adjust_card_stars", "adjust_card_promotion"].includes(action)) return "loyalty_card";
  return "admin_operation";
};

const mutationEntityId = (
  action: string,
  body: Record<string, unknown>,
  responseBody: Record<string, unknown>,
) => {
  if (action === "update_public_feedback") return cleanText(body.feedbackId, 160);
  if (action === "update_error_report") return cleanText(body.reportId, 160);
  if (action === "retry_billing_invoice") return cleanText(body.invoiceId, 160);
  if (["cancel_subscription_upgrade", "admin_cancel_subscription_upgrade"].includes(action)) {
    return cleanText(body.planChangeId, 160);
  }
  if (action === "confirm_subscription_upgrade") {
    const change = responseBody.change && typeof responseBody.change === "object"
      ? responseBody.change as Record<string, unknown>
      : {};
    return cleanText(change.id, 160);
  }
  if (action === "decide_branch_request") return cleanText(body.requestId, 160);
  if (action === "reject_application") return cleanText(body.applicationId, 160);
  if (["reset_password", "complete_first_login_password_change"].includes(action)) {
    return cleanText(body.userId, 160);
  }
  if (["adjust_card_stars", "adjust_card_promotion"].includes(action)) return cleanText(body.cardId, 160);
  const storeId = cleanText(body.storeId, 160);
  if (storeId) return storeId;
  const responseStore = responseBody.store && typeof responseBody.store === "object"
    ? responseBody.store as Record<string, unknown>
    : {};
  return cleanText(responseStore.id || responseBody.storeId, 160);
};

const mutationAuditMetadata = (
  action: string,
  body: Record<string, unknown>,
  responseBody: Record<string, unknown>,
) => {
  const metadata: Record<string, unknown> = {};
  const status = cleanText(body.status, 40);
  if (status) metadata.status = status;
  const decision = cleanText(body.decision, 40);
  if (decision) metadata.decision = decision;
  if (["adjust_card_stars", "adjust_card_promotion"].includes(action)) {
    metadata.delta = Math.trunc(Number(body.delta) || 0);
  }
  if (action === "adjust_card_promotion") {
    metadata.promotionId = cleanText(body.promotionId, 160) || null;
  }
  if (action === "update_subscription_access") {
    const access = body.subscriptionAccess && typeof body.subscriptionAccess === "object"
      ? body.subscriptionAccess as Record<string, unknown>
      : {};
    metadata.status = cleanText(access.status, 40) || null;
  }
  if (action === "update_account_restriction") {
    const restriction = body.accountRestriction && typeof body.accountRestriction === "object"
      ? body.accountRestriction as Record<string, unknown>
      : {};
    metadata.status = cleanText(restriction.status, 40) || null;
  }
  if (action === "confirm_subscription_upgrade") {
    const quote = responseBody.quote && typeof responseBody.quote === "object"
      ? responseBody.quote as Record<string, unknown>
      : {};
    metadata.fromPlanId = cleanText(quote.fromPlanId, 80) || null;
    metadata.toPlanId = cleanText(quote.toPlanId, 80) || null;
    metadata.targetPeriodStart = cleanText(quote.targetPeriodStart, 100) || null;
    metadata.termsVersion = cleanText(quote.termsVersion, 80) || null;
    metadata.quoteFingerprint = cleanText(quote.quoteFingerprint, 128) || null;
  }
  if (action === "admin_cancel_subscription_upgrade") {
    metadata.reason = cleanText(body.reason, 500) || null;
  }
  return metadata;
};

const writeAuditEvent = async (
  admin: any,
  event: {
    actorUserId?: string;
    actorEmail?: string;
    actorRole?: string;
    action: string;
    entityType: string;
    entityId?: string;
    outcome?: "success" | "failure" | "blocked";
    source?: "database" | "admin_backend" | "auth" | "billing" | "system";
    metadata?: Record<string, unknown>;
  },
) => {
  const { error } = await admin.from("audit_events").insert({
    actor_user_id: cleanText(event.actorUserId, 100) || null,
    actor_email: cleanText(event.actorEmail, 254) || null,
    actor_role: cleanText(event.actorRole, 30) || null,
    action: cleanText(event.action, 120),
    entity_type: cleanText(event.entityType, 80),
    entity_id: cleanText(event.entityId, 160) || null,
    outcome: event.outcome || "success",
    source: event.source || "admin_backend",
    metadata: event.metadata || {},
  });
  if (error) {
    // The primary operation should not be rolled back solely because the audit
    // sink is temporarily unavailable, but the failure remains visible in logs.
    console.error("Could not persist audit event", event.action, error);
  }
};

const ownsStore = async (admin: any, storeId: string, ownerId: string) => {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("data->>ownerId", ownerId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

const getPrimaryStoreForOwner = async (admin: any, ownerId: string) => {
  const { data, error } = await admin
    .from("stores")
    .select("id,data")
    .eq("data->>ownerId", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const stores = data || [];
  return stores.find((row: any) => row.data?.isPrimaryBranch === true) ||
    stores.find((row: any) => !cleanText(row.data?.parentStoreId, 100)) ||
    stores[0] ||
    null;
};

type SubscriptionUpgradeState = {
  storeId: string;
  subscription: {
    id: string;
    planId: string;
    amountCentavos: number;
    intervalDays: number;
    currentPeriodEnd: string;
    renewalMode: "automatic" | "manual";
  };
  plans: PlanSnapshot[];
  currentPlan: PlanSnapshot | null;
  eligiblePlans: PlanSnapshot[];
  currentRenewalInvoice: RenewalInvoiceState | null;
  pendingChange: Record<string, unknown> | null;
  planCatalogUpdatedAt: string;
  blockedReason: string | null;
};

const mapSubscriptionPlanChange = (row: any) => row
  ? {
    id: String(row.id),
    status: String(row.status),
    fromPlan: row.from_plan_snapshot,
    toPlan: row.to_plan_snapshot,
    targetPeriodStart: row.target_period_start,
    targetAmountCentavos: Number(row.target_amount_centavos),
    renewalInvoiceId: row.renewal_invoice_id || null,
    requestedAt: row.requested_at,
    lockedAt: row.locked_at || null,
    appliedAt: row.applied_at || null,
  }
  : null;

const loadSubscriptionUpgradeState = async (
  admin: any,
  storeId: string,
  ownerUserId: string,
): Promise<SubscriptionUpgradeState> => {
  const { data: ownedStore, error: ownedStoreError } = await admin
    .from("stores")
    .select("id,data")
    .eq("id", storeId)
    .eq("data->>ownerId", ownerUserId)
    .maybeSingle();
  if (ownedStoreError) throw ownedStoreError;
  if (!ownedStore) throw new Error("The primary store was not found for this owner.");

  const primaryStore = await getPrimaryStoreForOwner(admin, ownerUserId);
  if (!primaryStore || primaryStore.id !== ownedStore.id) {
    throw new Error("Subscription upgrades can only be managed from the primary store.");
  }

  const [settingsResult, subscriptionResult] = await Promise.all([
    admin.from("settings")
      .select("data,updated_at")
      .eq("id", "subscriptions")
      .maybeSingle(),
    admin.from("billing_subscriptions")
      .select("id,store_id,owner_user_id,plan_id,amount_centavos,interval_days,current_period_end,renewal_mode,status,initial_payment_required")
      .eq("store_id", ownedStore.id)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle(),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (!subscriptionResult.data) throw new Error("Billing subscription was not found.");

  const subscriptionRow = subscriptionResult.data;
  const now = new Date().toISOString();
  const [currentInvoiceResult, overdueInvoiceResult, changeResult] = await Promise.all([
    admin.from("billing_invoices")
      .select("id,status,due_at,period_start,period_end,amount_centavos,created_at")
      .eq("subscription_id", subscriptionRow.id)
      .eq("invoice_type", "renewal")
      .eq("period_start", subscriptionRow.current_period_end)
      .in("status", ["pending", "link_created", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("billing_invoices")
      .select("id")
      .eq("subscription_id", subscriptionRow.id)
      .eq("invoice_type", "renewal")
      .in("status", ["pending", "link_created", "failed"])
      .lt("due_at", now)
      .limit(1)
      .maybeSingle(),
    admin.from("subscription_plan_changes")
      .select("id,status,from_plan_snapshot,to_plan_snapshot,target_period_start,target_amount_centavos,renewal_invoice_id,requested_at,locked_at,applied_at")
      .eq("subscription_id", subscriptionRow.id)
      .in("status", ["scheduled", "locked"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (currentInvoiceResult.error) throw currentInvoiceResult.error;
  if (overdueInvoiceResult.error) throw overdueInvoiceResult.error;
  if (changeResult.error) throw changeResult.error;

  const plans = normalizePlanCatalog(settingsResult.data?.data || {});
  const catalogCurrentPlan = findPlan(plans, String(subscriptionRow.plan_id || ""));
  const intervalDays = Math.trunc(Number(subscriptionRow.interval_days));
  const amountCentavos = Math.trunc(Number(subscriptionRow.amount_centavos));
  const currentPlan = catalogCurrentPlan
    ? {
      ...catalogCurrentPlan,
      priceCentavos: amountCentavos,
      intervalDays,
    }
    : null;
  const eligiblePlans = catalogCurrentPlan
    ? listEligibleUpgradePlans(plans, catalogCurrentPlan.id)
      .filter((plan) => plan.priceCentavos > amountCentavos)
      .map((plan) => ({ ...plan, intervalDays }))
    : [];
  const invoice = currentInvoiceResult.data;
  const currentRenewalInvoice: RenewalInvoiceState | null = invoice
    ? {
      id: String(invoice.id),
      status: String(invoice.status),
      dueAt: String(invoice.due_at),
      periodStart: String(invoice.period_start),
      periodEnd: String(invoice.period_end),
      amountCentavos: Number(invoice.amount_centavos),
    }
    : null;
  const renewalMode = subscriptionRow.renewal_mode === "manual"
    ? "manual"
    : "automatic";
  const eligibleStatus = subscriptionRow.status === "active"
    || (subscriptionRow.status === "cancelled" && renewalMode === "manual");
  const pendingChange = mapSubscriptionPlanChange(changeResult.data);
  let blockedReason: string | null = null;
  if (subscriptionRow.initial_payment_required === true) {
    blockedReason = "Complete the initial subscription payment before upgrading.";
  } else if (!eligibleStatus) {
    blockedReason = "Resolve the subscription status before scheduling an upgrade.";
  } else if (overdueInvoiceResult.data) {
    blockedReason = "Resolve the overdue renewal before scheduling an upgrade.";
  } else if (!catalogCurrentPlan) {
    blockedReason = "The active plan is not available in the current plan catalog.";
  } else if (pendingChange) {
    blockedReason = "A subscription upgrade is already scheduled.";
  } else if (!eligiblePlans.length) {
    blockedReason = "There is no higher-priced compatible plan available.";
  }

  return {
    storeId: ownedStore.id,
    subscription: {
      id: String(subscriptionRow.id),
      planId: String(subscriptionRow.plan_id),
      amountCentavos,
      intervalDays,
      currentPeriodEnd: String(subscriptionRow.current_period_end),
      renewalMode,
    },
    plans,
    currentPlan,
    eligiblePlans,
    currentRenewalInvoice,
    pendingChange,
    planCatalogUpdatedAt: String(settingsResult.data?.updated_at || ""),
    blockedReason,
  };
};

const quoteSubscriptionUpgrade = (
  state: SubscriptionUpgradeState,
  targetPlanId: string,
): Promise<UpgradeQuote> =>
  buildSubscriptionUpgradeQuote({
    storeId: state.storeId,
    subscription: state.subscription,
    plans: state.plans,
    targetPlanId,
    currentRenewalInvoice: state.currentRenewalInvoice,
    planCatalogUpdatedAt: state.planCatalogUpdatedAt,
  });

const syncBillingSubscription = async (admin: any, primaryStore: { id: string; data: Record<string, any> }) => {
  const store = primaryStore.data || {};
  const access = store.subscriptionAccess && typeof store.subscriptionAccess === "object"
    ? store.subscriptionAccess as Record<string, unknown>
    : {};
  const automationEnabled = access.automationEnabled === true;
  if (!automationEnabled) {
    const { error } = await admin.from("billing_subscriptions")
      .update({ automation_enabled: false }).eq("store_id", primaryStore.id);
    if (error && error.code !== "42P01") throw error;
    return null;
  }

  const ownerId = cleanText(store.ownerId, 100);
  const owner = ownerId ? await getUserProfile(admin, ownerId) : null;
  const billingEmail = cleanText(owner?.email, 254).toLowerCase();
  const periodStart = toIsoTimestamp(store.subscriptionStart);
  const periodEnd = toIsoTimestamp(store.subscriptionEnd);
  const amount = Number(store.owedAmount);
  const amountCentavos = Math.round(amount * 100);
  const pendingAmount = Number(store.pendingOwedAmount);
  const pendingAmountCentavos = Number.isFinite(pendingAmount) ? Math.round(pendingAmount * 100) : null;
  const pendingAmountEffectiveAt = pendingAmountCentavos && pendingAmountCentavos >= 100
    ? toIsoTimestamp(store.pendingOwedAmountEffectiveAt)
    : null;
  const planId = cleanText(store.subscriptionLevel, 80);
  if (!ownerId || !billingEmail || !periodStart || !periodEnd || !planId || !Number.isInteger(amountCentavos) || amountCentavos < 100) {
    throw new Error("Automatic PayMongo billing requires an owner email, plan, amount, subscription start, and subscription end.");
  }
  if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
    throw new Error("Subscription end must be after subscription start before PayMongo automation can be enabled.");
  }
  if (cleanText(store.paymentSchedule, 60) !== "every_30_days") {
    throw new Error("PayMongo automation requires the fixed-interval payment schedule.");
  }
  const intervalDays = Math.max(1, Math.min(365, Math.trunc(Number(store.billingIntervalDays ?? 30) || 30)));

  const status = cleanText(access.status, 20).toLowerCase();
  const normalizedStatus = status === "frozen" ? "frozen" : status === "grace" ? "past_due" : "active";
  const { data, error } = await admin.from("billing_subscriptions").upsert({
    store_id: primaryStore.id,
    owner_user_id: ownerId,
    billing_email: billingEmail,
    plan_id: planId,
    amount_centavos: amountCentavos,
    pending_amount_centavos: pendingAmountCentavos && pendingAmountCentavos >= 100
      ? pendingAmountCentavos
      : null,
    pending_amount_effective_at: pendingAmountEffectiveAt,
    currency: "PHP",
    interval_days: intervalDays,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    next_billing_at: periodEnd,
    warning_lead_days: Math.max(0, Math.min(30, Math.trunc(Number(access.warningLeadDays ?? 7) || 0))),
    grace_period_days: Math.max(0, Math.min(30, Math.trunc(Number(access.gracePeriodDays ?? 3) || 0))),
    status: normalizedStatus,
    automation_enabled: true,
    renewal_mode: "automatic",
    auto_renew_cancelled_at: null,
    initial_payment_required: store.initialPaymentRequired === true,
  }, { onConflict: "store_id" }).select("id,store_id,status,automation_enabled,renewal_mode,auto_renew_cancelled_at,next_billing_at,amount_centavos,currency,pending_amount_centavos,pending_amount_effective_at,initial_payment_required").single();
  if (error) throw error;
  return data;
};

const getUserProfile = async (admin: any, userId: string): Promise<UserProfile | null> => {
  const { data, error } = await admin.from("users").select("data").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data?.data as UserProfile | undefined) || null;
};

const mergeUserData = async (admin: any, userId: string, patch: Record<string, unknown>) => {
  const profile = await getUserProfile(admin, userId);
  if (!profile) throw new Error("User profile was not found.");
  const { error } = await admin.from("users").update({
    data: { ...profile, ...patch, updatedAt: timestamp() },
  }).eq("id", userId);
  if (error) throw error;
};

const DRIVE_FILE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
  /[?&]fileId=([a-zA-Z0-9_-]+)/,
  /\/d\/([a-zA-Z0-9_-]+)/,
];

const extractDriveFileId = (value: unknown) => {
  const url = String(value || "").trim();
  for (const pattern of DRIVE_FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
};

const collectDriveFileIds = (value: unknown, result: Set<string>) => {
  if (typeof value === "string") {
    for (const pattern of DRIVE_FILE_ID_PATTERNS) {
      const match = value.match(pattern);
      if (match?.[1]) result.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectDriveFileIds(entry, result));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectDriveFileIds(entry, result));
  }
};

const getGasEmailDiagnostics = async (): Promise<{
  remainingDailyRecipientQuota: number | null;
  checkedAt: string;
  error: string;
}> => {
  const checkedAt = new Date().toISOString();
  try {
    const secret = requiredEnv("DRIVE_CRUD_SECRET");
    const url = Deno.env.get("GAS_EMAIL_URL") ||
      Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
      DEFAULT_GAS_UPLOAD_URL;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "email_diagnostics", secret }),
    });
    const data = await response.json().catch(() => ({}));
    const quota = Number(data?.emailDiagnostics?.remainingDailyRecipientQuota);
    if (!response.ok || data?.success !== true || !Number.isFinite(quota)) {
      throw new Error(data?.error || `GAS diagnostics returned HTTP ${response.status}.`);
    }
    return {
      remainingDailyRecipientQuota: Math.max(0, Math.trunc(quota)),
      checkedAt: String(data?.emailDiagnostics?.checkedAt || checkedAt),
      error: "",
    };
  } catch (error) {
    return {
      remainingDailyRecipientQuota: null,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 500) : "GAS diagnostics could not be reached.",
    };
  }
};

const deleteDriveFile = async (fileId: string) => {
  const secret = requiredEnv("DRIVE_CRUD_SECRET");
  const url = Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "delete", secret, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Drive delete failed with HTTP ${response.status}.`);
};

const permanentlyDeleteDriveFile = async (fileId: string) => {
  const secret = requiredEnv("DRIVE_CRUD_SECRET");
  const url = Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") || DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "permanent_delete", secret, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.permanentlyDeleted) {
    throw new Error(data.error || `Drive permanent deletion failed with HTTP ${response.status}.`);
  }
};

const deletionProofPayload = (userId: string, expiresAt: number) => `${userId}.${expiresAt}`;

const createDeletionProof = async (secret: string, userId: string, expiresAt: number) => {
  const payload = deletionProofPayload(userId, expiresAt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${expiresAt}.${bytesToHex(new Uint8Array(signature))}`;
};

const verifyDeletionProof = async (secret: string, proof: string, userId: string) => {
  const [expiresText, signatureHex, ...rest] = proof.split(".");
  const expiresAt = Number(expiresText);
  if (rest.length || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !/^[a-f0-9]{64}$/.test(signatureHex || "")) {
    return false;
  }
  const expected = await createDeletionProof(secret, userId, expiresAt);
  return timingSafeEqual(expected, proof);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const verifyDeletionOtp = async (otpToken: string, otpCode: string, email: string) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "verify_otp",
      otpToken,
      otpCode,
      recipientEmail: email,
      // The deployed GAS service currently supports this identity-verification purpose.
      // This endpoint only verifies the code; it never updates the user's email.
      purpose: "email_change",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.otp?.verified) {
    throw new Error(data.error || "The deletion OTP is invalid or expired.");
  }
};

const emailDate = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) {
      return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "long",
        timeZone: "Asia/Manila",
      }).format(new Date(seconds * 1000));
    }
  }
  return "";
};

const paymentScheduleLabel = (value: unknown, intervalDays: unknown = 30) => {
  const schedule = cleanText(value, 60);
  if (schedule === "every_30_days") return `Every ${Math.max(1, Math.min(365, Math.trunc(Number(intervalDays) || 30)))} days from subscription start`;
  return schedule.replaceAll("_", " ");
};

const sendStoreCreatedEmail = async ({
  recipientEmail,
  userName,
  store,
  requirePasswordChange,
  loginLink,
}: {
  recipientEmail: string;
  userName: string;
  store: Record<string, unknown>;
  requirePasswordChange: boolean;
  loginLink: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "store_created",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      requirePasswordChange,
      loginLink,
      store: {
        name: cleanText(store.name, 120),
        location: cleanText(store.location || store.address, 240),
        logoUrl: cleanText(store.logoUrl, 2000),
        subscriptionLevel: cleanText(store.subscriptionLevel, 80),
        paymentSchedule: paymentScheduleLabel(store.paymentSchedule, store.billingIntervalDays),
        subscriptionStart: emailDate(store.subscriptionStart),
        subscriptionEnd: emailDate(store.subscriptionEnd),
        amountDue: Number(store.owedAmount || 0),
        billingIntervalDays: Math.max(1, Math.min(365, Math.trunc(Number(store.billingIntervalDays) || 30))),
        initialPaymentRequired: store.initialPaymentRequired === true,
        initialPaymentStatus: cleanText(store.initialPaymentStatus, 20),
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Store email failed with HTTP ${response.status}.`);
  }
};

const sendSubscriptionPaymentReceivedEmail = async ({
  recipientEmail,
  userName,
  invoice,
}: {
  recipientEmail: string;
  userName: string;
  invoice: Record<string, unknown>;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "subscription_payment_received",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      invoice,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Payment receipt email failed with HTTP ${response.status}.`);
  }
};

const sendStaffCreatedEmail = async ({
  recipientEmail,
  userName,
  storeName,
  requirePasswordChange,
  loginLink,
}: {
  recipientEmail: string;
  userName: string;
  storeName: string;
  requirePasswordChange: boolean;
  loginLink: string;
}) => {
  const url = Deno.env.get("GAS_EMAIL_URL") ||
    Deno.env.get("GOOGLE_DRIVE_UPLOAD_URL") ||
    DEFAULT_GAS_UPLOAD_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "staff_created",
      secret: requiredEnv("DRIVE_CRUD_SECRET"),
      recipientEmail,
      userName,
      storeName,
      requirePasswordChange,
      loginLink,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.email) {
    throw new Error(data.error || `Staff email failed with HTTP ${response.status}.`);
  }
};
