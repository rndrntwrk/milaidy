/**
 * STREAM555_SOURCE_CREATE Action
 *
 * Create a new source.
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

export const sourceCreateAction: Action = {
  name: 'STREAM555_SOURCE_CREATE',
  description: 'Create a new source for the stream. Types: camera, screen, guest, media, browser.',
  similes: [
    'ADD_SOURCE',
    'CREATE_SOURCE',
    'ADD_INPUT',
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

      const sourceType = options?.type as string | undefined;

      if (!sourceType) {
        if (callback) {
          callback({
            text: 'No source type provided. Valid types: camera, screen, guest, media, browser.',
            content: { success: false, error: 'No type provided' },
          });
        }
        return false;
      }

      const sourceConfig: SourceConfig = {
        type: sourceType,
        label: options?.label as string | undefined,
        deviceId: options?.deviceId as string | undefined,
        deviceLabel: options?.deviceLabel as string | undefined,
        metadata: options?.metadata as Record<string, unknown> | undefined,
      };

      const source = await service.createSource(sourceConfig);

      if (callback) {
        callback({
          text: formatSourceResponse('Created', source),
          content: { success: true, data: { source } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to create source: ${errorMessage}`,
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
        content: { text: 'Add a camera source' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Adding a camera source.',
          action: 'STREAM555_SOURCE_CREATE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Create a screen share source' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Creating a screen share source.',
          action: 'STREAM555_SOURCE_CREATE',
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

export default sourceCreateAction;
