export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export function googleErrorRequiresReauth(
  status: number,
  message: string,
): boolean {
  if (status === 401) {
    return true;
  }

  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("invalid_grant") ||
    normalized.includes("expired or revoked") ||
    normalized.includes("token has been expired or revoked") ||
    normalized.includes("needs re-authentication") ||
    normalized.includes("needs reauthentication")
  );
}

export function googleErrorLooksLikeAdminPolicyBlock(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("admin policy") ||
    normalized.includes("administrator") ||
    normalized.includes("not allowed by your organization") ||
    normalized.includes("not allowed by your domain") ||
    normalized.includes("access blocked") ||
    normalized.includes("workspace") ||
    normalized.includes("restricted to users within its organization")
  );
}
