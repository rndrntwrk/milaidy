import type { Room } from "@elizaos/core";

/**
 * Format a Room into a "[source] name" tag for display in provider output.
 */
export function roomSourceTag(room: Room | null): string {
  if (!room) return "[unknown]";
  const roomAny = room as unknown as Record<string, unknown>;
  const source =
    typeof roomAny.source === "string" ? roomAny.source : (room.type ?? "chat");
  const name =
    typeof roomAny.name === "string" ? roomAny.name : room.id?.slice(0, 8);
  return `[${source}] ${name}`;
}

/**
 * Format a createdAt timestamp as a human-readable relative string.
 */
export function formatRelativeTimestamp(createdAt?: number): string {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
