/**
 * Merge streaming text updates that may arrive as pure deltas, cumulative
 * snapshots, or overlapping suffix/prefix fragments.
 */
export function mergeStreamingText(existing: string, incoming: string): string {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (incoming === existing) return existing;

  // Common case: the stream sends the full text-so-far.
  if (incoming.startsWith(existing)) {
    return incoming;
  }

  // Some providers resend the full text with a revised prefix or wrapper.
  if (incoming.includes(existing)) {
    return incoming;
  }

  // Ignore clearly regressive snapshots.
  if (existing.startsWith(incoming)) {
    return existing;
  }

  const maxOverlap = Math.min(existing.length, incoming.length);
  const existingLength = existing.length;
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const existingStart = existingLength - overlap;
    let match = true;
    for (let index = 0; index < overlap; index += 1) {
      if (
        existing.charCodeAt(existingStart + index) !==
        incoming.charCodeAt(index)
      ) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    if (overlap === incoming.length) {
      // Preserve repeated single-character and two-character deltas like
      // "l" + "l" or "ha" + "ha", but avoid replaying larger suffixes.
      return incoming.length <= 2 ? `${existing}${incoming}` : existing;
    }

    return `${existing}${incoming.slice(overlap)}`;
  }

  return `${existing}${incoming}`;
}

export function computeStreamingDelta(
  existing: string,
  incoming: string,
): string {
  const merged = mergeStreamingText(existing, incoming);
  if (merged === existing) return "";
  if (merged.startsWith(existing)) {
    return merged.slice(existing.length);
  }
  return incoming;
}
