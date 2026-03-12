/**
 * STREAM555_STREAM_START Action
 *
 * Start streaming with given input configuration.
 * Requires operator approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  StreamInput,
  StreamOptions,
  Source,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';
import {
  withApproval,
  formatApprovalPending,
  formatApprovalRejected,
  formatApprovalExpired,
} from '../lib/approvalHelper.js';

export const streamStartAction: Action = {
  name: 'STREAM555_STREAM_START',
  description: 'Start streaming with given input configuration. Valid input types: camera, screen, whip, browser, capture, website, rtmp, file, radio, lofi, composition. Requires operator approval.',
  similes: [
    'START_STREAM',
    'GO_LIVE',
    'BEGIN_STREAMING',
    'STREAM_START',
    'START_BROADCAST',
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

      const config = service.getConfig();
      const requireApprovals = config?.requireApprovals ?? true;

      // Extract parameters
      const input = (options?.input || {}) as StreamInput;
      const streamOptions = options?.options as StreamOptions | undefined;
      const sources = options?.sources as Source[] | undefined;
      const approvalId = options?._approvalId as string | undefined;

      // Default to lofi if no input type specified
      if (!input.type) {
        input.type = 'lofi';
      }

      // Build params for approval
      const params = {
        input,
        options: streamOptions,
        sources,
        _approvalId: approvalId,
      };

      // Execute with approval flow
      const result = await withApproval(
        'STREAM555_STREAM_START',
        params,
        requireApprovals,
        async () => {
          const startResult = await service.startStream(input, streamOptions, sources);
          return {
            success: true,
            data: startResult,
          };
        }
      );

      if (result.pending) {
        if (callback) {
          callback({
            text: formatApprovalPending(result),
            content: {
              success: false,
              data: {
                pending: true,
                approvalId: result.approvalId,
                expiresAt: result.expiresAt,
              },
            },
          });
        }
        return false;
      }

      if (result.error) {
        if (result.error.includes('rejected')) {
          if (callback) {
            callback({
              text: formatApprovalRejected(),
              content: { success: false, error: result.error },
            });
          }
        } else if (result.error.includes('expired')) {
          if (callback) {
            callback({
              text: formatApprovalExpired(),
              content: { success: false, error: result.error },
            });
          }
        } else {
          if (callback) {
            callback({
              text: `Failed to start stream: ${result.error}`,
              content: { success: false, error: result.error },
            });
          }
        }
        return false;
      }

      // Success
      const data = result.data as Record<string, unknown>;
      const response = formatStartResponse(data);

      if (callback) {
        callback({
          text: response,
          content: { success: true, data },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to start stream: ${errorMessage}`,
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
        content: { text: 'Start the stream' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll start the stream now.',
          action: 'STREAM555_STREAM_START',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Go live on Twitch' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Starting the broadcast.',
          action: 'STREAM555_STREAM_START',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Start lofi radio stream' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll start the lofi radio stream.',
          action: 'STREAM555_STREAM_START',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatStartResponse(data: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('**Stream Started**');
  lines.push('');

  if (data.jobId) {
    lines.push(`**Job ID:** \`${data.jobId}\``);
  }
  if (data.cfSessionId) {
    lines.push(`**Session ID:** \`${data.cfSessionId}\``);
  }
  if (data.inputType) {
    lines.push(`**Input Type:** ${data.inputType}`);
  }
  if (data.platforms && Array.isArray(data.platforms)) {
    lines.push(`**Platforms:** ${(data.platforms as string[]).join(', ')}`);
  }

  if (data.ingest) {
    const ingest = data.ingest as Record<string, { url: string }>;
    lines.push('');
    lines.push('**Ingest URLs:**');
    if (ingest.whip?.url) {
      lines.push(`- WHIP: ${ingest.whip.url}`);
    }
    if (ingest.rtmps?.url) {
      lines.push(`- RTMPS: ${ingest.rtmps.url}`);
    }
    if (ingest.srt?.url) {
      lines.push(`- SRT: ${ingest.srt.url}`);
    }
  }

  return lines.join('\n');
}

export default streamStartAction;
