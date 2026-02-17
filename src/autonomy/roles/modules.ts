/**
 * In-process role module registry.
 *
 * Provides explicit service-module wrappers for role instances so startup,
 * shutdown, and health/readiness can be managed per role boundary.
 *
 * @module autonomy/roles/modules
 */

import type {
  AuditorRole,
  ExecutorRole,
  MemoryWriterRole,
  PlannerRole,
  RoleOrchestrator,
  SafeModeController,
  VerifierRole,
} from "./types.js";

export type RoleModuleName =
  | "planner"
  | "executor"
  | "verifier"
  | "memory_writer"
  | "auditor"
  | "safe_mode"
  | "orchestrator";

export interface RoleModuleHealth {
  available: boolean;
  ready: boolean;
  healthy: boolean;
  requiredMethods: string[];
  missingMethods: string[];
  running: boolean;
}

export interface RoleModuleRegistrySnapshot {
  planner: RoleModuleHealth;
  executor: RoleModuleHealth;
  verifier: RoleModuleHealth;
  memory_writer: RoleModuleHealth;
  auditor: RoleModuleHealth;
  safe_mode: RoleModuleHealth;
  orchestrator: RoleModuleHealth;
}

export interface RoleModuleInstances {
  planner: PlannerRole | null;
  executor: ExecutorRole | null;
  verifier: VerifierRole | null;
  memory_writer: MemoryWriterRole | null;
  auditor: AuditorRole | null;
  safe_mode: SafeModeController | null;
  orchestrator: RoleOrchestrator | null;
}

const REQUIRED_ROLE_METHODS: Record<RoleModuleName, string[]> = {
  planner: ["createPlan", "validatePlan", "getActivePlan", "cancelPlan"],
  executor: ["execute"],
  verifier: ["verify", "checkInvariants"],
  memory_writer: ["write", "writeBatch", "getStats"],
  auditor: ["audit", "getDriftReport", "queryEvents"],
  safe_mode: ["shouldTrigger", "enter", "requestExit", "getStatus"],
  orchestrator: ["execute", "getCurrentPhase", "isInSafeMode"],
};

class InProcessRoleModule {
  private running = false;

  constructor(
    readonly name: RoleModuleName,
    private readonly instance: unknown,
    private readonly requiredMethods: string[],
  ) {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  health(): RoleModuleHealth {
    if (!this.instance) {
      return {
        available: false,
        ready: false,
        healthy: false,
        requiredMethods: [...this.requiredMethods],
        missingMethods: [...this.requiredMethods],
        running: this.running,
      };
    }

    const candidate = this.instance as Record<string, unknown>;
    const missingMethods = this.requiredMethods.filter(
      (methodName) => typeof candidate[methodName] !== "function",
    );
    const healthy = missingMethods.length === 0;

    return {
      available: true,
      ready: this.running && healthy,
      healthy,
      requiredMethods: [...this.requiredMethods],
      missingMethods,
      running: this.running,
    };
  }
}

export class RoleModuleRegistry {
  private readonly modules: Record<RoleModuleName, InProcessRoleModule>;

  constructor(instances: RoleModuleInstances) {
    this.modules = {
      planner: new InProcessRoleModule(
        "planner",
        instances.planner,
        REQUIRED_ROLE_METHODS.planner,
      ),
      executor: new InProcessRoleModule(
        "executor",
        instances.executor,
        REQUIRED_ROLE_METHODS.executor,
      ),
      verifier: new InProcessRoleModule(
        "verifier",
        instances.verifier,
        REQUIRED_ROLE_METHODS.verifier,
      ),
      memory_writer: new InProcessRoleModule(
        "memory_writer",
        instances.memory_writer,
        REQUIRED_ROLE_METHODS.memory_writer,
      ),
      auditor: new InProcessRoleModule(
        "auditor",
        instances.auditor,
        REQUIRED_ROLE_METHODS.auditor,
      ),
      safe_mode: new InProcessRoleModule(
        "safe_mode",
        instances.safe_mode,
        REQUIRED_ROLE_METHODS.safe_mode,
      ),
      orchestrator: new InProcessRoleModule(
        "orchestrator",
        instances.orchestrator,
        REQUIRED_ROLE_METHODS.orchestrator,
      ),
    };
  }

  startAll(): void {
    for (const module of Object.values(this.modules)) {
      module.start();
    }
  }

  stopAll(): void {
    for (const module of Object.values(this.modules)) {
      module.stop();
    }
  }

  getHealthSnapshot(): RoleModuleRegistrySnapshot {
    return {
      planner: this.modules.planner.health(),
      executor: this.modules.executor.health(),
      verifier: this.modules.verifier.health(),
      memory_writer: this.modules.memory_writer.health(),
      auditor: this.modules.auditor.health(),
      safe_mode: this.modules.safe_mode.health(),
      orchestrator: this.modules.orchestrator.health(),
    };
  }
}

export function createRoleModuleRegistry(
  instances: RoleModuleInstances,
): RoleModuleRegistry {
  return new RoleModuleRegistry(instances);
}
