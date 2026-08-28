type StatePlaneFetcher = {
  fetch(request: Request): Promise<Response>;
};

async function boundedResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 1_000_000) {
    throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
  }
  const value = await response.json();
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).ok !== true
  ) {
    throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
  }
  return value as Record<string, unknown>;
}

export function createAliceStatePlaneClient(
  binding: StatePlaneFetcher,
  token: string,
) {
  if (!binding || typeof binding.fetch !== "function" || token.length < 32) {
    throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
  }
  const invoke = async (operation: Record<string, unknown>) => {
    const response = await binding.fetch(
      new Request("https://alice-state.internal/v1/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alice-state-token": token,
        },
        body: JSON.stringify(operation),
      }),
    );
    return boundedResponse(response);
  };
  return {
    async getRecord(kind: string, recordId: string, ownerId: string) {
      const value = await invoke({ operation: "record.get", kind, recordId, ownerId });
      return (value.record ?? null) as {
        payload: unknown;
        updatedAt: number;
      } | null;
    },
    async applyAtomic(input: { operationId: string; records: unknown[] }) {
      await invoke({ operation: "records.atomic", ...input });
    },
  };
}
