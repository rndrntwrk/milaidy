// Stub for @elizaos/plugin-coding-agent used in e2e tests.
// The real module is optional and not available in all environments.
export const codingAgentPlugin = {
  name: "@elizaos/agent-orchestrator",
  description: "Stub coding agent plugin for e2e tests",
  actions: [],
  providers: [],
  routes: [],
};

export default codingAgentPlugin;

export function createCodingAgentRouteHandler() {
  return async () => undefined;
}

export function getCoordinator() {
  return undefined;
}

export interface SwarmEvent {
  type: string;
  [key: string]: unknown;
}

export interface PTYService {
  coordinator: null;
}
