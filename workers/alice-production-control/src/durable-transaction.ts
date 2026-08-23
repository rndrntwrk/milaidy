/**
 * Run one state transition against a private candidate and publish that
 * candidate only after durable persistence succeeds.
 */
export async function commitCopyOnWrite<TState, TResult>(
  current: TState,
  clone: (state: TState) => TState,
  mutate: (candidate: TState) => TResult,
  persist: (candidate: TState) => Promise<void>,
  shouldPersist: (result: TResult) => boolean,
): Promise<{ state: TState; result: TResult }> {
  const candidate = clone(current);
  const result = mutate(candidate);
  if (!shouldPersist(result)) return { state: current, result };
  await persist(candidate);
  return { state: candidate, result };
}
