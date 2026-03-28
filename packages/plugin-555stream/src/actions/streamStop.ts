/**
 * STREAM555_STREAM_STOP Action
 *
 * Stop the current stream.
 * Requires operator approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';
import {
  withApproval,
  formatApprovalPending,
  formatApprovalRejected,
  formatApprovalExpired,
} from '../lib/approvalHelper.js';

export const streamStopAction: Action = {
  name: 'STREAM555_STREAM_STOP',
  description: 'Stop the current stream. This will end the broadcast on all platforms. Requires operator approval.',
  similes: [
    'STOP_STREAM',
    'END_STREAM',
    'GO_OFFLINE',
    'STOP_BROADCAST',
    'END_BROADCAST',
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

      const approvalId = options?._approvalId as string | undefined;

      const params = {
        _approvalId: approvalId,
      };

      // Execute with approval flow
      const result = await withApproval(
        'STREAM555_STREAM_STOP',
        params,
        requireApprovals,
        async () => {
          const stopResult = await service.stopStream();
          return {
            success: true,
            data: stopResult,
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
              text: `Failed to stop stream: ${result.error}`,
              content: { success: false, error: result.error },
            });
          }
        }
        return false;
      }

      // Success
      const data = result.data as { stopped: boolean; wasActive: boolean; previousJobId?: string };
      const response = formatStopResponse(data);

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
          text: `Failed to stop stream: ${errorMessage}`,
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
        content: { text: 'Stop the stream' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll stop the stream now.',
          action: 'STREAM555_STREAM_STOP',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'End the broadcast' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Ending the broadcast.',
          action: 'STREAM555_STREAM_STOP',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Go offline' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Taking the stream offline.',
          action: 'STREAM555_STREAM_STOP',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatStopResponse(data: { stopped: boolean; wasActive: boolean; previousJobId?: string }): string {
  const lines: string[] = [];

  lines.push('**Stream Stopped**');
  lines.push('');

  if (data.wasActive) {
    lines.push('The stream has been stopped and all platforms disconnected.');
  } else {
    lines.push('No active stream was running.');
  }

  if (data.previousJobId) {
    lines.push(`**Previous Job ID:** \`${data.previousJobId}\``);
  }

  return lines.join('\n');
}

export default streamStopAction;
