# 555stream Plugin - Approval UI Design

This document describes the UI requirements for the operator approval dashboard.

## Table of Contents

1. [Overview](#overview)
2. [Pending Approvals Dashboard](#pending-approvals-dashboard)
3. [Individual Approval Page](#individual-approval-page)
4. [Approval History](#approval-history)
5. [Action-Specific Cards](#action-specific-cards)
6. [API Integration](#api-integration)
7. [Real-time Updates](#real-time-updates)

---

## Overview

The approval UI allows operators to review and approve/reject agent actions that require human oversight. This is critical for:

- **Stream Start/Stop** - Going live or ending streams
- **Deletions** - Permanent removal of graphics, sources, videos
- **Guest Access** - Creating invite links or removing participants

### Design Principles

1. **Urgency Indicators** - Show time remaining prominently
2. **Context** - Display all parameters the action will use
3. **Warnings** - Explain the impact of each action
4. **One-Click Actions** - Easy approve/reject buttons
5. **Audit Trail** - Track who approved what and when

---

## Pending Approvals Dashboard

**URL:** `/555stream/approvals`

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  555stream Agent Control                                     [Refresh] [?]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  🔔 PENDING APPROVALS (3)                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  🔴 HIGH RISK                                                         │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  STREAM555_STREAM_START                                        │  │  │
│  │  │                                                                │  │  │
│  │  │  Agent wants to start streaming with lofi radio input         │  │  │
│  │  │                                                                │  │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐ │  │  │
│  │  │  │ Input Type    │ lofi                                     │ │  │  │
│  │  │  │ Platforms     │ youtube, twitch                          │ │  │  │
│  │  │  └──────────────────────────────────────────────────────────┘ │  │  │
│  │  │                                                                │  │  │
│  │  │  ⏱️ Requested: 2 minutes ago                                   │  │  │
│  │  │  ⏳ Expires: 3 minutes remaining                               │  │  │
│  │  │  ████████████████████░░░░░░░░░░                                │  │  │
│  │  │                                                                │  │  │
│  │  │  ⚠️ This will start a LIVE stream immediately                  │  │  │
│  │  │                                                                │  │  │
│  │  │            [✅ APPROVE]              [❌ REJECT]                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  🟠 MEDIUM RISK                                                       │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  STREAM555_GUEST_INVITE                                        │  │  │
│  │  │                                                                │  │  │
│  │  │  Agent wants to create guest invite link                      │  │  │
│  │  │                                                                │  │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐ │  │  │
│  │  │  │ Label         │ "Co-host Interview"                      │ │  │  │
│  │  │  └──────────────────────────────────────────────────────────┘ │  │  │
│  │  │                                                                │  │  │
│  │  │  ⏱️ Requested: 4 minutes ago                                   │  │  │
│  │  │  ⏳ Expires: 1 minute remaining                                │  │  │
│  │  │  ██████████████████████████████████████░░░░░░░░               │  │  │
│  │  │                                                                │  │  │
│  │  │  ℹ️ Will create a shareable join link                          │  │  │
│  │  │                                                                │  │  │
│  │  │            [✅ APPROVE]              [❌ REJECT]                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  STREAM555_VIDEO_DELETE                                        │  │  │
│  │  │                                                                │  │  │
│  │  │  Agent wants to delete a video asset                          │  │  │
│  │  │                                                                │  │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐ │  │  │
│  │  │  │ Video ID      │ vid_abc123                                │ │  │  │
│  │  │  │ Filename      │ intro-animation.mp4                       │ │  │  │
│  │  │  └──────────────────────────────────────────────────────────┘ │  │  │
│  │  │                                                                │  │  │
│  │  │  ⏱️ Requested: 30 seconds ago                                  │  │  │
│  │  │  ⏳ Expires: 4 minutes 30 seconds                              │  │  │
│  │  │  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  │  │
│  │  │                                                                │  │  │
│  │  │  ⚠️ This action cannot be undone                               │  │  │
│  │  │                                                                │  │  │
│  │  │            [✅ APPROVE]              [❌ REJECT]                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  📜 View Approval History →                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Structure

```typescript
interface PendingApprovalsPage {
  // Data
  approvals: Approval[];
  loading: boolean;
  error: string | null;

  // Actions
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

interface ApprovalCard {
  approval: Approval;
  riskLevel: 'high' | 'medium' | 'low';
  warningMessage: string;
  onApprove: () => void;
  onReject: () => void;
}
```

### Risk Level Mapping

| Risk | Actions | Color |
|------|---------|-------|
| **HIGH** | STREAM_START, STREAM_STOP, STREAM_FALLBACK | Red |
| **MEDIUM** | All DELETE actions, GUEST_INVITE, GUEST_REMOVE | Orange |
| **LOW** | PLATFORM_CONFIG (conditional) | Yellow |

---

## Individual Approval Page

**URL:** `/555stream/approvals/:id`

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  555stream Agent Control                           [← Back to Approvals]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  APPROVAL REQUEST DETAILS                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Action:       STREAM555_STREAM_START                                │  │
│  │  Approval ID:  approval-1705432100000-abc123def                      │  │
│  │  Status:       🟡 PENDING                                             │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PARAMETERS                                                           │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  input.type              lofi                                        │  │
│  │  input.radioConfig       {                                           │  │
│  │                            "autoDJMode": "chill",                    │  │
│  │                            "activeTracks": ["lofi-1", "lofi-2"],     │  │
│  │                            "volumes": { "master": 0.8 }              │  │
│  │                          }                                           │  │
│  │  options.platforms       ["youtube", "twitch"]                       │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  TIMELINE                                                             │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  Created:     Jan 16, 2025 15:35:00                                  │  │
│  │  Expires:     Jan 16, 2025 15:40:00                                  │  │
│  │  Remaining:   3 minutes 24 seconds                                   │  │
│  │                                                                       │  │
│  │  ████████████████████░░░░░░░░░░                                      │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ⚠️  WARNING                                                          │  │
│  │                                                                       │  │
│  │  This action will start a LIVE stream to the following platforms:   │  │
│  │                                                                       │  │
│  │    • YouTube (enabled)                                               │  │
│  │    • Twitch (enabled)                                                │  │
│  │                                                                       │  │
│  │  The stream will begin immediately after approval.                   │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │              [✅ APPROVE AND START]         [❌ REJECT]               │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Resolved Approval View

When an approval has been resolved, show the outcome:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  Action:       STREAM555_STREAM_START                                │
│  Approval ID:  approval-1705432100000-abc123def                      │
│  Status:       ✅ APPROVED                                            │
│                                                                       │
│  Resolved:     Jan 16, 2025 15:37:22                                 │
│  Resolved By:  operator@example.com                                  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Approval History

**URL:** `/555stream/approvals/history`

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  555stream Agent Control                           [← Back to Approvals]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  APPROVAL HISTORY                                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Filter: [All Statuses ▼]  [Last 24 hours ▼]  [🔍 Search...]         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ┌────────┬─────────────────────────┬──────────┬──────────┬────────┐ │  │
│  │  │ Status │ Action                  │ Requested│ Resolved │ By     │ │  │
│  │  ├────────┼─────────────────────────┼──────────┼──────────┼────────┤ │  │
│  │  │   ✅   │ STREAM555_STREAM_STOP   │ 10m ago  │ 8m ago   │ op@    │ │  │
│  │  │   ❌   │ STREAM555_GUEST_INVITE  │ 25m ago  │ 23m ago  │ op@    │ │  │
│  │  │   ⏰   │ STREAM555_VIDEO_DELETE  │ 1h ago   │ (expired)│ -      │ │  │
│  │  │   ✅   │ STREAM555_STREAM_START  │ 2h ago   │ 2h ago   │ admin@ │ │  │
│  │  │   ✅   │ STREAM555_GRAPHICS_DEL  │ 3h ago   │ 3h ago   │ op@    │ │  │
│  │  │   ❌   │ STREAM555_SOURCE_DELETE │ 4h ago   │ 4h ago   │ admin@ │ │  │
│  │  │   ⏰   │ STREAM555_STREAM_START  │ 5h ago   │ (expired)│ -      │ │  │
│  │  │   ✅   │ STREAM555_GUEST_REMOVE  │ 6h ago   │ 6h ago   │ op@    │ │  │
│  │  └────────┴─────────────────────────┴──────────┴──────────┴────────┘ │  │
│  │                                                                       │  │
│  │  Showing 8 of 47 approvals                                           │  │
│  │                                                                       │  │
│  │                          [Load More]                                  │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status Icons

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ | `approved` | Operator approved the action |
| ❌ | `rejected` | Operator rejected the action |
| ⏰ | `expired` | TTL exceeded (5 minutes) |
| 🟡 | `pending` | Still awaiting decision |

### Filters

- **Status**: All, Approved, Rejected, Expired
- **Time Range**: Last hour, Last 24 hours, Last 7 days, All time
- **Search**: By action name or approval ID

---

## Action-Specific Cards

Each action type has customized display and warnings.

### STREAM555_STREAM_START

```
┌────────────────────────────────────────────────────────────────┐
│  🔴 STREAM555_STREAM_START                                     │
│                                                                │
│  Agent wants to start streaming                                │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Input Type      │ lofi                                   │ │
│  │ Radio Config    │ autoDJMode: chill, tracks: 3          │ │
│  │ Target Platforms│ ▶️ YouTube  ▶️ Twitch                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ⚠️ Stream will go LIVE immediately to all enabled platforms  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### STREAM555_STREAM_STOP

```
┌────────────────────────────────────────────────────────────────┐
│  🔴 STREAM555_STREAM_STOP                                      │
│                                                                │
│  Agent wants to stop the active stream                         │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Current Duration│ 01:45:32                               │ │
│  │ Active Platforms│ ▶️ YouTube (2.3k viewers)               │ │
│  │                 │ ▶️ Twitch (1.1k viewers)                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ⚠️ Stream will END for all connected viewers                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### STREAM555_GUEST_INVITE

```
┌────────────────────────────────────────────────────────────────┐
│  🟠 STREAM555_GUEST_INVITE                                     │
│                                                                │
│  Agent wants to create a guest invite link                     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Label           │ "Co-host Interview"                    │ │
│  │ Invite Expiry   │ 24 hours (default)                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ℹ️ A shareable link will be created that allows joining       │
│    the stream as a guest participant                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### DELETE Actions (VIDEO, GRAPHICS, SOURCE)

```
┌────────────────────────────────────────────────────────────────┐
│  🟠 STREAM555_VIDEO_DELETE                                     │
│                                                                │
│  Agent wants to delete a video asset                           │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Video ID        │ vid_abc123                             │ │
│  │ Filename        │ intro-animation.mp4                    │ │
│  │ Size            │ 45.2 MB                                │ │
│  │ Uploaded        │ Jan 15, 2025                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  📹 [Video Thumbnail Preview]                            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ⚠️ This action CANNOT be undone. The video will be           │
│    permanently deleted from the system.                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### STREAM555_PLATFORM_CONFIG

```
┌────────────────────────────────────────────────────────────────┐
│  🟡 STREAM555_PLATFORM_CONFIG                                  │
│                                                                │
│  Agent wants to update platform configuration                  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Platform        │ youtube                                │ │
│  │ RTMP URL        │ rtmp://a.rtmp.youtube.com/live2       │ │
│  │ Stream Key      │ ●●●●●●●●●●●●●●●● (changing)           │ │
│  │ Enabled         │ true                                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ⚠️ Changing the stream key will affect future streams.        │
│    Current stream (if active) will not be affected.           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## API Integration

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/555stream/approvals` | List pending approvals |
| GET | `/555stream/approvals/history` | List all approvals (limit 50) |
| GET | `/555stream/approvals/:id` | Get single approval details |
| POST | `/555stream/approvals/:id/approve` | Approve an action |
| POST | `/555stream/approvals/:id/reject` | Reject an action |

### Authentication

All endpoints require Bearer token authentication:

```
Authorization: Bearer <STREAM555_AGENT_TOKEN>
```

### Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Missing or malformed authorization |
| 403 | Invalid token |
| 404 | Approval not found |
| 409 | Approval already resolved |
| 410 | Approval expired |

### Example Requests

**List Pending:**
```bash
curl http://localhost:3000/555stream/approvals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Approve:**
```bash
curl -X POST http://localhost:3000/555stream/approvals/abc123/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": "operator@example.com"}'
```

**Reject:**
```bash
curl -X POST http://localhost:3000/555stream/approvals/abc123/reject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rejectedBy": "operator@example.com"}'
```

---

## Real-time Updates

For the best operator experience, implement real-time updates:

### Polling (Simple)

```typescript
// Poll every 5 seconds for pending approvals
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await fetch('/555stream/approvals', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    setApprovals(data.approvals);
  }, 5000);

  return () => clearInterval(interval);
}, []);
```

### WebSocket (Recommended)

Subscribe to the agent WebSocket for instant updates:

```typescript
// Connect to 555stream WebSocket
const ws = new WebSocket('wss://control.555.tv/api/agent/v1/ws');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'approval_created') {
    // New approval - add to list
    addApproval(message.approval);
  }

  if (message.type === 'approval_expired') {
    // Approval expired - update status
    updateApprovalStatus(message.approvalId, 'expired');
  }
};
```

### Countdown Timer

For expiry countdown, use a client-side timer:

```typescript
function useCountdown(expiresAt: number) {
  const [remaining, setRemaining] = useState(
    Math.max(0, expiresAt - Date.now())
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const newRemaining = Math.max(0, expiresAt - Date.now());
      setRemaining(newRemaining);

      if (newRemaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return remaining;
}
```

---

## Implementation Checklist

### Components

- [ ] `PendingApprovalsList` - Main dashboard component
- [ ] `ApprovalCard` - Individual approval display
- [ ] `ApprovalDetail` - Full approval detail page
- [ ] `ApprovalHistory` - History list with filters
- [ ] `CountdownTimer` - Expiry countdown display
- [ ] `ProgressBar` - Visual time remaining indicator

### Features

- [ ] Fetch and display pending approvals
- [ ] Approve/reject with confirmation
- [ ] Real-time countdown to expiry
- [ ] Risk level color coding
- [ ] Action-specific parameter display
- [ ] Warning messages per action type
- [ ] History with filters and search
- [ ] Real-time updates (polling or WebSocket)

### UX Enhancements

- [ ] Sound/notification on new approval
- [ ] Toast messages on approve/reject
- [ ] Confirm dialog before approve/reject
- [ ] Loading states and error handling
- [ ] Empty state for no pending approvals
- [ ] Mobile-responsive layout
