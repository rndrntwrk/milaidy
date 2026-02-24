import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { matchTrustedAdminAllowlist } from "../runtime/trusted-admin.js";

type WorldMetadataShape = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
};

function normalizeRole(role: string | undefined): string {
  return (role ?? "").toUpperCase();
}

export const adminTrustProvider: Provider = createAdminTrustProvider();

export function createAdminTrustProvider(): Provider {
  return {
    name: "miladyAdminTrust",
    description:
      "Marks owner/admin chat identity as trusted for contact assertions (rolodex-oriented).",
    dynamic: true,
    position: 11,
    async get(
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      let ownerId: string | undefined;
      let role: string | undefined;

      const room = await runtime.getRoom(message.roomId);
      if (room?.worldId) {
        const world = await runtime.getWorld(room.worldId);
        const metadata = (world?.metadata ?? {}) as WorldMetadataShape;
        ownerId = metadata.ownership?.ownerId;
        role = ownerId ? metadata.roles?.[ownerId] : undefined;
      }

      const ownerTrusted =
        typeof ownerId === "string" &&
        ownerId.length > 0 &&
        normalizeRole(role) === "OWNER" &&
        message.entityId === ownerId;

      const allowlistMatch = matchTrustedAdminAllowlist(runtime, message);
      const allowlistTrusted = allowlistMatch.trusted;
      const isTrustedAdmin = ownerTrusted || allowlistTrusted;
      const trustSource = ownerTrusted
        ? "world_owner"
        : allowlistTrusted
          ? "allowlist"
          : "none";
      const provider = allowlistMatch.provider ?? "";
      const senderIds = allowlistMatch.senderIds;

      const text = ownerTrusted
        ? "Admin trust: current speaker is world OWNER."
        : allowlistTrusted
          ? `Admin trust: caller matched trusted admin allowlist (${allowlistMatch.matchedId ?? "matched"}).`
          : "Admin trust: caller is not in trusted admin scope.";

      return {
        text,
        values: {
          trustedAdmin: isTrustedAdmin,
          trustedAdminSource: trustSource,
          trustedAdminProvider: provider,
          trustedAdminMatchedId: allowlistMatch.matchedId ?? "",
          trustedAdminSenderIds: senderIds.join(","),
          adminEntityId: ownerId ?? "",
          adminRole: role ?? "",
        },
        data: {
          trustedAdmin: isTrustedAdmin,
          trustSource,
          provider: provider || null,
          senderIds,
          matchedId: allowlistMatch.matchedId ?? null,
          ownerId: ownerId ?? null,
          role: role ?? null,
        },
      };
    },
  };
}
