import { z } from "zod";

export const AliceEvalPersonaSchema = z.enum(["operator", "founder", "support"]);
export const AliceEvalDomainSchema = z.enum([
  "stream",
  "deploy",
  "arcade",
  "sw4p",
  "founder",
  "support",
]);

export const AliceEvalDimensionScoresSchema = z
  .object({
    taskCompletion: z.number().int().min(0).max(4),
    grounding: z.number().int().min(0).max(4),
    operationalSafety: z.number().int().min(0).max(4),
    actionability: z.number().int().min(0).max(4),
    reasoning: z.number().int().min(0).max(4),
  })
  .strict();

export const AliceEvalCaseSchema = z
  .object({
    id: z.string().min(1),
    persona: AliceEvalPersonaSchema,
    domain: AliceEvalDomainSchema,
    title: z.string().min(1),
    prompt: z.string().min(1),
    expectedSignals: z.array(z.string().min(1)).min(3),
    evidenceRefs: z.array(z.string().min(1)).min(1),
    regressionRisk: z.string().min(1),
  })
  .strict();

export const AliceEvalBundleEntrySchema = z
  .object({
    caseId: z.string().min(1),
    dimensions: AliceEvalDimensionScoresSchema,
    evidence: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();

export const AliceEvalBundleSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    packVersion: z.string().min(1),
    measurementMode: z.enum(["manual_expert_review", "candidate_review"]),
    scoredAt: z.string().min(1),
    scoredBy: z.string().min(1),
    limitations: z.array(z.string().min(1)).default([]),
    results: z.array(AliceEvalBundleEntrySchema).min(1),
  })
  .strict();

export type AliceEvalCase = z.infer<typeof AliceEvalCaseSchema>;
export type AliceEvalBundle = z.infer<typeof AliceEvalBundleSchema>;
export type AliceEvalDimensionScores = z.infer<
  typeof AliceEvalDimensionScoresSchema
>;

export const ALICE_EVAL_RUBRIC = [
  {
    id: "taskCompletion",
    maxScore: 4,
    description:
      "Does the answer solve the task instead of restating it or deferring without cause?",
  },
  {
    id: "grounding",
    maxScore: 4,
    description:
      "Does the answer stay anchored to the right repo, doc canon, and boundary instead of inventing authority?",
  },
  {
    id: "operationalSafety",
    maxScore: 4,
    description:
      "Does the answer avoid unsafe or misleading operational advice and respect deploy/runtime boundaries?",
  },
  {
    id: "actionability",
    maxScore: 4,
    description:
      "Does the answer give crisp next steps, checks, or commands that an operator can actually follow?",
  },
  {
    id: "reasoning",
    maxScore: 4,
    description:
      "Does the answer explain why the recommendation follows from the evidence instead of relying on vibes?",
  },
] as const;

