/**
 * STREAM555_GUEST_INVITE Action
 *
 * Create a guest invite.
 * Requires operator approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  GuestInvite,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';
import {
  withApproval,
  formatApprovalPending,
  formatApprovalRejected,
  formatApprovalExpired,
} from '../lib/approvalHelper.js';

export const guestInviteAction: Action = {
  name: 'STREAM555_GUEST_INVITE',
  description: 'Create a guest invite link for someone to join the stream. Requires operator approval.',
  similes: [
    'INVITE_GUEST',
    'CREATE_INVITE',
    'ADD_GUEST',
    'GENERATE_INVITE',
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

      const label = options?.label as string | undefined;
      const approvalId = options?._approvalId as string | undefined;

      const params = {
        label,
        _approvalId: approvalId,
      };

      // Execute with approval flow
      const result = await withApproval(
        'STREAM555_GUEST_INVITE',
        params,
        requireApprovals,
        async () => {
          const invite = await service.createGuestInvite(label);
          return { success: true, data: invite };
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
              text: `Failed to create invite: ${result.error}`,
              content: { success: false, error: result.error },
            });
          }
        }
        return false;
      }

      const invite = result.data as GuestInvite;

      if (callback) {
        callback({
          text: formatInviteResponse(invite),
          content: { success: true, data: { invite } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to create invite: ${errorMessage}`,
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
        content: { text: 'Create a guest invite' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll create a guest invite link.',
          action: 'STREAM555_GUEST_INVITE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Invite a guest to the stream' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Creating an invite link for a guest.',
          action: 'STREAM555_GUEST_INVITE',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatInviteResponse(invite: GuestInvite): string {
  const lines: string[] = [];

  lines.push('**Guest Invite Created**');
  lines.push('');
  lines.push(`**Invite ID:** \`${invite.inviteId}\``);
  if (invite.label) {
    lines.push(`**Label:** ${invite.label}`);
  }
  lines.push(`**Invite URL:** ${invite.inviteUrl}`);
  lines.push('');
  lines.push('Share this link with the guest to let them join the stream.');

  return lines.join('\n');
}

export default guestInviteAction;
