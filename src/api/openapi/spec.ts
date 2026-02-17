/**
 * OpenAPI 3.1 specification for Milaidy Autonomy API.
 *
 * Builds the spec programmatically so it stays in sync
 * with TypeScript types and route handlers.
 *
 * @module api/openapi/spec
 */

// ---------- Types ----------

type SchemaObject = Record<string, unknown>;
type PathItem = Record<string, unknown>;

// ---------- Schemas ----------

const IdentitySchema: SchemaObject = {
  type: "object",
  properties: {
    name: { type: "string" },
    coreValues: { type: "array", items: { type: "string" } },
    communicationStyle: {
      type: "object",
      properties: {
        tone: { type: "string", enum: ["formal", "casual", "technical", "empathetic"] },
        verbosity: { type: "string", enum: ["concise", "balanced", "detailed"] },
        personaVoice: { type: "string" },
      },
    },
    hardBoundaries: { type: "array", items: { type: "string" } },
    softPreferences: { type: "object", additionalProperties: true },
    identityHash: { type: "string", nullable: true },
    identityVersion: { type: "integer" },
  },
};

const ApprovalRequestSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string" },
    toolName: { type: "string" },
    riskClass: { type: "string", enum: ["read-only", "reversible", "irreversible"] },
    callPayload: { type: "object", additionalProperties: true },
    decision: { type: "string", enum: ["approved", "denied", "expired"], nullable: true },
    decidedBy: { type: "string", nullable: true },
    createdAt: { type: "integer", description: "Epoch ms" },
    expiresAt: { type: "integer", description: "Epoch ms" },
    decidedAt: { type: "integer", nullable: true, description: "Epoch ms" },
  },
};

const ErrorSchema: SchemaObject = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
  required: ["error"],
};

// ---------- Paths ----------

