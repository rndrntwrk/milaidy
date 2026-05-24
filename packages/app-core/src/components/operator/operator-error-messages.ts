export type OperatorTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function isOperatorAuthErrorMessage(
  message: string | null | undefined,
): boolean {
  return /\b(401|403|unauthorized|forbidden|authentication required|not authenticated)\b/i.test(
    String(message ?? ""),
  );
}

export function formatOperatorErrorMessage(
  message: string | null | undefined,
  fallback: string,
  t: OperatorTranslator,
): string {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (isOperatorAuthErrorMessage(trimmed)) {
    return t("aliceoperator.authReconnectRequired", {
      defaultValue:
        "Streaming controls need authentication. Open Go Live setup to reconnect.",
    });
  }
  return trimmed || fallback;
}

export function formatUnknownOperatorError(
  error: unknown,
  fallback: string,
  t: OperatorTranslator,
): string {
  return formatOperatorErrorMessage(
    error instanceof Error ? error.message : null,
    fallback,
    t,
  );
}
