/**
 * STREAM555_CAPABILITIES Provider
 *
 * Returns available 555stream operations based on agent token scopes.
 */

import type { Provider, IAgentRuntime, Memory, State } from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

// Action category type
interface ActionCategory {
  actions: string[];
  scopes: string[];
  description: string;
  requiresApproval?: boolean;
}

// Action categories and their required scopes
const ACTION_CAPABILITIES: Record<string, ActionCategory> = {
  'Session Management': {
    actions: ['STREAM555_BOOTSTRAP_SESSION', 'STREAM555_HEALTHCHECK'],
    scopes: ['sessions:read', 'sessions:create'],
    description: 'Create, resume, and manage streaming sessions',
  },
  'Stream Control': {
    actions: ['STREAM555_STREAM_START', 'STREAM555_STREAM_STOP', 'STREAM555_STREAM_FALLBACK'],
    scopes: ['stream:start', 'stream:stop'],
    description: 'Start, stop, and manage live streams (requires approval)',
    requiresApproval: true,
  },
  'State Management': {
    actions: ['STREAM555_STATE_PATCH', 'STREAM555_LAYOUT_SET'],
    scopes: ['state:write'],
    description: 'Update production state, layouts, and scenes',
  },
  'Source Management': {
    actions: ['STREAM555_SOURCE_CREATE', 'STREAM555_SOURCE_UPDATE', 'STREAM555_SOURCE_DELETE'],
    scopes: ['sources:write'],
    description: 'Manage video/audio sources',
  },
  'Guest Management': {
    actions: ['STREAM555_GUEST_INVITE_CREATE', 'STREAM555_GUESTS_LIST'],
    scopes: ['guests:write', 'guests:read'],
    description: 'Invite and manage guest participants (invite requires approval)',
    requiresApproval: true,
  },
  'Media Operations': {
    actions: ['STREAM555_UPLOAD_IMAGE', 'STREAM555_UPLOAD_VIDEO', 'STREAM555_VIDEO_DELETE'],
    scopes: ['media:write'],
    description: 'Upload and manage media assets (delete requires approval)',
    requiresApproval: true,
  },
  'Platform Configuration': {
    actions: ['STREAM555_SETTINGS_GET', 'STREAM555_PLATFORM_CONFIG_SET'],
    scopes: ['platforms:read', 'platforms:write'],
    description: 'Configure streaming platforms and RTMP keys (config write requires approval)',
    requiresApproval: true,
  },
  'Radio Control': {
    actions: ['STREAM555_RADIO_CONFIG_SET', 'STREAM555_RADIO_CONTROL'],
    scopes: ['radio:write'],
    description: 'Control lofi radio features',
  },
};

export const capabilitiesProvider: Provider = {
  name: 'STREAM555_CAPABILITIES',
  description: 'Available 555stream operations based on agent token scopes and approval settings',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<string> => {
    try {
      const service = runtime.getService('stream555') as StreamControlService | undefined;

      if (!service) {
        return formatNotInitialized();
      }

      const config = service.getConfig();
      const isReady = service.isReady();

      return formatCapabilities(config?.requireApprovals ?? true, isReady);
    } catch (error) {
      return `[555stream Capabilities Error] ${(error as Error).message}`;
    }
  },
};

function formatNotInitialized(): string {
  return `## 555stream Capabilities
**Not initialized** - The 555stream plugin is not loaded.

No capabilities available until the plugin is properly initialized with:
- STREAM555_BASE_URL
- STREAM555_AGENT_TOKEN`;
}

function formatCapabilities(requireApprovals: boolean, isReady: boolean): string {
  const lines: string[] = [
    '## 555stream Capabilities',
    '',
    `**Status:** ${isReady ? 'Ready' : 'Not connected'}`,
    `**Approvals Required:** ${requireApprovals ? 'Yes' : 'No (dangerous mode)'}`,
    '',
  ];

  // Currently available actions
  lines.push('### Currently Available Actions');
  lines.push('');
  lines.push('These actions can be invoked now:');
  lines.push('- `STREAM555_HEALTHCHECK` - Verify connectivity and authentication');
  lines.push('- `STREAM555_BOOTSTRAP_SESSION` - Connect to a streaming session');
  lines.push('');

  // Future actions (Phase 2)
  lines.push('### Future Actions (Not Yet Implemented)');
  lines.push('');

  for (const [category, info] of Object.entries(ACTION_CAPABILITIES)) {
    if (category === 'Session Management') continue; // Already listed above

    lines.push(`**${category}**`);
    lines.push(`${info.description}`);

    if (info.requiresApproval && requireApprovals) {
      lines.push('*⚠️ Some actions in this category require operator approval*');
    }

    for (const action of info.actions) {
      lines.push(`- \`${action}\``);
    }
    lines.push('');
  }

  // Approval info
  if (requireApprovals) {
    lines.push('### Approval Process');
    lines.push('');
    lines.push('Dangerous operations require operator approval before execution:');
    lines.push('1. Agent requests the action');
    lines.push('2. Request is queued for approval');
    lines.push('3. Operator approves/rejects via 555stream UI');
    lines.push('4. If approved, action executes');
    lines.push('');
    lines.push('Operations requiring approval:');
    lines.push('- Starting/stopping streams');
    lines.push('- Writing RTMP keys or destinations');
    lines.push('- Deleting media assets');
    lines.push('- Creating guest invites');
  }

  return lines.join('\n');
}

export default capabilitiesProvider;
