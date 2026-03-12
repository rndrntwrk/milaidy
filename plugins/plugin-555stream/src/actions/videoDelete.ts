/**
 * STREAM555_VIDEO_DELETE Action
 *
 * Delete a video asset.
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

export const videoDeleteAction: Action = {
  name: 'STREAM555_VIDEO_DELETE',
  description: 'Delete a video asset. This is permanent. Requires operator approval.',
  similes: [
    'DELETE_VIDEO',
    'REMOVE_VIDEO',
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const service = runtime.getService('stream555') as StreamControlService | undefined;
    return !!service;
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

      const videoId = options?.videoId as string | undefined;
      const approvalId = options?._approvalId as string | undefined;

      if (!videoId) {
        if (callback) {
          callback({
            text: 'No video ID provided. Specify which video to delete.',
            content: { success: false, error: 'No videoId provided' },
          });
        }
        return false;
      }

      const params = {
        videoId,
        _approvalId: approvalId,
      };

      // Execute with approval flow
      const result = await withApproval(
        'STREAM555_VIDEO_DELETE',
        params,
        requireApprovals,
        async () => {
          await service.deleteVideo(videoId);
          return { success: true, data: { deleted: true, videoId } };
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
              text: `Failed to delete video: ${result.error}`,
              content: { success: false, error: result.error },
            });
          }
        }
        return false;
      }

      if (callback) {
        callback({
          text: `**Video Deleted**\n\n**ID:** \`${videoId}\``,
          content: { success: true, data: { deleted: true, videoId } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to delete video: ${errorMessage}`,
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
        content: { text: 'Delete the video' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll delete that video.',
          action: 'STREAM555_VIDEO_DELETE',
        },
      },
    ],
  ] as ActionExample[][],
};

export default videoDeleteAction;
