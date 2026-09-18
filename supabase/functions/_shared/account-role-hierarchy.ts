export const PRIVILEGED_ACCOUNT_ROLES = new Set(["assistant_admin", "admin", "auditor"]);

const ACCOUNT_ROLE_RANK: Record<string, number> = {
  customer: 0,
  staff: 0,
  store_owner: 0,
  assistant_admin: 1,
  admin: 2,
  auditor: 3,
};

export const accountRoleRank = (role: unknown) =>
  ACCOUNT_ROLE_RANK[String(role || "").trim().toLowerCase()] ?? -1;

export const canManageAccountRole = (actorRole: unknown, targetRole: unknown) =>
  accountRoleRank(actorRole) > accountRoleRank(targetRole);

export const canAssignAccountRole = (actorRole: unknown, nextRole: unknown) => {
  const normalizedNextRole = String(nextRole || "").trim().toLowerCase();
  if (normalizedNextRole === "auditor") return false;
  return accountRoleRank(actorRole) > accountRoleRank(normalizedNextRole);
};
