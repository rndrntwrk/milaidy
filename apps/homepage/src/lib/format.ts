export function formatUptime(seconds?: number, verbose?: boolean): string {
  if (seconds == null || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (verbose) {
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (parts.length === 0) parts.push(`${s}s`);
    return parts.join(" ");
  }

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const NUMBER_FORMATTER = new Intl.NumberFormat();
const MONEY_FORMATTER = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShortDate(value?: string, fallback = "—"): string {
  const date = parseDate(value);
  return date ? SHORT_DATE_FORMATTER.format(date) : fallback;
}

export function formatDateTime(value?: string, fallback = "—"): string {
  const date = parseDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : fallback;
}

export function formatTime(value?: string, fallback = "—"): string {
  const date = parseDate(value);
  return date ? TIME_FORMATTER.format(date) : fallback;
}

export function formatRelativeTime(value?: string, fallback = ""): string {
  const date = parseDate(value);
  if (!date) {
    return fallback;
  }

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) {
    return "now";
  }
  if (mins < 60) {
    return `${mins}m`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatSourceUrl(
  value?: string,
  fallback = "No endpoint published",
): string {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

export function formatNumber(value?: number | null, fallback = "—"): string {
  return value == null ? fallback : NUMBER_FORMATTER.format(value);
}

export function formatMoney(value?: number | null, fallback = "—"): string {
  return value == null ? fallback : MONEY_FORMATTER.format(value);
}
