/**
 * STREAM555_APP_LIST Action
 *
 * Lists available app-stream descriptors for app-mode go-live.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  AppStreamDescriptor,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function formatAppList(apps: AppStreamDescriptor[], source?: string): string {
  const lines: string[] = [];
  lines.push('**Available Stream Apps**');
  lines.push('');
  lines.push(`Found **${apps.length}** app(s)${source ? ` (source: ${source})` : ''}.`);
  lines.push('');

  if (apps.length === 0) {
    lines.push('No app descriptors are currently available.');
    return lines.join('\n');
  }

  for (const app of apps) {
    const displayName = app.displayName && app.displayName !== app.name
      ? `${app.displayName} (\`${app.name}\`)`
      : `\`${app.name}\``;
    lines.push(`- ${displayName}`);
    lines.push(`  - Viewer: ${app.viewer?.url || 'not provided'}`);
    lines.push(`  - Wrapper auth: ${app.viewer?.postMessageAuth ? 'required' : 'not required'}`);
    lines.push(`  - Public URL required: ${app.requirements?.publicUrlRequired ? 'yes' : 'no'}`);
    lines.push(`  - Localhost allowed: ${app.requirements?.localhostAllowed ? 'yes' : 'no'}`);
  }

  lines.push('');
  lines.push('Use `STREAM555_GO_LIVE_APP` with `appName` to start one.');
  return lines.join('\n');
}

export const streamAppListAction: Action = {
  name: 'STREAM555_APP_LIST',
  description: 'List available app-stream descriptors (Babylon, Agent Town, etc), including viewer URL and auth requirements.',
  similes: [
    'LIST_STREAM_APPS',
    'SHOW_STREAM_APPS',
    'AVAILABLE_APPS',
    'APP_CATALOG',
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const service = runtime.getService('stream555') as StreamControlService | undefined;
    return !!(service?.isReady());
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      const service = runtime.getService('stream555') as StreamControlService | undefined;

      if (!service) {
        if (callback) {
          callback({
            text: '555stream service is not initialized.',
            content: { success: false, error: 'Service not initialized' },
          });
        }
        return false;
      }

      const forceRefresh = parseBoolean(options?.forceRefresh) ?? false;
      const catalog = await service.listApps({ forceRefresh });

      if (callback) {
        callback({
          text: formatAppList(catalog.apps || [], catalog.source),
          content: {
            success: true,
            data: {
              apps: catalog.apps || [],
              source: catalog.source || null,
              fetchedAt: catalog.fetchedAt || null,
              ttlMs: catalog.ttlMs ?? null,
            },
          },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to list stream apps: ${errorMessage}`,
          content: { success: false, error: errorMessage },
        });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'What apps can we stream right now?' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Listing available stream apps now.',
          action: 'STREAM555_APP_LIST',
        },
      },
    ],
  ] as ActionExample[][],
};

export default streamAppListAction;
