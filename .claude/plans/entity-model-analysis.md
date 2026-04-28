# Entity Model Architecture Analysis: Cross-Platform Identity Brittleness

## CRITICAL FINDING: Entities ARE Siloed Per Connector (Per World)

This is the core architectural truth that breaks cross-platform identity. The system is NOT truly cross-platform.

---

## 1. Entity Scoping: (id, agent_id) Unique Constraint

**Location**: `eliza/packages/typescript/src/schemas/entity.ts` (lines 64-68)

```
uniqueConstraints: {
  id_agent_id_unique: {
    name: "id_agent_id_unique",
    columns: ["id", "agent_id"],
  },
}
```

### The Critical Question: Do Discord and Telegram Share the Same Entity ID?

**Answer: YES, potentially — but FUNCTIONALLY NO because of world scoping.**

- Entity IDs are **deterministic** and **connector-agnostic**. The system uses `stringToUuid()` to generate IDs from deterministic strings.
- Example from `conversation-routes.ts` line 161:
  ```typescript
  stringToUuid(`${state.agentName}-admin-entity`) as UUID
  ```
  This produces the SAME UUID across ALL connectors.

**BUT THE TRAP**: Even if two connectors produce the same entity ID, they're stored in **different worlds**, and the entire system operates on **(entityId, worldId, agentId)** tuples, not just entityId.

---

## 2. World Scoping: Each Connector Creates Its Own World

**Location**: `eliza/packages/typescript/src/schemas/world.ts`

Worlds are agent-scoped only, not globally unique:
- Schema: `(id, agent_id)` are the primary keys
- Multiple worlds can exist per agent (one per connector typically)

### How Connectors Create Worlds

From `chat-routes.ts` (line 1340):
```typescript
const worldId = stringToUuid(`${agentName}-web-chat-world`) as UUID;
```

From `connection.ts` (lines 98-108):
```typescript
const world: World = {
  id: worldId,
  name: c.worldName ? c.worldName : c.messageServerId 
    ? `World for server ${c.messageServerId}`
    : `World for room ${c.roomId}`,
  agentId,
  messageServerId: c.messageServerId,
  metadata: c.metadata,
};
```

### World Metadata Contains Roles (NOT Shared Across Worlds)

From `conversation-routes.ts` (lines 172-204):
```typescript
async function ensureWorldOwnershipAndRoles(
  runtime: IAgentRuntime,
  worldId: UUID,
  ownerId: UUID,
): Promise<void> {
  const world = await runtime.getWorld(worldId);
  if (!world) return;
  let needsUpdate = false;
  if (!world.metadata) {
    world.metadata = {};
    needsUpdate = true;
  }
  if (!world.metadata.ownership || world.metadata.ownership.ownerId !== ownerId) {
    world.metadata.ownership = { ownerId };
    needsUpdate = true;
  }
  const metadataWithRoles = world.metadata as {
    roles?: Record<string, string>;
  };
  const roles = metadataWithRoles.roles ?? {};
  if (roles[ownerId] !== "OWNER") {
    roles[ownerId] = "OWNER";
    metadataWithRoles.roles = roles;
    needsUpdate = true;
  }
  if (needsUpdate) {
    await runtime.updateWorld(world);
  }
}
```

**BRITTLENESS**: `world.metadata.roles[ownerId]` is **per-world**. So:
- OWNER in Discord world ≠ OWNER in Telegram world
- Same entity UUID can have different roles in different worlds
- No mechanism to unify roles across worlds

---

## 3. The Owner Entity Problem: adminEntityId Across Worlds

**Location**: `chat-routes.ts` (lines 1388-1405)

```typescript
function ensureAdminEntityIdForChat(state: ChatRouteState): UUID {
  if (state.adminEntityId) {
    return state.adminEntityId;
  }
  const configured = state.config.agents?.defaults?.adminEntityId?.trim();
  const nextAdminEntityId =
    configured && isUuidLike(configured)
      ? configured
      : (stringToUuid(`${state.agentName}-admin-entity`) as UUID);
  state.adminEntityId = nextAdminEntityId;
  state.chatUserId = state.adminEntityId;
  return nextAdminEntityId;
}
```

