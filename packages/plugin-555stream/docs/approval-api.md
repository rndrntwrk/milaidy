# 555stream Plugin - Approval API Reference

Complete API documentation for the approval system endpoints.

## Base URL

All approval endpoints are prefixed with `/555stream/approvals`.

These endpoints are served by **elizaOS** (not the 555stream backend). Replace `localhost:3000` with your elizaOS deployment URL.

When running elizaOS locally, the full URL is:
```
http://localhost:3000/555stream/approvals
```

In production, this would be your elizaOS deployment URL:
```
https://your-elizaos-instance.com/555stream/approvals
```

## Authentication

All endpoints require Bearer token authentication using the `STREAM555_AGENT_TOKEN`.

**Header:**
```
Authorization: Bearer <your_agent_token>
```

**Error Responses:**

| Code | Body | Cause |
|------|------|-------|
| 401 | `{"error": "Authorization header required", "hint": "Include \"Authorization: Bearer YOUR_TOKEN\" header"}` | Missing header |
| 401 | `{"error": "Invalid authorization format", "hint": "Use \"Bearer <token>\" format"}` | Malformed header |
| 403 | `{"error": "Invalid token"}` | Token doesn't match |

---

## Endpoints

### List Pending Approvals

**GET** `/555stream/approvals`

Returns all pending approval requests.

**Request:**
```bash
curl http://localhost:3000/555stream/approvals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**
```json
{
  "approvals": [
    {
      "id": "approval-1705432100000-abc123def",
      "actionName": "STREAM555_STREAM_START",
      "actionParams": {
        "input": { "type": "lofi" },
        "options": { "platforms": ["youtube", "twitch"] }
      },
      "status": "pending",
      "createdAt": 1705432100000,
      "expiresAt": 1705432400000
    },
    {
      "id": "approval-1705432200000-xyz789ghi",
      "actionName": "STREAM555_GUEST_INVITE",
      "actionParams": {
        "label": "Co-host Interview"
      },
      "status": "pending",
      "createdAt": 1705432200000,
      "expiresAt": 1705432500000
    }
  ],
  "count": 2
}
```

**Notes:**
- Only returns approvals with `status: "pending"`
- Automatically cleans up expired approvals before returning
- Sorted by `createdAt` descending (newest first)

---

### Get Approval Details

**GET** `/555stream/approvals/:id`

Returns details of a single approval request.

**Request:**
```bash
curl http://localhost:3000/555stream/approvals/approval-1705432100000-abc123def \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**
```json
{
  "approval": {
    "id": "approval-1705432100000-abc123def",
    "actionName": "STREAM555_STREAM_START",
    "actionParams": {
      "input": { "type": "lofi" },
      "options": { "platforms": ["youtube", "twitch"] }
    },
    "status": "pending",
    "createdAt": 1705432100000,
    "expiresAt": 1705432400000
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "Approval not found"
}
```

**Notes:**
- If the approval is pending and past its TTL, the status will be updated to `"expired"` in the response

---

### Approve an Action

**POST** `/555stream/approvals/:id/approve`

Approve a pending approval request, allowing the action to execute.

**Request:**
```bash
curl -X POST http://localhost:3000/555stream/approvals/approval-1705432100000-abc123def/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": "operator@example.com"}'
```

