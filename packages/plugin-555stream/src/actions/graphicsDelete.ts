/**
 * STREAM555_GRAPHICS_DELETE Action
 *
 * Delete a graphic.
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

export const graphicsDeleteAction: Action = {
  name: 'STREAM555_GRAPHICS_DELETE',
  description: 'Delete a graphic from the stream. This action is permanent. Requires operator approval.',
  similes: [
    'DELETE_GRAPHIC',
    'REMOVE_GRAPHIC',
    'REMOVE_OVERLAY',
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

      const graphicId = options?.graphicId as string | undefined;
      const approvalId = options?._approvalId as string | undefined;

      if (!graphicId) {
        if (callback) {
          callback({
            text: 'No graphic ID provided. Specify which graphic to delete.',
            content: { success: false, error: 'No graphicId provided' },
          });
        }
        return false;
      }

      const params = {
        graphicId,
        _approvalId: approvalId,
      };

      // Execute with approval flow
      const result = await withApproval(
        'STREAM555_GRAPHICS_DELETE',
        params,
        requireApprovals,
        async () => {
          await service.deleteGraphic(graphicId);
          return { success: true, data: { deleted: true, graphicId } };
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
              text: `Failed to delete graphic: ${result.error}`,
              content: { success: false, error: result.error },
            });
          }
        }
        return false;
      }

      if (callback) {
        callback({
          text: `**Graphic Deleted**\n\n**ID:** \`${graphicId}\``,
          content: { success: true, data: { deleted: true, graphicId } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to delete graphic: ${errorMessage}`,
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
        content: { text: 'Delete the title graphic' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll delete that graphic.',
          action: 'STREAM555_GRAPHICS_DELETE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Remove the overlay' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Removing the overlay.',
          action: 'STREAM555_GRAPHICS_DELETE',
        },
      },
    ],
  ] as ActionExample[][],
};

export default graphicsDeleteAction;
