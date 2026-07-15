export const sessionNeedsMfa = async (
  userClient: any,
  authorization: string,
) => {
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return false;

  const { data, error } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (error) throw error;

  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
};
