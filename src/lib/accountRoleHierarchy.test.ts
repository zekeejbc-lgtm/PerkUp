import { describe, expect, it } from "vitest";
import {
  accountRoleRank,
  canAssignAccountRole,
  canManageAccountRole,
} from "./accountRoleHierarchy";

describe("account role hierarchy", () => {
  it("places auditor above administrator and assistant administrator", () => {
    expect(accountRoleRank("auditor")).toBeGreaterThan(accountRoleRank("admin"));
    expect(accountRoleRank("admin")).toBeGreaterThan(accountRoleRank("assistant_admin"));
  });

  it("allows management only down the hierarchy", () => {
    expect(canManageAccountRole("auditor", "admin")).toBe(true);
    expect(canManageAccountRole("admin", "auditor")).toBe(false);
    expect(canManageAccountRole("admin", "assistant_admin")).toBe(true);
    expect(canManageAccountRole("auditor", "auditor")).toBe(false);
  });

  it("reserves the auditor role for the transfer workflow", () => {
    expect(canAssignAccountRole("auditor", "auditor")).toBe(false);
    expect(canAssignAccountRole("auditor", "admin")).toBe(true);
    expect(canAssignAccountRole("admin", "admin")).toBe(false);
  });
});
