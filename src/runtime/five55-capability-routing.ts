import type { Five55Capability } from "./five55-capability-policy.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
}

function isWriteMethod(method: string): boolean {
  return !isReadMethod(method);
}

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export function resolveFive55CapabilityForRequest(
  method: string,
  pathname: string,
): Five55Capability | null {
  const normalizedMethod = method.toUpperCase();

  if (pathname === "/api/onboarding") {
    return isWriteMethod(normalizedMethod) ? "theme.write" : "theme.read";
  }
  if (startsWithAny(pathname, ["/api/theme", "/api/ui/theme"])) {
    return isWriteMethod(normalizedMethod) ? "theme.write" : "theme.read";
  }

  if (
    pathname === "/api/chat/stream" ||
    /^\/api\/conversations\/[^/]+\/messages\/stream$/.test(pathname)
  ) {
    return "chat.transport";
  }

  if (pathname.startsWith("/api/stream")) {
    return isWriteMethod(normalizedMethod) ? "stream.control" : "stream.read";
  }

  if (
    startsWithAny(pathname, ["/api/quest", "/api/quests", "/api/challenge"])
  ) {
    if (isReadMethod(normalizedMethod)) return "quests.read";
    if (/\/(complete|claim|finish)$/.test(pathname)) return "quests.complete";
    return "quests.create";
  }

  if (startsWithAny(pathname, ["/api/battle", "/api/battles"])) {
    if (isReadMethod(normalizedMethod)) return "battles.read";
    if (/\/(resolve|settle|judge|end)$/.test(pathname))
      return "battles.resolve";
    return "battles.create";
  }

  if (startsWithAny(pathname, ["/api/leaderboard", "/api/leaderboards"])) {
    return isReadMethod(normalizedMethod)
      ? "leaderboard.read"
      : "leaderboard.write";
  }
  if (startsWithAny(pathname, ["/api/score", "/api/scores"])) {
    return isReadMethod(normalizedMethod)
      ? "games.capture_score"
      : "games.submit_score";
  }

  if (
    startsWithAny(pathname, [
      "/api/reward",
      "/api/rewards",
      "/api/payout",
      "/api/payouts",
      "/api/settlement",
    ])
  ) {
    return isReadMethod(normalizedMethod)
      ? "rewards.project"
      : "rewards.allocate";
  }

  if (
    pathname === "/api/wallet/balances" ||
    pathname === "/api/wallet/addresses" ||
    pathname === "/api/wallet/nfts" ||
    pathname === "/api/wallet/config"
  ) {
    return "wallet.read_balance";
  }
  if (
    startsWithAny(pathname, ["/api/wallet/transfer", "/api/wallet/withdraw"]) ||
    /\/api\/wallet\/.*(payout|send|settle)/.test(pathname)
  ) {
    return "wallet.prepare_transfer";
  }

  return null;
}

export function resolveFive55CapabilityForAction(
  actionName: string,
  actionDescription?: string,
): Five55Capability | null {
  const text = `${actionName} ${actionDescription ?? ""}`.toLowerCase();

  if (/(theme|skin|palette)/.test(text)) return "theme.write";

  if (/(leaderboard|ranking|rank)/.test(text)) {
    if (/(update|write|submit|publish|set)/.test(text))
      return "leaderboard.write";
    return "leaderboard.read";
  }

  if (/(score|scoring|points?)/.test(text)) {
    if (/(submit|record|write|post|capture)/.test(text))
      return "games.submit_score";
    return "games.capture_score";
  }

  if (
    /(quest|challenge)/.test(text) &&
    !/(battle|matchmaking|duel|arena)/.test(text)
  ) {
    if (/(complete|finish|claim)/.test(text)) return "quests.complete";
    if (/(create|new|start|assign)/.test(text)) return "quests.create";
    return "quests.read";
  }

  if (/(battle|matchmaking|duel|arena)/.test(text)) {
    if (/(resolve|end|judge|settle)/.test(text)) return "battles.resolve";
    if (/(create|new|start|challenge|duel|issue)/.test(text)) {
      return "battles.create";
    }
    return "battles.read";
  }

  if (/(reward|payout|settlement|usdc|credits?)/.test(text)) {
    if (/(allocate|award|distribute|pay|withdraw|transfer|settle)/.test(text)) {
      return "rewards.allocate";
    }
    return "rewards.project";
  }

  if (/(wallet|treasury|sw4p|swap)/.test(text)) {
    if (/(transfer|withdraw|send|settle|pay|execute)/.test(text)) {
      return "wallet.prepare_transfer";
    }
    return "wallet.read_balance";
  }

  if (/(stream|broadcast|spectate|live)/.test(text)) {
    if (/(start|stop|switch|control|mute|unmute|schedule)/.test(text)) {
      return "stream.control";
    }
    return "stream.read";
  }

  return null;
}
