import { assertEquals } from "jsr:@std/assert@1";
import {
  accountRoleRank,
  canAssignAccountRole,
  canManageAccountRole,
} from "./account-role-hierarchy.ts";

Deno.test("account roles follow auditor above administrator above assistant administrator", () => {
  assertEquals(accountRoleRank("auditor"), 3);
  assertEquals(accountRoleRank("admin"), 2);
  assertEquals(accountRoleRank("assistant_admin"), 1);
});

Deno.test("privileged accounts can manage only lower-ranked roles", () => {
  assertEquals(canManageAccountRole("auditor", "admin"), true);
  assertEquals(canManageAccountRole("admin", "auditor"), false);
  assertEquals(canManageAccountRole("admin", "assistant_admin"), true);
  assertEquals(canManageAccountRole("assistant_admin", "admin"), false);
  assertEquals(canManageAccountRole("auditor", "auditor"), false);
});

Deno.test("auditor authority can only be assigned through the transfer workflow", () => {
  assertEquals(canAssignAccountRole("auditor", "auditor"), false);
  assertEquals(canAssignAccountRole("auditor", "admin"), true);
  assertEquals(canAssignAccountRole("admin", "assistant_admin"), true);
  assertEquals(canAssignAccountRole("admin", "admin"), false);
});
