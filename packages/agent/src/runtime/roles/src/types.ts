export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";

export const ROLE_RANK: Record<RoleName, number> = {
  OWNER: 4,
  ADMIN: 3,
  USER: 2,
  GUEST: 1,
};

export type RoleGrantSource = "owner" | "manual" | "connector_admin";

export type ConnectorAdminWhitelist = Record<string, string[]>;

export interface RolesWorldMetadata {
  ownership?: { ownerId?: string };
  roles?: Record<string, RoleName>;
  roleSources?: Record<string, RoleGrantSource>;
  [key: string]: unknown;
}

export interface RolesConfig {
  connectorAdmins?: ConnectorAdminWhitelist;
}

export interface RoleCheckResult {
  role: RoleName;
  isOwner: boolean;
  isAdmin: boolean;
  hasPrivateAccess: boolean;
}