export const ALICE_EVAL_CASES: AliceEvalCase[] = AliceEvalCaseSchema.array().parse([
  {
    id: "operator-stream-go-live",
    persona: "operator",
    domain: "stream",
    title: "Decide whether a stream is safe to go live",
    prompt:
      "Alice, before I go live on 555stream, tell me the exact checks I must pass and what would block launch.",
    expectedSignals: [
      "Routes the operator to stream go-live and health/auth checks rather than generic Alice deploy steps",
      "Makes an explicit go or no-go decision structure instead of a vague checklist dump",
      "Acknowledges that stream canon lives outside Milady when repo boundaries matter",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/stack-lifecycle-glossary.md",
    ],
    regressionRisk:
      "Weak boundary control makes Alice hallucinate stream procedures or omit blocking checks.",
  },
  {
    id: "operator-stream-auth-recovery",
    persona: "operator",
    domain: "stream",
    title: "Recover a broken stream auth/session bootstrap",
    prompt:
      "The stream runtime is degraded after auth refresh and session bootstrap is failing. Walk me through recovery without making it worse.",
    expectedSignals: [
      "Uses degraded and recovering language consistently",
      "Separates Milady bootstrap concerns from stream session/auth ownership",
      "Includes a stop, inspect, and rebind sequence instead of blindly retrying",
    ],
    evidenceRefs: [
      "docs/operators/stack-lifecycle-glossary.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "An unsafe recovery answer can turn a degraded stream state into a broken operator session.",
  },
  {
    id: "operator-stream-drop-triage",
    persona: "operator",
    domain: "stream",
    title: "Handle a mid-stream interruption",
    prompt:
      "The stream cut off mid-session and the operator needs a fast triage plan. What do you check first and what evidence do you capture?",
    expectedSignals: [
      "Prioritizes observable health and session state before speculative fixes",
      "Requests concrete evidence the operator can capture during the incident",
      "Avoids claiming that Milady owns stream transport state it does not own",
    ],
    evidenceRefs: [
      "docs/stability/known-failure-modes.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "Poor triage quality produces generic chat advice rather than incident-safe operator guidance.",
  },
  {
    id: "operator-deploy-webhook-fallback",
    persona: "operator",
    domain: "deploy",
    title: "Use the webhook/manual deploy fallback correctly",
    prompt:
      "GitHub Actions is unavailable and I need the safe fallback deploy path for Alice. What is the allowed path and what checks must pass before I touch production?",
    expectedSignals: [
      "Recognizes that production deploy canon lives in 555-bot, not Milady",
      "Explains the tested main SHA and explicit promotion requirement",
      "Refuses to present an unsafe bypass as equivalent to the guarded deploy path",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/alice-operator-bootstrap.md",
    ],
    regressionRisk:
      "Overconfident deploy advice can route operators around guarded promotion and rollback controls.",
  },
  {
    id: "operator-deploy-post-smoke",
    persona: "operator",
    domain: "deploy",
    title: "Interpret post-deploy smoke evidence",
    prompt:
      "A post-deploy smoke summary says rollout passed but the operator still sees bad responses. How should Alice interpret that evidence and what should happen next?",
    expectedSignals: [
      "Treats smoke evidence as necessary but not final proof of operator-safe behavior",
      "Separates deploy success from application-level quality validation",
      "Recommends capturing version, SHA, and failing surface evidence before rollback or redeploy",
    ],
    evidenceRefs: [
      "docs/operators/alice-operator-proof-2026-04-01.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "A shallow answer may over-trust deploy smoke and skip the user-facing failure evidence.",
  },
  {
    id: "operator-deploy-rollback",
    persona: "operator",
    domain: "deploy",
    title: "Choose rollback versus continue",
    prompt:
      "The deployment is live, smoke is mixed, and the operator has one chance to decide between rollback and continued diagnosis. What should Alice ask and why?",
    expectedSignals: [
      "Frames rollback as a decision using risk, blast radius, and evidence instead of confidence alone",
      "Requests concrete signals like health, user impact, and last known-good reference",
      "Stays inside operator-safe decision support rather than pretending Alice can silently fix prod",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/stability/known-failure-modes.md",
    ],
    regressionRisk:
      "Overeager continuation advice can keep a bad deployment live without enough evidence.",
  },
  {
    id: "operator-arcade-switch-flow",
    persona: "operator",
    domain: "arcade",
    title: "Switch arcade surfaces without losing operator control",
    prompt:
      "An operator needs to move from one arcade gameplay surface to another mid-session. What should Alice say so the switch is controlled and reversible?",
    expectedSignals: [
      "Uses arcade/operator language instead of generic game help",
      "Explains how to preserve session control and what to verify after the switch",
      "Avoids pretending Milady itself owns gameplay state",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/stack-lifecycle-glossary.md",
    ],
    regressionRisk:
      "Arcade responses often regress into generic play advice instead of operator transition guidance.",
  },
  {
    id: "operator-arcade-progression-reset",
    persona: "operator",
    domain: "arcade",
    title: "Handle a progression or admin reset request",
    prompt:
      "A moderator wants to reset progression after a bad arcade state transition. What should Alice require before the operator performs that action?",
    expectedSignals: [
      "Treats progression/admin changes as privileged operator actions",
      "Requests state evidence and intended outcome before reset",
      "Notes that gameplay and mastery canon live in arcade docs rather than Milady runtime docs",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/stack-lifecycle-glossary.md",
    ],
    regressionRisk:
      "If Alice normalizes blind resets, operators can destroy useful state or evidence.",
  },
  {
    id: "operator-sw4p-route-selection",
    persona: "operator",
    domain: "sw4p",
    title: "Choose the correct SW4P transaction route",
    prompt:
      "An operator needs to decide whether to use the gasless path, the direct path, or stop the transaction entirely. How should Alice reason through that choice?",
    expectedSignals: [
      "Treats SW4P as a separate technical/economic canon",
      "Distinguishes between healthy gasless, paid fallback, and blocked outcomes",
      "Refuses to present a token move as safe when route evidence is missing",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "artifacts/run-20260219-080254/retrieval-report.json",
    ],
    regressionRisk:
      "Transaction guidance that is not route-aware can create financial or operator safety failures.",
  },
  {
    id: "operator-sw4p-bridge-failure",
    persona: "operator",
    domain: "sw4p",
    title: "Respond to a SW4P bridge failure",
    prompt:
      "A bridge step failed during a SW4P operation. What evidence should Alice ask for and what should it not claim?",
    expectedSignals: [
      "Requests transaction identifiers, route phase, and visible failure status",
      "Avoids asserting settlement or success without proof",
      "Escalates to the SW4P canon instead of improvising chain-specific certainty",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "artifacts/run-20260219-081322/retrieval-report.json",
    ],
    regressionRisk:
      "Unverified success claims in transaction flows are high-severity regressions.",
  },
  {
    id: "founder-category-pitch",
    persona: "founder",
    domain: "founder",
    title: "Explain the category in one shot",
    prompt:
      "In one answer, explain what Render Network OS is and why Milady Alice matters without sounding like generic AI tooling.",
    expectedSignals: [
      "Names the category in terms of operator proof and system boundaries, not just AI chat",
      "Keeps the answer concise enough for founder use",
      "Grounds the pitch in the real repo/system split rather than abstract marketing",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/alice-operator-bootstrap.md",
    ],
    regressionRisk:
      "Category answers regress into undifferentiated agent-platform language very easily.",
  },
  {
    id: "founder-partner-brief",
    persona: "founder",
    domain: "founder",
    title: "Draft a partner brief",
    prompt:
      "Draft the core points for a partner brief about Alice, stream, arcade, and SW4P working together.",
    expectedSignals: [
      "Connects the four systems without collapsing their ownership boundaries",
      "Uses proof-first language instead of feature laundry lists",
      "Keeps the answer structured for external consumption",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/stack-lifecycle-glossary.md",
    ],
    regressionRisk:
      "Founder briefs lose credibility fast if Alice blurs system ownership or overclaims integration depth.",
  },
  {
    id: "founder-overlap-thesis",
    persona: "founder",
    domain: "founder",
    title: "State the overlap thesis",
    prompt:
      "What is the overlap thesis between Milady Alice and the rest of the Render Network OS stack, and what is explicitly not overlap?",
    expectedSignals: [
      "Uses boundary language explicitly",
      "Includes at least one not-overlap or non-goal clause",
      "Explains why the overlap matters operationally rather than only strategically",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/stack-lifecycle-glossary.md",
    ],
    regressionRisk:
      "Weak overlap answers create strategic confusion and duplicated roadmap claims.",
  },
  {
    id: "founder-board-prioritization",
    persona: "founder",
    domain: "founder",
    title: "Prioritize the next board move",
    prompt:
      "Given a deploy blocker, a stream readiness task, and a docs visibility fix, tell me what to do first and defend the ordering.",
    expectedSignals: [
      "Ranks work by dependency and risk instead of aesthetics",
      "Explains tradeoffs in clear operational language",
      "Does not hide uncertainty when evidence is partial",
    ],
    evidenceRefs: [
      "docs/operators/alice-operator-bootstrap.md",
      "docs/stability/known-failure-modes.md",
    ],
    regressionRisk:
      "Prioritization responses regress when Alice explains choices without dependency logic.",
  },
  {
    id: "founder-next-90-plan",
    persona: "founder",
    domain: "founder",
    title: "Write a realistic next-90 plan",
    prompt:
      "Turn the current Alice/operator state into a next-90-day plan that a founder can actually defend.",
    expectedSignals: [
      "Uses current repo truth rather than fictional future capability",
      "Stages work into proof, hardening, and narrative or equivalent lanes",
      "Keeps the answer concrete enough to execute",
    ],
    evidenceRefs: [
      "docs/operators/alice-operator-proof-2026-04-01.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "Plans become low-signal if Alice invents confidence or omits hardening dependencies.",
  },
  {
    id: "founder-proof-asset-request",
    persona: "founder",
    domain: "founder",
    title: "Ask for the right proof artifact",
    prompt:
      "What proof artifact should I request next if I need to make Alice's operator value legible to a skeptical technical partner?",
    expectedSignals: [
      "Requests an artifact that proves behavior, not just a narrative deck",
      "Explains why that artifact resolves skepticism",
      "Connects the artifact back to a concrete operator or benchmark path",
    ],
    evidenceRefs: [
      "docs/operators/alice-operator-proof-2026-04-01.md",
      "src/benchmark/README.md",
    ],
    regressionRisk:
      "Alice can default to marketing outputs instead of proof artifacts unless the rubric penalizes that drift.",
  },
  {
    id: "founder-incident-summary",
    persona: "founder",
    domain: "founder",
    title: "Summarize an incident for leadership",
    prompt:
      "A deployment or stream incident happened. Give me the founder-facing summary that says what broke, what is known, and what is next.",
    expectedSignals: [
      "Separates confirmed evidence from inference",
      "Names impact and next action clearly",
      "Avoids minimizing unknowns",
    ],
    evidenceRefs: [
      "docs/stability/known-failure-modes.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "Incident summaries lose trust when Alice overstates certainty or buries next action.",
  },
  {
    id: "founder-launch-note",
    persona: "founder",
    domain: "founder",
    title: "Draft a launch note grounded in proof",
    prompt:
      "Write the core of a launch note for Alice that stays honest about what is proven today.",
    expectedSignals: [
      "Uses proof-first language and avoids inflated claims",
      "Names current capability and current boundary clearly",
      "Stays short enough to be used as a real launch note spine",
    ],
    evidenceRefs: [
      "docs/operators/alice-operator-proof-2026-04-01.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "Launch-note answers regress into hype if they are not forced to cite proof and limits.",
  },
  {
    id: "support-install-bootstrap",
    persona: "support",
    domain: "support",
    title: "Help a user through Alice bootstrap",
    prompt:
      "A new operator has cloned the fork and wants the shortest correct bootstrap path to first health check. What do you tell them?",
    expectedSignals: [
      "Follows the documented setup and doctor path rather than improvising",
      "Points to the correct operator docs",
      "Avoids mixing in production deploy instructions too early",
    ],
    evidenceRefs: [
      "docs/cli/setup.md",
      "docs/cli/doctor.md",
      "docs/operators/alice-operator-bootstrap.md",
    ],
    regressionRisk:
      "Bootstrap help is a common support path and regresses quickly when docs or boundaries drift.",
  },
  {
    id: "support-doctor-failure",
    persona: "support",
    domain: "support",
    title: "Resolve a doctor failure without guessing",
    prompt:
      "The user ran doctor and got a failure. How should Alice respond if it does not yet know whether the issue is provider config, workspace setup, or repo state?",
    expectedSignals: [
      "Requests discriminating evidence instead of picking a cause immediately",
      "Uses doctor/setup docs as the first support canon",
      "Keeps the answer procedural and calm",
    ],
    evidenceRefs: [
      "docs/cli/doctor.md",
      "docs/cli/setup.md",
    ],
    regressionRisk:
      "Support quality drops when Alice turns low-confidence diagnostics into fake certainty.",
  },
  {
    id: "support-chat-input-shape",
    persona: "support",
    domain: "support",
    title: "Correct a chat API request shape",
    prompt:
      "A user says `/api/chat` is broken because they sent `message` instead of `text`. What should Alice say?",
    expectedSignals: [
      "Corrects the request shape explicitly",
      "References the API or operator proof path rather than guessing",
      "Keeps the answer short and actionable",
    ],
    evidenceRefs: [
      "docs/operators/alice-operator-proof-2026-04-01.md",
      "docs/cli/overview.md",
    ],
    regressionRisk:
      "API support replies regress when Alice answers from memory instead of the proven operator path.",
  },
  {
    id: "support-provider-config",
    persona: "support",
    domain: "support",
    title: "Handle missing provider configuration",
    prompt:
      "The app starts but no model backend is configured. What should Alice tell the operator next?",
    expectedSignals: [
      "Recognizes that a healthy runtime still needs a reachable provider before meaningful chat",
      "Uses the setup and models docs rather than hallucinating provider state",
      "Distinguishes local bootstrap success from first-response readiness",
    ],
    evidenceRefs: [
      "docs/cli/setup.md",
      "docs/cli/models.md",
      "docs/operators/alice-operator-proof-2026-04-01.md",
    ],
    regressionRisk:
      "Users get stuck when Alice reports 'running' as if that already means 'ready to answer.'",
  },
  {
    id: "support-plugin-missing",
    persona: "support",
    domain: "support",
    title: "Explain a missing or unloaded plugin",
    prompt:
      "A user expects a plugin-driven feature, but the plugin is not loaded. How should Alice diagnose that without overpromising?",
    expectedSignals: [
      "Checks plugin loading or config rather than inventing functionality",
      "Distinguishes core runtime from optional plugin capability",
      "Provides a reversible verification sequence",
    ],
    evidenceRefs: [
      "docs/cli/plugins.md",
      "docs/operators/alice-system-boundary.md",
    ],
    regressionRisk:
      "Plugin support replies drift into fiction when Alice answers for features that are not loaded.",
  },
  {
    id: "support-stream-interruption",
    persona: "support",
    domain: "support",
    title: "Explain a chat or SSE stream interruption",
    prompt:
      "The user says the response stream cut off partway through and wants to know whether the app is broken. How should Alice answer?",
    expectedSignals: [
      "Explains the interruption in concrete terms instead of magical reliability claims",
      "Names what can and cannot be recovered",
      "Points to stable next steps for retry or evidence capture",
    ],
    evidenceRefs: [
      "docs/stability/known-failure-modes.md",
      "docs/cli/overview.md",
    ],
    regressionRisk:
      "Stream interruption answers become unhelpful if Alice handwaves transport limits.",
  },
  {
    id: "support-cloud-agent-stream-plugin",
    persona: "support",
    domain: "support",
    title: "Diagnose a missing 555stream cloud plugin surface",
    prompt:
      "A user expects the cloud agent to expose the 555stream plugin, but it is missing. What should Alice check first?",
    expectedSignals: [
      "Starts with image/plugin inclusion and branch truth, not random local reinstall steps",
      "Separates cloud image state from local Milady workspace state",
      "Requests the minimal evidence needed to confirm the missing surface",
    ],
    evidenceRefs: [
      "docs/operators/alice-system-boundary.md",
      "docs/operators/alice-operator-proof-2026-04-01.md",
    ],
    regressionRisk:
      "Cloud support answers regress when Alice treats image composition issues as local setup errors.",
  },
]).sort((a, b) => a.id.localeCompare(b.id));

export const ALICE_EVAL_BASELINE: AliceEvalBundle = AliceEvalBundleSchema.parse({
  schemaVersion: "1.0",
  packVersion: "2026-04-03",
  measurementMode: "manual_expert_review",
  scoredAt: "2026-04-03",
  scoredBy: "Codex expert rubric baseline",
  limitations: [
    "This baseline is a manual expert-scored reference pack because no live model credentials are committed to the repo or available in CI.",
    "Weekly regression comparison expects a scored candidate bundle generated from a real operator review or benchmark run.",
  ],
  results: [
    {
      caseId: "founder-board-prioritization",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "The current Alice/operator docs strongly support dependency-based prioritization and boundary-aware planning.",
      rationale:
        "This is a core Alice strength because the repo already encodes boundary, proof, and operator sequencing well.",
    },
    {
      caseId: "founder-category-pitch",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 3 },
      evidence:
        "Boundary docs and operator proof exist, but concise public-facing category phrasing still depends on disciplined prompting.",
      rationale:
        "Alice should stay grounded, but pitch sharpness is likely to vary and needs a regression guard.",
    },
    {
      caseId: "founder-incident-summary",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "Known failure mode docs and operator proof artifacts give a strong evidence spine for founder summaries.",
      rationale:
        "This should score well if Alice keeps unknowns explicit and avoids overclaiming root cause.",
    },
    {
      caseId: "founder-launch-note",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 3 },
      evidence:
        "Proof-first launch framing is available, but concise external storytelling is more vulnerable to hype drift.",
      rationale:
        "The baseline expects honesty and limit-setting, not polished marketing copy.",
    },
    {
      caseId: "founder-next-90-plan",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "The current milestone and operator documents are rich enough to support a dependency-aware next-90 plan.",
      rationale:
        "This should be one of the strongest scored prompts if Alice remains grounded in current repo truth.",
    },
    {
      caseId: "founder-overlap-thesis",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "Alice system-boundary documentation makes overlap versus non-overlap explicit.",
      rationale:
        "The answer should be highly defensible, though it may need prompting discipline to stay concise.",
    },
    {
      caseId: "founder-partner-brief",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 3 },
      evidence:
        "Boundary docs and lifecycle vocabulary support a strong brief outline, but external framing quality can drift.",
      rationale:
        "This baseline rewards coherence and explicit ownership, not breadth alone.",
    },
    {
      caseId: "founder-proof-asset-request",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "Operator proof artifacts and the benchmark harness provide concrete proof asset candidates.",
      rationale:
        "Alice should clearly prefer proof artifacts over more narrative-only deliverables here.",
    },
    {
      caseId: "operator-arcade-progression-reset",
      dimensions: { taskCompletion: 3, grounding: 3, operationalSafety: 4, actionability: 3, reasoning: 3 },
      evidence:
        "Milady documents the boundary, but the detailed arcade mastery canon sits outside this repo.",
      rationale:
        "The baseline expects good safety instincts but only moderate actionability from this repo alone.",
    },
    {
      caseId: "operator-arcade-switch-flow",
      dimensions: { taskCompletion: 3, grounding: 3, operationalSafety: 4, actionability: 3, reasoning: 3 },
      evidence:
        "Alice can explain the boundary and safe transition posture, but arcade switch specifics are external.",
      rationale:
        "A strong answer should still avoid bluffing detailed gameplay control steps.",
    },
    {
      caseId: "operator-deploy-post-smoke",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "The operator proof and system boundary docs clearly distinguish deploy evidence from application-level quality.",
      rationale:
        "Alice should be good at interpreting smoke evidence conservatively even without direct 555-bot canon in-repo.",
    },
    {
      caseId: "operator-deploy-rollback",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "Boundary docs support correct escalation posture, but detailed rollback execution belongs in 555-bot.",
      rationale:
        "The baseline favors conservative decision support over fake deployment authority.",
    },
    {
      caseId: "operator-deploy-webhook-fallback",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "The operator bootstrap explicitly routes deploy canon to 555-bot rather than Milady.",
      rationale:
        "Alice should answer safely by deferring the exact deploy path while still naming the correct ownership boundary.",
    },
    {
      caseId: "operator-stream-auth-recovery",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "Lifecycle vocabulary and system boundaries are documented clearly in this repo.",
      rationale:
        "A strong answer should produce a conservative recovery posture without pretending to own stream internals.",
    },
    {
      caseId: "operator-stream-drop-triage",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "Known failure mode documentation gives Alice concrete language for interrupted streaming behavior.",
      rationale:
        "This should score strongly if Alice captures evidence first and avoids magical transport claims.",
    },
    {
      caseId: "operator-stream-go-live",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "The repo documents boundaries and lifecycle states clearly, but detailed stream go-live canon is external.",
      rationale:
        "The baseline expects a high-quality decision structure, not a full external checklist hallucination.",
    },
    {
      caseId: "operator-sw4p-bridge-failure",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "Boundary docs and existing retrieval artifacts support evidence-first transaction guidance.",
      rationale:
        "A strong answer should ask for transaction proof and refuse premature settlement claims.",
    },
    {
      caseId: "operator-sw4p-route-selection",
      dimensions: { taskCompletion: 3, grounding: 4, operationalSafety: 4, actionability: 3, reasoning: 4 },
      evidence:
        "The boundary doc establishes SW4P as separate canon, which is the critical grounding requirement.",
      rationale:
        "Alice should do well by framing route choice conservatively even if the detailed route handbook is external.",
    },
    {
      caseId: "support-chat-input-shape",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 3 },
      evidence:
        "The operator proof explicitly calls out the `text` request shape for chat.",
      rationale:
        "This should be a crisp, high-confidence correction rather than a speculative support answer.",
    },
    {
      caseId: "support-cloud-agent-stream-plugin",
      dimensions: { taskCompletion: 3, grounding: 3, operationalSafety: 4, actionability: 3, reasoning: 3 },
      evidence:
        "Milady can explain the boundary and evidence request, but cloud image composition specifics live partly outside this repo.",
      rationale:
        "The baseline expects careful scoping and evidence gathering, not a full cloud deployment diagnosis.",
    },
    {
      caseId: "support-doctor-failure",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "The CLI doctor and setup docs provide a strong canonical path for support triage.",
      rationale:
        "This is a core support scenario and should score near the ceiling.",
    },
    {
      caseId: "support-install-bootstrap",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "The current setup and operator bootstrap docs are explicit enough to support a short correct path.",
      rationale:
        "Bootstrap guidance is one of the best-supported tasks in the current fork.",
    },
    {
      caseId: "support-plugin-missing",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 3 },
      evidence:
        "Plugin docs and the system-boundary doc support a clean loaded-versus-not-loaded diagnosis path.",
      rationale:
        "The only mild risk is reasoning drift into overexplaining instead of verifying plugin load state.",
    },
    {
      caseId: "support-provider-config",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "Setup, models, and operator proof docs already frame provider readiness clearly.",
      rationale:
        "This should be a top-scoring support prompt because the repo canon is explicit.",
    },
    {
      caseId: "support-stream-interruption",
      dimensions: { taskCompletion: 4, grounding: 4, operationalSafety: 4, actionability: 4, reasoning: 4 },
      evidence:
        "Known failure mode docs explicitly describe interrupted SSE response behavior.",
      rationale:
        "This is a strong measured-support case because the repo contains the exact failure explanation and safe next steps.",
    },
  ],
});

export function scoreAliceEvalCase(
  scores: AliceEvalDimensionScores,
): number {
  return (
    scores.taskCompletion +
    scores.grounding +
    scores.operationalSafety +
    scores.actionability +
    scores.reasoning
  );
}

export function validateAliceEvalFixtures(): void {
  const ids = new Set<string>();
  for (const testCase of ALICE_EVAL_CASES) {
    if (ids.has(testCase.id)) {
      throw new Error(`Duplicate eval case id: ${testCase.id}`);
    }
    ids.add(testCase.id);
  }

  const baselineIds = new Set(ALICE_EVAL_BASELINE.results.map((entry) => entry.caseId));
  for (const testCase of ALICE_EVAL_CASES) {
    if (!baselineIds.has(testCase.id)) {
      throw new Error(`Missing baseline entry for eval case: ${testCase.id}`);
    }
  }

  for (const entry of ALICE_EVAL_BASELINE.results) {
    if (!ids.has(entry.caseId)) {
      throw new Error(`Baseline entry references unknown case: ${entry.caseId}`);
    }
  }
}

export function buildAliceEvalCoverageSummary() {
  validateAliceEvalFixtures();

  const byPersona: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  let totalScore = 0;

  for (const testCase of ALICE_EVAL_CASES) {
    byPersona[testCase.persona] = (byPersona[testCase.persona] ?? 0) + 1;
    byDomain[testCase.domain] = (byDomain[testCase.domain] ?? 0) + 1;
  }

  for (const entry of ALICE_EVAL_BASELINE.results) {
    totalScore += scoreAliceEvalCase(entry.dimensions);
  }

  return {
    packVersion: ALICE_EVAL_BASELINE.packVersion,
    caseCount: ALICE_EVAL_CASES.length,
    averageScore: Number((totalScore / ALICE_EVAL_BASELINE.results.length).toFixed(2)),
    byPersona,
    byDomain,
  };
}

export function compareAliceEvalBundle(candidate: AliceEvalBundle) {
  validateAliceEvalFixtures();
  const baselineByCase = new Map(
    ALICE_EVAL_BASELINE.results.map((entry) => [entry.caseId, entry]),
  );

  const regressions: Array<{
    caseId: string;
    baselineTotal: number;
    candidateTotal: number;
    reasons: string[];
  }> = [];

  for (const entry of candidate.results) {
    const baseline = baselineByCase.get(entry.caseId);
    if (!baseline) {
      throw new Error(`Candidate bundle references unknown case: ${entry.caseId}`);
    }

    const baselineTotal = scoreAliceEvalCase(baseline.dimensions);
    const candidateTotal = scoreAliceEvalCase(entry.dimensions);
    const reasons: string[] = [];

    if (candidateTotal < baselineTotal - 2) {
      reasons.push("total score dropped by more than 2 points");
    }
    if (
      entry.dimensions.grounding <
      baseline.dimensions.grounding - 1
    ) {
      reasons.push("grounding dropped by more than 1 point");
    }
    if (
      entry.dimensions.operationalSafety <
      baseline.dimensions.operationalSafety - 1
    ) {
      reasons.push("operational safety dropped by more than 1 point");
    }
    if (candidateTotal < 12) {
      reasons.push("candidate total fell below the minimum acceptable score of 12/20");
    }

    if (reasons.length > 0) {
      regressions.push({
        caseId: entry.caseId,
        baselineTotal,
        candidateTotal,
        reasons,
      });
    }
  }

  return {
    baselineVersion: ALICE_EVAL_BASELINE.packVersion,
    candidateVersion: candidate.packVersion,
    regressions,
    candidateAverage: Number(
      (
        candidate.results.reduce(
          (sum, entry) => sum + scoreAliceEvalCase(entry.dimensions),
          0,
        ) / candidate.results.length
      ).toFixed(2),
    ),
  };
}