**Request Body (Optional):**
```json
{
  "approvedBy": "operator@example.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `approvedBy` | string | No | Identifier of who approved (for audit) |

**Response (200 OK):**
```json
{
  "success": true,
  "approval": {
    "id": "approval-1705432100000-abc123def",
    "actionName": "STREAM555_STREAM_START",
    "actionParams": {
      "input": { "type": "lofi" },
      "options": { "platforms": ["youtube", "twitch"] }
    },
    "status": "approved",
    "createdAt": 1705432100000,
    "expiresAt": 1705432400000,
    "resolvedAt": 1705432150000,
    "resolvedBy": "operator@example.com"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "Approval not found"
}
```

**Response (409 Conflict):**
```json
{
  "error": "Approval already approved",
  "approval": { ... }
}
```

**Response (410 Gone):**
```json
{
  "error": "Approval has expired",
  "approval": {
    "id": "approval-1705432100000-abc123def",
    "status": "expired",
    ...
  }
}
```

---

### Reject an Action

**POST** `/555stream/approvals/:id/reject`

Reject a pending approval request, preventing the action from executing.

**Request:**
```bash
curl -X POST http://localhost:3000/555stream/approvals/approval-1705432100000-abc123def/reject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rejectedBy": "operator@example.com"}'
```

**Request Body (Optional):**
```json
{
  "rejectedBy": "operator@example.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rejectedBy` | string | No | Identifier of who rejected (for audit) |

**Response (200 OK):**
```json
{
  "success": true,
  "approval": {
    "id": "approval-1705432100000-abc123def",
    "actionName": "STREAM555_STREAM_START",
    "actionParams": { ... },
    "status": "rejected",
    "createdAt": 1705432100000,
    "expiresAt": 1705432400000,
    "resolvedAt": 1705432150000,
    "resolvedBy": "operator@example.com"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "Approval not found"
}
```

**Response (409 Conflict):**
```json
{
  "error": "Approval already rejected",
  "approval": { ... }
}
```

**Response (410 Gone):**
```json
{
  "error": "Approval has expired",
  "approval": { ... }
}
```

---

### Get Approval History

**GET** `/555stream/approvals/history`

Returns all approvals including resolved ones (approved, rejected, expired).

**Request:**
```bash
curl http://localhost:3000/555stream/approvals/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**
```json
{
  "approvals": [
    {
      "id": "approval-1705432100000-abc123def",
      "actionName": "STREAM555_STREAM_START",
      "actionParams": { ... },
      "status": "approved",
      "createdAt": 1705432100000,
      "expiresAt": 1705432400000,
      "resolvedAt": 1705432150000,
      "resolvedBy": "operator@example.com"
    },
    {
      "id": "approval-1705432000000-xyz789",
      "actionName": "STREAM555_GUEST_INVITE",
      "actionParams": { ... },
      "status": "rejected",
      "createdAt": 1705432000000,
      "expiresAt": 1705432300000,
      "resolvedAt": 1705432050000,
      "resolvedBy": "admin@example.com"
    },
    {
      "id": "approval-1705431900000-qrs456",
      "actionName": "STREAM555_VIDEO_DELETE",
      "actionParams": { ... },
      "status": "expired",
      "createdAt": 1705431900000,
      "expiresAt": 1705432200000
    }
  ],
  "count": 3
}
```

**Notes:**
- Limited to 50 most recent approvals
- Sorted by `createdAt` descending (newest first)
- Includes all statuses: pending, approved, rejected, expired
- Approvals older than 1 hour are automatically deleted

---

## Data Types

### Approval Object

```typescript
interface Approval {
  // Unique identifier
  id: string;  // Format: "approval-{timestamp}-{random}"

  // The action requesting approval
  actionName: string;  // e.g., "STREAM555_STREAM_START"

  // Parameters the action will use
  actionParams: Record<string, unknown>;

  // Current status
  status: "pending" | "approved" | "rejected" | "expired";

  // Timestamps (Unix milliseconds)
  createdAt: number;   // When approval was requested
  expiresAt: number;   // When approval will expire (createdAt + 5 min)
  resolvedAt?: number; // When approved/rejected (not set for pending/expired)

  // Who resolved (optional, for audit)
  resolvedBy?: string;
}
```

### Actions That Require Approval

| Action Name | Risk Level | Description |
|-------------|------------|-------------|
| `STREAM555_STREAM_START` | HIGH | Start streaming to platforms |
| `STREAM555_STREAM_STOP` | HIGH | Stop active stream |
| `STREAM555_STREAM_FALLBACK` | HIGH | Switch to fallback mode |
| `STREAM555_GRAPHICS_DELETE` | MEDIUM | Delete a graphic overlay |
| `STREAM555_SOURCE_DELETE` | MEDIUM | Delete a source |
| `STREAM555_GUEST_INVITE` | MEDIUM | Create guest invite link |
| `STREAM555_GUEST_REMOVE` | MEDIUM | Remove/revoke guest |
| `STREAM555_VIDEO_DELETE` | MEDIUM | Delete video asset |
| `STREAM555_PLATFORM_CONFIG` | LOW* | Configure platform (conditional) |

*Platform config only requires approval when setting stream keys.

---

## Timing & TTL

| Parameter | Value | Description |
|-----------|-------|-------------|
| Approval TTL | 5 minutes | Time before pending approval expires |
| History retention | 1 hour | Approvals deleted after 1 hour |
| Cleanup trigger | On list/create | Expired items cleaned on access |

### Expiry Behavior

1. **Lazy expiry**: Status updated to `"expired"` when accessed after TTL
2. **No scheduled cleanup**: Expiry happens on read, not background job
3. **Cannot approve expired**: Returns 410 Gone if attempted

---

## Workflow Examples

### Complete Approval Flow

```bash
# 1. Agent triggers action, plugin creates approval
# (This happens automatically when agent calls dangerous action)

# 2. Operator lists pending approvals
curl http://localhost:3000/555stream/approvals \
  -H "Authorization: Bearer $TOKEN"
# Response: [{ id: "approval-xxx", status: "pending", ... }]

# 3. Operator reviews and approves
curl -X POST http://localhost:3000/555stream/approvals/approval-xxx/approve \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"approvedBy": "operator@example.com"}'
# Response: { success: true, approval: { status: "approved", ... } }

# 4. Agent re-invokes action with approval ID
# (Agent automatically includes _approvalId in next call)

# 5. Action executes successfully
```

### Handling Expiry

```bash
# If operator takes too long (>5 min)
curl -X POST http://localhost:3000/555stream/approvals/approval-xxx/approve \
  -H "Authorization: Bearer $TOKEN"
# Response (410): { error: "Approval has expired", approval: { status: "expired" } }

# Agent must request new approval by calling action again
```

### Polling for Updates

```bash
# Poll every 5 seconds for new approvals
while true; do
  curl -s http://localhost:3000/555stream/approvals \
    -H "Authorization: Bearer $TOKEN" | jq '.count'
  sleep 5
done
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 401 | Unauthorized | Check Authorization header |
| 403 | Forbidden | Verify token matches |
| 404 | Not Found | Approval doesn't exist |
| 409 | Conflict | Already resolved (approved/rejected) |
| 410 | Gone | Approval expired |

### Client-Side Handling

```typescript
async function approveAction(approvalId: string, token: string) {
  const response = await fetch(
    `http://localhost:3000/555stream/approvals/${approvalId}/approve`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ approvedBy: 'operator' })
    }
  );

  if (response.ok) {
    const { approval } = await response.json();
    console.log('Approved:', approval.id);
    return approval;
  }

  const error = await response.json();

  switch (response.status) {
    case 401:
    case 403:
      throw new Error('Authentication failed');
    case 404:
      throw new Error('Approval not found');
    case 409:
      console.warn('Already resolved:', error.approval.status);
      return error.approval;
    case 410:
      throw new Error('Approval expired - agent must retry');
    default:
      throw new Error(error.error || 'Unknown error');
  }
}
```

---

## Security Considerations

1. **Token Protection**: Never expose `STREAM555_AGENT_TOKEN` in client-side code
2. **HTTPS**: Always use HTTPS in production
3. **Audit Trail**: Set `approvedBy`/`rejectedBy` for accountability
4. **TTL**: 5-minute expiry prevents stale approvals
5. **Single Use**: Each approval can only be used once

---

## Rate Limits

Currently no rate limits are enforced on approval endpoints. Consider implementing:

- Max pending approvals per agent: 10
- Max approval requests per minute: 60
- Max history queries per minute: 30
