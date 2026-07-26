import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [runtimeControl, maintenanceScreen, app, authContext, adminBackend] = await Promise.all([
  read("src/pages/admin/AdminRuntimeControl.tsx"),
  read("src/components/MaintenanceScreen.tsx"),
  read("src/App.tsx"),
  read("src/contexts/AuthContext.tsx"),
  read("supabase/functions/admin-backend/index.ts"),
]);

assert.match(runtimeControl, /action:\s*"end_maintenance_mode"/);
assert.match(runtimeControl, /END MAINTENANCE MODE/);
assert.match(runtimeControl, /config\.mode === "maintenance"\s*\?\s*endMaintenance\s*:\s*initiateMaintenance/);
assert.doesNotMatch(maintenanceScreen, /Auditor recovery access/);
assert.match(maintenanceScreen, /logoPressCount\.current \+= 1/);
assert.match(maintenanceScreen, /logoPressCount\.current < 10/);
assert.match(maintenanceScreen, /<AuthModal[\s\S]*?initialMode="signin"/);
assert.match(maintenanceScreen, /allowedSignInRoles=\{\["auditor", "admin"\]\}/);
assert.doesNotMatch(maintenanceScreen, /variant="maintenance"/);
assert.match(app, /\["admin", "auditor"\]\.includes\(user\?\.role \|\| ""\)/);
assert.match(authContext, /\["admin", "auditor"\]\.includes\(existingUser\.role \|\| ""\)/);
assert.match(authContext, /runtimeModeRef\.current === "maintenance" && !hasMaintenanceAccess/);
assert.match(authContext, /if \(runtimeModeLoading\) return;[\s\S]*?auth\.onAuthStateChanged/);
assert.match(authContext, /\}, \[runtimeModeLoading\]\);/);

const requiredAuditedMutations = [
  "update_public_feedback",
  "update_error_report",
  "sync_subscription_billing",
  "retry_billing_invoice",
  "update_subscription_access",
  "update_account_restriction",
  "create_store",
  "create_branch",
  "decide_branch_request",
  "reject_application",
  "reset_password",
  "adjust_card_stars",
  "adjust_card_promotion",
  "delete_store",
  "delete_store_group",
];
for (const action of requiredAuditedMutations) {
  assert.match(
    adminBackend,
    new RegExp(String.raw`AUTO_AUDITED_MUTATIONS[\s\S]*?"${action}"`),
    `${action} must be covered by automatic actor-stamped auditing`,
  );
}

assert.match(adminBackend, /admin\.rpc\("get_auditor_audit_overview"\)/);
assert.match(adminBackend, /admin\.rpc\("list_auditor_audit_records"/);

const migrationPaths = [];
for await (const path of glob("supabase/migrations/*harden_auditor_audit_pipeline.sql", {
  cwd: new URL("..", import.meta.url),
})) {
  migrationPaths.push(path);
}
assert.equal(migrationPaths.length, 1, "Expected exactly one auditor hardening migration");
const migration = await read(migrationPaths[0].replaceAll("\\", "/"));
assert.match(migration, /actor_role = 'legacy_unattributed'/);
assert.match(migration, /grant execute on function public\.get_auditor_audit_overview\(\) to service_role/);
assert.match(
  migration,
  /revoke all on function public\.list_auditor_audit_records[\s\S]*?from public, anon, authenticated/,
);

console.log("Auditor role regression checks passed.");