### What Happens to the Owner When They Message Discord vs Telegram

1. **First message to app (web chat)**:
   - adminEntityId = `stringToUuid("${agentName}-admin-entity")`
   - Entity created in **app-world** (web-chat-world)
   - world.metadata.roles[adminEntityId] = "OWNER" (in app-world only)

2. **First message to Discord**:
   - Entity with SAME UUID created in **discord-world**
   - **BUT** discord-world.metadata.roles[adminEntityId] is NOT set
   - The entity exists in 2 different worlds with different roles

3. **First message to Telegram**:
   - Entity with SAME UUID created in **telegram-world**
   - **BUT** telegram-world.metadata.roles[adminEntityId] is NOT set
   - The entity exists in 3 different worlds with different roles

### The Critical Vulnerability

The `adminEntityId` in config is:
- The SAME UUID used across worlds
- **NOT automatically propagated to world.metadata.roles in new worlds**
- Created only on-demand per `ensureWorldOwnershipAndRoles()` call
- If a new world is created before that function runs, the owner has NO role there

---

## 4. Plugin-Roles ensureOwnerRole() — Does NOT Fix This

**Location**: `plugin-roles/src/index.ts` (lines 121-150)

```typescript
async function ensureOwnerRole(runtime: IAgentRuntime): Promise<boolean> {
  try {
    const worlds = await runtime.getAllWorlds();

    for (const world of worlds) {
      if (!world.id) continue;

      await updateWorldMetadata(runtime, world.id, (metadata) => {
        const ownerId = metadata.ownership?.ownerId;
        if (!ownerId) return false;

        const currentRole = normalizeRole(metadata.roles?.[ownerId]);
        if (currentRole === "OWNER") return false;

        if (!metadata.roles) metadata.roles = {};
        metadata.roles[ownerId] = "OWNER";
        logger.info(
          `[roles] Auto-assigned OWNER role to world owner ${ownerId} in world ${world.id}`,
        );
        return true;
      });
    }
    return true;
  } catch (err) {
    logger.info(
      `[roles] Deferring owner role bootstrap until worlds are available: ${err}`,
    );
    return false;
  }
}
```

### Why This DOESN'T Unify Identity

This function:
- ✅ Loops through ALL existing worlds at plugin init
- ✅ Sets OWNER role in world.metadata.roles for each world
- ❌ **ONLY runs once at plugin init**
- ❌ **NEW worlds created AFTER plugin init are not updated**
- ❌ Relies on world.metadata.ownership?.ownerId being set (separate from entity)

If a Discord connector is added AFTER plugin init, it creates a new world without the OWNER role assignment.

---

## 5. Component Storage Scopes Claims to Specific Worlds

**Location**: `eliza/packages/typescript/src/schemas/component.ts` (lines 18-36)

```typescript
entity_id: {
  name: "entity_id",
  type: "uuid",
  notNull: true,
},
agent_id: {
  name: "agent_id",
  type: "uuid",
  notNull: true,
},
room_id: {
  name: "room_id",
  type: "uuid",
  notNull: true,
},
world_id: {
  name: "world_id",
  type: "uuid",
},
```

And the natural key (lines 151-155):
```typescript
unique_component_natural_key: {
  name: "unique_component_natural_key",
  columns: ["entity_id", "type", "world_id", "source_entity_id"],
  nullsNotDistinct: true,
},
```

### The Isolation Problem

Components are uniquely keyed by **(entity_id, type, world_id, source_entity_id)**.

**Example**: A claim component storing "OWNER" status:
- Component in app-world: (adminEntityId, "CLAIM", app-worldId, null) = "OWNER"
- Component in discord-world: DOESN'T EXIST (different world_id)

**Cross-platform visibility**: Claims made in Discord are **completely invisible** in Telegram because they're stored with different world_ids.

There is **NO mechanism** to query a component across all worlds.

---

## 6. The bridgeSender Pattern — Unreliable for Cross-Platform Identity

**Location**: `plugin-roles/src/utils.ts` (lines 134-140)

```typescript
export function getLiveEntityMetadataFromMessage(
  message: Memory,
): Record<string, unknown> | undefined {
  const messageMetadata = asRecord(message.content.metadata);
  const bridgeSender = asRecord(messageMetadata?.bridgeSender);
  return asRecord(bridgeSender?.metadata);
}
```

