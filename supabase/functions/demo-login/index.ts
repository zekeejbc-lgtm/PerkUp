import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const DEMO_PASSWORD = "password123";
const DEMO_STORE_ID = "demo-store-main";
const DEMO_EMAIL_DOMAIN = "perkup.local";

const roleConfig = {
  customer: {
    email: "demo_customer@perkup.local",
    name: "Demo Customer",
    profile: { role: "customer", username: "demo.customer", phone: "09000000001" },
  },
  store_owner: {
    email: "demo_store_owner@perkup.local",
    name: "Demo Store Owner",
    profile: { role: "store_owner", storeId: DEMO_STORE_ID, branchLimit: 3 },
  },
  staff: {
    email: "demo_staff@perkup.local",
    name: "Demo Staff",
    profile: { role: "staff", storeId: DEMO_STORE_ID },
  },
  admin: {
    email: "demo_admin@perkup.local",
    name: "Demo Admin",
    profile: { role: "admin" },
  },
} as const;

type DemoRole = keyof typeof roleConfig;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const timestamp = () => ({
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
});

const cleanRole = (value: unknown): DemoRole | null => {
  const role = String(value || "").trim().toLowerCase();
  return role in roleConfig ? role as DemoRole : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "ensure").trim().toLowerCase();

    if (action === "erase") {
      requireEraseSecret(body.secret);
      const admin = getAdminClient();
      const erased = await eraseDemoAccounts(admin);
      return jsonResponse({ erased });
    }

    if (Deno.env.get("DEMO_LOGIN_ENABLED") === "false") {
      return jsonResponse({ error: "Demo login is disabled." }, 404);
    }

    const role = cleanRole(body.role);
    if (!role) return jsonResponse({ error: "Unsupported demo role." }, 400);

    const admin = getAdminClient();

    if (role === "staff") {
      await ensureDemoAccount(admin, "store_owner");
    }

    const user = await ensureDemoAccount(admin, role);

    return jsonResponse({
      email: roleConfig[role].email,
      userId: user.id,
    });
  } catch (error) {
    console.error("demo-login failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Demo login setup failed." }, 500);
  }
});

const getAdminClient = () => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
};

const requireEraseSecret = (providedSecret: unknown) => {
  const expectedSecret = Deno.env.get("DEMO_LOGIN_ADMIN_SECRET");
  if (!expectedSecret) {
    throw new Error("DEMO_LOGIN_ADMIN_SECRET is not configured.");
  }
  if (String(providedSecret || "") !== expectedSecret) {
    throw new Error("Unauthorized demo account cleanup.");
  }
};

const ensureDemoAccount = async (admin: any, role: DemoRole) => {
  const config = roleConfig[role];
  const existingUser = await findUserByEmail(admin, config.email);
  const authUser = existingUser
    ? await updateAuthUser(admin, existingUser.id, config.name)
    : await createAuthUser(admin, config.email, config.name);

  if (role === "store_owner") {
    await upsertDemoStore(admin, authUser.id);
  }

  await upsertProfile(admin, authUser.id, {
    email: config.email,
    name: config.name,
    isDemo: true,
    ...config.profile,
  });

  if (role === "customer") {
    await upsertCustomer(admin, authUser.id, config.name);
  }

  return authUser;
};

const eraseDemoAccounts = async (admin: any) => {
  const users = [];
  for (const config of Object.values(roleConfig)) {
    const user = await findUserByEmail(admin, config.email);
    if (user) users.push(user);
  }

  const userIds = users.map((user: { id: string }) => user.id);
  const demoEmails = Object.values(roleConfig).map((config) => config.email);

  await deleteRows(admin, "promotions_scanned", "data->>storeId", DEMO_STORE_ID);
  await deleteRows(admin, "cards", "data->>storeId", DEMO_STORE_ID);
  await deleteRows(admin, "cards", "data->>customerId", userIds);
  await deleteRows(admin, "products", "data->>storeId", DEMO_STORE_ID);
  await deleteRows(admin, "promotions", "data->>storeId", DEMO_STORE_ID);
  await deleteRows(admin, "feedback", "data->>storeId", DEMO_STORE_ID);
  await deleteRows(admin, "branch_requests", "data->>ownerId", userIds);
  await deleteRows(admin, "customers", "id", userIds);
  await deleteRows(admin, "users", "id", userIds);
  await deleteRows(admin, "stores", "id", DEMO_STORE_ID);

  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error && !String(error.message || "").toLowerCase().includes("not found")) {
      throw error;
    }
  }

  return {
    authUsers: users.length,
    emails: demoEmails,
    storeId: DEMO_STORE_ID,
  };
};

const deleteRows = async (admin: any, table: string, column: string, value: string | string[]) => {
  if (Array.isArray(value) && value.length === 0) return;

  const query = admin.from(table).delete();
  const { error } = Array.isArray(value)
    ? await query.in(column, value)
    : await query.eq(column, value);

  if (error && !String(error.message || "").toLowerCase().includes("does not exist")) {
    throw error;
  }
};

const findUserByEmail = async (admin: any, email: string) => {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user: { email?: string }) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  throw new Error("Could not scan Auth users for the demo account.");
};

const createAuthUser = async (admin: any, email: string, name: string) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, name },
  });
  if (error || !data.user) throw error || new Error(`Could not create ${email}.`);
  return data.user;
};

const updateAuthUser = async (admin: any, userId: string, name: string) => {
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, name },
  });
  if (error || !data.user) throw error || new Error(`Could not update ${userId}.`);
  return data.user;
};

const upsertProfile = async (admin: any, userId: string, data: Record<string, unknown>) => {
  const now = timestamp();
  const { error } = await admin.from("users").upsert({
    id: userId,
    data: {
      ...data,
      forcePasswordReset: false,
      createdAt: now,
      updatedAt: now,
    },
  });
  if (error) throw error;
};

const upsertCustomer = async (admin: any, userId: string, name: string) => {
  const now = timestamp();
  const { error } = await admin.from("customers").upsert({
    id: userId,
    data: {
      name,
      email: `demo_customer@${DEMO_EMAIL_DOMAIN}`,
      isDemo: true,
      lifetimeStars: 0,
      qrVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
  if (error) throw error;
};

const upsertDemoStore = async (admin: any, ownerId: string) => {
  const now = timestamp();
  const { data: existingStore, error: readError } = await admin
    .from("stores")
    .select("data")
    .eq("id", DEMO_STORE_ID)
    .maybeSingle();

  if (readError) throw readError;

  const existingData = existingStore?.data && typeof existingStore.data === "object"
    ? existingStore.data
    : {};

  const { error } = await admin.from("stores").upsert({
    id: DEMO_STORE_ID,
    data: {
      ...existingData,
      name: existingData.name || "Demo Coffee",
      businessName: existingData.businessName || "Demo Coffee",
      branchName: existingData.branchName || "Main",
      isPrimaryBranch: existingData.isPrimaryBranch ?? true,
      ownerId,
      isDemo: true,
      status: "active",
      category: existingData.category || "Cafe",
      location: existingData.location || existingData.address || "Demo District",
      address: existingData.address || "Demo District",
      lat: existingData.lat ?? 14.5995,
      lng: existingData.lng ?? 120.9842,
      createdAt: existingData.createdAt || now,
      updatedAt: now,
    },
  });
  if (error) throw error;
};
