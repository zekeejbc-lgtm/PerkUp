import type { Role } from "../contexts/AuthContext";

const ACCOUNT_ROLE_RANK: Record<Role, number> = {
  customer: 0,
  staff: 0,
  store_owner: 0,
  assistant_admin: 1,
  admin: 2,
  auditor: 3,
};

export const accountRoleRank = (role: Role | string | null | undefined) =>
  ACCOUNT_ROLE_RANK[role as Role] ?? -1;

export const canManageAccountRole = (
  actorRole: Role | string | null | undefined,
  targetRole: Role | string | null | undefined,
) => accountRoleRank(actorRole) > accountRoleRank(targetRole);

export const canAssignAccountRole = (
  actorRole: Role | string | null | undefined,
  nextRole: Role | string | null | undefined,
) => nextRole !== "auditor" && accountRoleRank(actorRole) > accountRoleRank(nextRole);
