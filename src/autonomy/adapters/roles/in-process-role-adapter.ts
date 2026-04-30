/**
 * In-process role boundary adapters.
 *
 * Provides explicit role boundary wrappers for planner/executor/verifier/
 * memory-writer/auditor so service wiring can use a transport-like seam even
 * when roles run in the same process.
 *
 * @module autonomy/adapters/roles/in-process-role-adapter
 */

import type {
  AuditorRole,
  ExecutorRole,
  MemoryWriterRole,
  PlannerRole,
  VerifierRole,
} from "../../roles/types.js";

export interface InProcessRoleImplementations {
  planner: PlannerRole;
  executor: ExecutorRole;
  verifier: VerifierRole;
  memoryWriter: MemoryWriterRole;
  auditor: AuditorRole;
}

export interface InProcessRoleAdapters {
  planner: PlannerRole;
  executor: ExecutorRole;
  verifier: VerifierRole;
  memoryWriter: MemoryWriterRole;
  auditor: AuditorRole;
}

class InProcessPlannerAdapter implements PlannerRole {
  constructor(private readonly impl: PlannerRole) {}

  async createPlan(request: Parameters<PlannerRole["createPlan"]>[0]) {
    return await this.impl.createPlan(request);
  }

  async validatePlan(plan: Parameters<PlannerRole["validatePlan"]>[0]) {
    return await this.impl.validatePlan(plan);
  }

  getActivePlan() {
    return this.impl.getActivePlan();
  }

  async cancelPlan(reason: Parameters<PlannerRole["cancelPlan"]>[0]) {
    await this.impl.cancelPlan(reason);
  }
}

class InProcessExecutorAdapter implements ExecutorRole {
  constructor(private readonly impl: ExecutorRole) {}

  async execute(
    call: Parameters<ExecutorRole["execute"]>[0],
    actionHandler: Parameters<ExecutorRole["execute"]>[1],
  ) {
    return await this.impl.execute(call, actionHandler);
  }
}

class InProcessVerifierAdapter implements VerifierRole {
  constructor(private readonly impl: VerifierRole) {}

  async verify(context: Parameters<VerifierRole["verify"]>[0]) {
    return await this.impl.verify(context);
  }

  async checkInvariants(
    context: Parameters<VerifierRole["checkInvariants"]>[0],
  ) {
    return await this.impl.checkInvariants(context);
  }
}

class InProcessMemoryWriterAdapter implements MemoryWriterRole {
  constructor(private readonly impl: MemoryWriterRole) {}

  async write(request: Parameters<MemoryWriterRole["write"]>[0]) {
    return await this.impl.write(request);
  }

  async writeBatch(requests: Parameters<MemoryWriterRole["writeBatch"]>[0]) {
    return await this.impl.writeBatch(requests);
  }

  getStats() {
    return this.impl.getStats();
  }
}

class InProcessAuditorAdapter implements AuditorRole {
  constructor(private readonly impl: AuditorRole) {}

  async audit(context: Parameters<AuditorRole["audit"]>[0]) {
    return await this.impl.audit(context);
  }

  getDriftReport() {
    return this.impl.getDriftReport();
  }

  async queryEvents(requestId: Parameters<AuditorRole["queryEvents"]>[0]) {
    return await this.impl.queryEvents(requestId);
  }
}

export function createInProcessRoleAdapters(
  implementations: InProcessRoleImplementations,
): InProcessRoleAdapters {
  return {
    planner: new InProcessPlannerAdapter(implementations.planner),
    executor: new InProcessExecutorAdapter(implementations.executor),
    verifier: new InProcessVerifierAdapter(implementations.verifier),
    memoryWriter: new InProcessMemoryWriterAdapter(
      implementations.memoryWriter,
    ),
    auditor: new InProcessAuditorAdapter(implementations.auditor),
  };
}
