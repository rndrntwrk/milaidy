export const ALICE_RUNTIME_CONTAINER_NAME = "alice-production-runtime";
export const ALICE_RUNTIME_CONTAINER_PORT = 2138;

export type AliceRuntimeContainerNamespace = {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
};

export function fetchAliceRuntimeContainer(
  namespace: AliceRuntimeContainerNamespace,
  request: Request,
): Promise<Response> {
  return namespace.getByName(ALICE_RUNTIME_CONTAINER_NAME).fetch(request);
}
