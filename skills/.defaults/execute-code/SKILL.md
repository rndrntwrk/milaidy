---
name: execute-code
description: "Use the EXECUTE_CODE action to chain three or more sequential tool calls in a single turn with simple control flow or data passing between them. Skip when one action would suffice or when the flow needs the user to respond mid-sequence. Calls run in-process with no sandbox; the same approval rules as direct action calls apply."
source: human
primary-env: none
---

# execute-code

The EXECUTE_CODE action runs a small async JS script that talks to other actions
through an injected `tools` proxy. It exists to collapse multi-step reasoning
into one trajectory step instead of a chain of separate plan/act loops.

## Use it when

- The same turn needs **three or more sequential tool calls** that pass data
  to each other (read X, transform, write Y, then read Z).
- The control flow is simple: linear, with maybe a small conditional or loop
  over a fixed-size list.
- All inputs and outputs are JSON-cloneable (strings, numbers, booleans,
  plain objects, arrays).

## Do not use it when

- A single action handles the request — call the action directly.
- The flow needs the user to respond between calls (asking a clarifying
  question, accepting/rejecting a draft).
- The script would be longer than a few dozen lines or branches deeply.
- Any tool returns a non-cloneable handle (file descriptor, stream, host
  proxy). Those need a dedicated action.

## Surface inside the script

```ts
async (tools, context) => {
  // tools.<ACTION_NAME>(args?) → { action, stepId, success, text?, data?, callbacks }
  // context.{agentId, roomId, entityId, getMemories, searchMemories}
};
```

`tools` is a Proxy: any property name resolves to the matching registered
action (case- and underscore-insensitive). `context` is read-only and scoped
to the current room. Args must be a plain JSON object or `undefined`; passing
class instances, Dates, Maps, functions, or symbols throws before dispatch.

## Trajectory linkage

Each EXECUTE_CODE invocation opens one parent trajectory step
(`kind: "executeCode"`, `script` captured up to 4096 chars with `scriptHash`
for the rest). Every dispatched action runs inside a child step that inherits
`parentStepId` via `runWithTrajectoryContext`; the parent's `childSteps`
array enumerates them in dispatch order. This keeps the post-hoc trajectory
trace flat and inspectable.

## Example

A draft + send + log sequence:

```ts
{
  "script": "
    const draft = await tools.DRAFT_REPLY({ topic: 'follow-up' });
    if (!draft.success) return { ok: false, reason: 'draft failed' };
    const sent = await tools.SEND_MESSAGE({
      recipient: context.entityId,
      text: draft.data?.text ?? draft.text
    });
    await tools.LOG_NOTE({ note: 'follow-up sent', refStepId: sent.stepId });
    return { ok: sent.success, stepId: sent.stepId };
  "
}
```