const paths: Record<string, PathItem> = {
  "/api/agent/autonomy": {
    get: {
      summary: "Get autonomy kernel status",
      operationId: "getAutonomyStatus",
      tags: ["Autonomy"],
      responses: {
        "200": {
          description: "Autonomy status",
          content: { "application/json": { schema: { type: "object", properties: { enabled: { type: "boolean" } } } } },
        },
      },
    },
    post: {
      summary: "Enable/disable autonomy kernel",
      operationId: "setAutonomyStatus",
      tags: ["Autonomy"],
      requestBody: {
        content: { "application/json": { schema: { type: "object", properties: { enabled: { type: "boolean" } } } } },
      },
      responses: {
        "200": { description: "Status updated", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, autonomy: { type: "boolean" } } } } } },
      },
    },
  },

  "/api/agent/autonomy/execute-plan": {
    post: {
      summary: "Execute a plan through the autonomy pipeline",
      operationId: "executeAutonomyPlan",
      tags: ["Autonomy"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                plan: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    steps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: ["string", "number"] },
                          toolName: { type: "string" },
                          params: { type: "object", additionalProperties: true },
                        },
                        required: ["toolName"],
                      },
                    },
                  },
                  required: ["steps"],
                },
                request: {
                  type: "object",
                  properties: {
                    agentId: { type: "string" },
                    source: {
                      type: "string",
                      enum: ["llm", "user", "system", "plugin"],
                    },
                    sourceTrust: { type: "number" },
                  },
                },
                options: {
                  type: "object",
                  properties: {
                    stopOnFailure: { type: "boolean", default: true },
                  },
                },
              },
              required: ["plan"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Plan execution results",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  allSucceeded: { type: "boolean" },
                  stoppedEarly: { type: "boolean" },
                  failedStepIndex: { type: ["number", "null"] },
                  stopOnFailure: { type: "boolean" },
                  successCount: { type: "number" },
                  failedCount: { type: "number" },
                  results: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        "400": { description: "Invalid request" },
        "503": { description: "Service unavailable" },
      },
    },
  },

  "/api/agent/autonomy/workflows/start": {
    post: {
      summary: "Start a workflow execution",
      operationId: "startWorkflow",
      tags: ["Workflows"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                workflowId: { type: "string" },
                input: { type: "object", additionalProperties: true },
              },
              required: ["workflowId"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Workflow started",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  result: { type: "object" },
                },
              },
            },
          },
        },
        "400": { description: "Invalid request" },
        "503": { description: "Service unavailable" },
      },
    },
  },

  "/api/agent/autonomy/workflows/{executionId}": {
    get: {
      summary: "Get workflow execution status",
      operationId: "getWorkflowStatus",
      tags: ["Workflows"],
      parameters: [
        {
          name: "executionId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Workflow status",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  status: { type: ["object", "null"] },
                },
              },
            },
          },
        },
        "400": { description: "Invalid request" },
        "503": { description: "Service unavailable" },
      },
    },
  },

  "/api/agent/autonomy/workflows/{executionId}/cancel": {
    post: {
      summary: "Cancel a workflow execution",
      operationId: "cancelWorkflow",
      tags: ["Workflows"],
      parameters: [
        {
          name: "executionId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Cancellation result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  cancelled: { type: "boolean" },
                },
              },
            },
          },
        },
        "400": { description: "Invalid request" },
        "501": { description: "Not supported" },
        "503": { description: "Service unavailable" },
      },
    },
  },

  "/api/agent/identity": {
    get: {
      summary: "Get current agent identity",
      operationId: "getIdentity",
      tags: ["Identity"],
      responses: {
        "200": { description: "Current identity config", content: { "application/json": { schema: { type: "object", properties: { identity: { $ref: "#/components/schemas/Identity" } } } } } },
        "500": { description: "Server error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    put: {
      summary: "Update agent identity",
      operationId: "updateIdentity",
      tags: ["Identity"],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Identity" } } },
      },
      responses: {
        "200": { description: "Updated identity", content: { "application/json": { schema: { type: "object", properties: { identity: { $ref: "#/components/schemas/Identity" } } } } } },
        "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "503": { description: "Service unavailable" },
      },
    },
  },

  "/api/agent/identity/history": {
    get: {
      summary: "Get identity version history",
      operationId: "getIdentityHistory",
      tags: ["Identity"],
      responses: {
        "200": {
          description: "Identity history",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  version: { type: "integer" },
                  hash: { type: "string", nullable: true },
                  history: { type: "array", items: { $ref: "#/components/schemas/Identity" } },
                },
              },
            },
          },
        },
      },
    },
  },

  "/api/agent/approvals": {
    get: {
      summary: "List recent approval records",
      operationId: "listApprovals",
      tags: ["Approvals"],
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Max records to return" },
      ],
      responses: {
        "200": {
          description: "Approval records",
          content: { "application/json": { schema: { type: "object", properties: { approvals: { type: "array", items: { $ref: "#/components/schemas/ApprovalRequest" } } } } } },
        },
      },
    },
  },

  "/api/agent/approvals/{id}/resolve": {
    post: {
      summary: "Resolve a pending approval request",
      operationId: "resolveApproval",
      tags: ["Approvals"],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                decision: { type: "string", enum: ["approved", "denied"] },
                decidedBy: { type: "string" },
              },
              required: ["decision"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Approval resolved" },
        "404": { description: "Approval not found" },
        "400": { description: "Invalid decision" },
      },
    },
  },

  "/api/agent/safe-mode": {
    get: {
      summary: "Get safe mode status",
      operationId: "getSafeModeStatus",
      tags: ["Safe Mode"],
      responses: {
        "200": {
          description: "Safe mode status",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  active: { type: "boolean" },
                  consecutiveErrors: { type: "integer" },
                  state: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },

  "/api/agent/safe-mode/exit": {
    post: {
      summary: "Request safe mode exit",
      operationId: "exitSafeMode",
      tags: ["Safe Mode"],
      responses: {
        "200": { description: "Exit request processed" },
        "409": { description: "Not in safe mode" },
      },
    },
  },

  "/metrics": {
    get: {
      summary: "Prometheus metrics",
      operationId: "getMetrics",
      tags: ["Monitoring"],
      responses: {
        "200": {
          description: "Prometheus text exposition format",
          content: { "text/plain": { schema: { type: "string" } } },
        },
      },
    },
  },
};

// ---------- Spec Builder ----------

/**
 * Build the complete OpenAPI 3.1 specification.
 */
export function buildOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Milaidy Autonomy Kernel API",
      description: "REST API for the Milaidy Autonomy Kernel — identity management, approval workflows, safe mode, monitoring, and more.",
      version: "1.0.0",
    },
    servers: [
      { url: "http://localhost:2138", description: "Local development" },
    ],
    paths,
    components: {
      schemas: {
        Identity: IdentitySchema,
        ApprovalRequest: ApprovalRequestSchema,
        Error: ErrorSchema,
      },
    },
    tags: [
      { name: "Autonomy", description: "Kernel lifecycle management" },
      { name: "Identity", description: "Agent identity and preferences" },
      { name: "Approvals", description: "Tool execution approval workflows" },
      { name: "Workflows", description: "Workflow execution and lifecycle" },
      { name: "Safe Mode", description: "Safe mode status and control" },
      { name: "Monitoring", description: "Metrics and observability" },
    ],
  };
}
