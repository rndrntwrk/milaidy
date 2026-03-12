/**
 * STREAM555_SOURCE_UPDATE Action
 *
 * Update an existing source.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  SourceConfig,
  SourceData,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const sourceUpdateAction: Action = {
  name: 'STREAM555_SOURCE_UPDATE',
  description: 'Update an existing source. Can modify label, status, or metadata.',
  similes: [
    'UPDATE_SOURCE',
    'MODIFY_SOURCE',
    'EDIT_SOURCE',
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
    message: Memory,
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

      const sourceId = options?.sourceId as string | undefined;

      if (!sourceId) {
        if (callback) {
          callback({
            text: 'No source ID provided. Specify which source to update.',
            content: { success: false, error: 'No sourceId provided' },
          });
        }
        return false;
      }

      // Build updates
      const updates: Partial<SourceConfig> = {};
      if (options?.label !== undefined) updates.label = options.label as string;
      if (options?.metadata !== undefined) updates.metadata = options.metadata as Record<string, unknown>;

      if (Object.keys(updates).length === 0) {
        if (callback) {
          callback({
            text: 'No updates provided. Specify what to change.',
            content: { success: false, error: 'No updates provided' },
          });
        }
        return false;
      }

      const source = await service.updateSource(sourceId, updates);

      if (callback) {
        callback({
          text: formatSourceResponse('Updated', source),
          content: { success: true, data: { source } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to update source: ${errorMessage}`,
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
        content: { text: 'Rename the camera source' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Renaming the camera source.',
          action: 'STREAM555_SOURCE_UPDATE',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatSourceResponse(action: string, source: SourceData): string {
  const lines: string[] = [];

  lines.push(`**Source ${action}**`);
  lines.push('');
  lines.push(`**ID:** \`${source.id}\``);
  lines.push(`**Type:** ${source.type}`);
  lines.push(`**Label:** ${source.label}`);
  lines.push(`**Status:** ${source.status}`);

  return lines.join('\n');
}

export default sourceUpdateAction;
