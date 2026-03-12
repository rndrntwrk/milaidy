/**
 * STREAM555_ALERT_CONTROL Action
 *
 * Control the alert queue: skip, pause, resume, or clear.
 * Does not require approval for skip/pause/resume. Clear requires approval.
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
import { withApproval } from '../lib/approvalHelper.js';

type AlertControlAction = 'skip' | 'pause' | 'resume' | 'clear';

export const alertControlAction: Action = {
  name: 'STREAM555_ALERT_CONTROL',
  description: 'Control the alert queue. Actions: skip (skip current alert), pause, resume, clear (requires approval).',
  similes: [
    'SKIP_ALERT',
    'PAUSE_ALERTS',
    'RESUME_ALERTS',
    'CLEAR_ALERTS',
    'STOP_ALERT',
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

      const action = (options?.action as AlertControlAction) || 'skip';

      // Clear requires approval
      if (action === 'clear') {
        const config = service.getConfig();
        const requireApprovals = config?.requireApprovals ?? true;
        const params = { action, _approvalId: options?._approvalId };

        const result = await withApproval(
          'STREAM555_ALERT_CONTROL',
          params,
          requireApprovals,
          async () => {
            await service.controlAlerts('clear');
            return { success: true, data: { action: 'clear' } };
          }
        );

        if (result.pending) {
          if (callback) {
            callback({
              text: `**Approval Required**\n\nClearing all alerts requires approval.\n\n**Approval ID:** \`${result.approvalId}\``,
              content: { success: false, data: { pending: true, approvalId: result.approvalId } },
            });
          }
          return false;
        }

        if (result.error) {
          if (callback) {
            callback({
              text: `Failed to clear alerts: ${result.error}`,
              content: { success: false, error: result.error },
            });
          }
          return false;
        }

        if (callback) {
          callback({
            text: '**Alert Queue Cleared**\n\nAll pending alerts have been removed.',
            content: { success: true, data: { action: 'clear' } },
          });
        }
        return true;
      }

      // Skip, pause, resume don't require approval
      await service.controlAlerts(action);

      const messages: Record<AlertControlAction, string> = {
        skip: '**Alert Skipped**\n\nCurrent alert has been skipped.',
        pause: '**Alerts Paused**\n\nAlert queue is now paused.',
        resume: '**Alerts Resumed**\n\nAlert queue is now playing.',
        clear: '**Alert Queue Cleared**',
      };

      if (callback) {
        callback({
          text: messages[action],
          content: { success: true, data: { action } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to control alerts: ${errorMessage}`,
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
        content: { text: 'Skip this alert' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Skipping current alert.',
          action: 'STREAM555_ALERT_CONTROL',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Pause the alerts for a moment' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Pausing alert queue.',
          action: 'STREAM555_ALERT_CONTROL',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Resume showing alerts' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Resuming alerts.',
          action: 'STREAM555_ALERT_CONTROL',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Clear all pending alerts' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Clearing alert queue (requires approval).',
          action: 'STREAM555_ALERT_CONTROL',
        },
      },
    ],
  ] as ActionExample[][],
};

export default alertControlAction;
