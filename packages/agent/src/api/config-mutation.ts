const mutationQueues = new WeakMap<object, Promise<void>>();

export async function runSerializedConfigMutation<T>(
  key: object,
  mutation: () => Promise<T>,
): Promise<T> {
  const prior = mutationQueues.get(key) ?? Promise.resolve();
  const run = prior.catch(() => {}).then(mutation);
  const marker = run.then(
    () => undefined,
    () => undefined,
  );
  mutationQueues.set(key, marker);
  try {
    return await run;
  } finally {
    if (mutationQueues.get(key) === marker) mutationQueues.delete(key);
  }
}