### How It Works

- Message content has optional `metadata.bridgeSender`
- `bridgeSender` contains connector-specific sender info
- Used by `resolveEntityRole()` to match against connector admin whitelists

### Why It's Brittle

1. **Not Required**: bridgeSender is optional; if not set, role resolution falls back to database lookup
2. **Connector-Specific**: Each connector must manually populate bridgeSender
3. **One-Shot Check**: Used only in `resolveEntityRole()` when checking roles
4. **Not Persisted**: If a message doesn't have bridgeSender, the identity info is lost
5. **No Unification**: Even if bridgeSender has the same entity ID, it doesn't link identities across worlds

### Example Failure Mode

If Discord connector doesn't set bridgeSender.metadata in message content:
- User appears to have GUEST role (not found in world.metadata.roles)
- Even though they're in the admin whitelist
- Because `getLiveEntityMetadataFromMessage()` returns undefined

---

## 7. Entity Merging: DOESN'T EXIST (Critical Gap)

**Location**: `eliza/packages/typescript/src/entities.ts`

Searching the entire entities.ts file:
- ❌ NO merge function
- ❌ NO deduplication logic
- ❌ NO linking mechanism between entities

The closest thing to merging is in `getEntityDetails()` (lines 456-521):
```typescript
export async function getEntityDetails({
  runtime,
  roomId,
}: {
  runtime: IAgentRuntime;
  roomId: UUID;
}) {
  const [room, roomEntities] = await Promise.all([
    runtime.getRoom(roomId),
    runtime.getEntitiesForRoom(roomId, true),
  ]);

  const uniqueEntities = new Map();

  for (const entity of roomEntities) {
    if (uniqueEntities.has(entity.id)) continue;

    const allData = {};
    for (const component of entity.components || []) {
      Object.assign(allData, component.data);
    }
    // ... merges component data
  }
}
```

This:
- ✅ Merges component data within a single room
- ❌ **DOESN'T MERGE ENTITIES** (just dedupes by entity.id within a room)
- ❌ **DOESN'T LINK DIFFERENT ENTITY IDS** (e.g., discord-user-123 vs telegram-user-456)

### What Would Break If We Tried to Merge

**Schema Constraints**:
- (entity_id, agent_id) is unique and immutable
- Components have FK to entity_id
- Room participants FK to entity_id
- Can't just delete one entity and replace all FKs

**No Linking Table**:
- No `entity_aliases` or `entity_merges` table
- No way to say "entity A and entity B are the same person"
- Would require:
  1. New linking table or metadata field
  2. Migration of all components/participants to new entity_id
  3. Audit trail of the merge
  4. Reversal logic if merge was wrong

**No Resolution Pipeline**:
- No function to "claim all of entity A's data as entity B"
- No deduplication service
- Would need to be transactional across multiple tables

---

## 8. How Entity IDs Are Determined In Connectors

### Web Chat (Known Pattern)

From `chat-routes.ts`:
```typescript
const userId = ensureAdminEntityIdForChat(state); // stringToUuid(`${agentName}-admin-entity`)
const roomId = stringToUuid(`${agentName}-${channelIdPrefix}-room-${roomKey}`) as UUID;
const worldId = stringToUuid(`${agentName}-web-chat-world`) as UUID;
```

→ **Deterministic, same for every user**

### Discord/Telegram/etc (Unknown Pattern)

**The code doesn't show how connectors create entity IDs for users.**

Searching for connector code that calls `ensureConnection()` or `createEntity()`:
- Found in `connection.ts`: connectors pass `entityId` to `ensureConnection()`
- BUT: No visible code showing how Discord connector generates entityId from Discord user ID

**Possible patterns**:
1. `stringToUuid(`discord:${discordUserId}`) → SAME across worlds ✓
2. Per-world entityId generation → DIFFERENT across worlds ✗
3. No pattern at all → Random entity IDs created per message ✗✗

**Need to check**: Discord plugin source code to see how it generates entityId.

---

## 9. Core Brittleness: What WILL Break

### Scenario 1: Owner Privileges Across Platforms

```
1. Owner messages app → OWNER role in app-world
2. Owner messages Discord → entity in discord-world, but NO OWNER role (yet)
3. Plugin-roles runs ensureOwnerRole() → OWNER role added in discord-world
4. Owner messages Telegram (BEFORE admin adds it to connectors list)
   → New telegram-world created, NO OWNER role assigned
   → Owner has GUEST role in telegram until someone manually updates world.metadata
```

### Scenario 2: Claims/Components Don't Cross Worlds

```
1. In Discord: "I'm a developer" (stored as CLAIM component in discord-world)
2. In Telegram: Same user asks "what am I?"
   → Query returns "guest" because component is in discord-world, not telegram-world
   → Identity context is lost across platforms
```

### Scenario 3: If Discord and Telegram Assign Different Entity IDs

```
1. Discord creates entity: uuid("discord:user-123") = ABC-123
2. Telegram creates entity: uuid("telegram:user-456") = DEF-456
   (Same human, different IDs in different worlds)
3. No mechanism to link ABC-123 and DEF-456
4. They're treated as completely separate users forever
5. NO entity merge capability
```

### Scenario 4: Admin Whitelist Matches Only at Message Time

```
1. Telegram admin whitelist: "telegram": ["user-456"]
2. User messages Telegram → bridgeSender.metadata.telegram.id = "user-456"
   → resolveEntityRole() matches whitelist → ADMIN role (live, not persisted)
3. User doesn't message again → role isn't persisted in world.metadata.roles
4. Admin whitelist config is later removed
5. User messages again → NO live match → role lookup in world.metadata.roles fails
   → User appears as GUEST even though they should be ADMIN
```

---

## 10. What SHOULD Exist But DOESN'T

### Missing: Cross-World Role Unification

```typescript
// This doesn't exist:
async function ensureRoleConsistency(
  runtime: IAgentRuntime,
  entityId: UUID,
  worldIds: UUID[],
  role: RoleName,
): Promise<void> {
  // Set the same role in ALL worlds
}
```

### Missing: Entity Linking/Merging

```typescript
// This doesn't exist:
async function linkEntities(
  runtime: IAgentRuntime,
  primaryEntityId: UUID,
  aliasEntityIds: UUID[],
): Promise<void> {
  // Create canonical entity record
  // Redirect all queries from aliasEntityIds to primaryEntityId
}
```

### Missing: Cross-World Component Query

```typescript
// This doesn't exist:
async function getComponentAcrossWorlds(
  runtime: IAgentRuntime,
  entityId: UUID,
  componentType: string,
  worldIds?: UUID[],
): Promise<Component[]> {
  // Returns components from multiple worlds
  // Needed to unify identity context
}
```

### Missing: World-Agnostic Metadata

Currently:
- Roles stored in world.metadata.roles per world
- Entities have metadata, but it's not world-specific

Should have:
- Separate `entity_metadata` table or field that's **not** world-scoped
- Used for claims, identity proofs, etc. that should persist across worlds

---

## Summary: The Three-Layer Problem

### Layer 1: Entity Creation (Deterministic but World-Agnostic)
- ✅ Entity IDs are deterministic
- ❌ Created per-connector (per-world)
- ❌ No guarantee same person gets same ID across worlds

### Layer 2: Role/Permission Storage (World-Specific)
- ❌ Roles stored in world.metadata.roles[entityId]
- ❌ Same entity can have OWNER in one world, GUEST in another
- ❌ No automatic role propagation to new worlds

### Layer 3: Entity Linking (Completely Missing)
- ❌ No merge capability
- ❌ No linking table
- ❌ No deduplication service
- ❌ If two entity IDs represent the same person, they stay separate forever

---

## Architectural Recommendations

1. **Add entity_links table**: Track that entityA (discord) = entityB (telegram)
2. **Add universal roles**: Separate from world.metadata; apply across all worlds
3. **Add cross-world component query**: Unify identity context across platforms
4. **Implement entity merging**: With audit trail and reversal capability
5. **Require bridgeSender**: Make it mandatory; validate connector ID matches entity metadata
6. **Add world bootstrap to plugins**: Ensure roles are set when new worlds are created
7. **Add identity verification layer**: Before entities can be linked, verify ownership
