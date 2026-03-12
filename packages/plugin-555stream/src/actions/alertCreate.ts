/**
 * STREAM555_ALERT_CREATE Action
 *
 * Create and queue a new alert (follow, subscribe, donation, raid, custom).
 * Does not require approval.
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

export interface AlertConfig {
  eventType: 'follow' | 'subscribe' | 'donation' | 'raid' | 'bits' | 'custom';
  message: string;
  username?: string;
  amount?: string;
  image?: string;
  sound?: { src: string; volume: number };
  duration?: number;
  priority?: number;
  variant?: 'popup' | 'banner' | 'corner' | 'fullscreen';
}

export interface Alert {
  id: string;
  eventType: string;
  message: string;
  username?: string;
  amount?: string;
  status: string;
  createdAt: string;
}

export const alertCreateAction: Action = {
  name: 'STREAM555_ALERT_CREATE',
  description: 'Create and queue a stream alert. Types: follow, subscribe, donation, raid, bits, custom.',
  similes: [
    'ADD_ALERT',
    'QUEUE_ALERT',
    'SHOW_ALERT',
    'TRIGGER_ALERT',
    'CREATE_NOTIFICATION',
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

      const alertConfig: AlertConfig = {
        eventType: (options?.eventType as AlertConfig['eventType']) || 'custom',
        message: (options?.message as string) || 'New alert!',
        username: options?.username as string | undefined,
        amount: options?.amount as string | undefined,
        image: options?.image as string | undefined,
        duration: (options?.duration as number) || 5000,
        priority: (options?.priority as number) || 0,
        variant: (options?.variant as AlertConfig['variant']) || 'popup',
      };

      const alert = await service.createAlert(alertConfig);

      const response = formatAlertResponse(alert);

      if (callback) {
        callback({
          text: response,
          content: { success: true, data: { alert } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to create alert: ${errorMessage}`,
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
        content: { text: 'Show a new follower alert for CoolViewer123' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Creating a follow alert.',
          action: 'STREAM555_ALERT_CREATE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Trigger a $50 donation alert from BigDonor' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Queuing donation alert.',
          action: 'STREAM555_ALERT_CREATE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Show a raid alert - 500 viewers incoming!' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Creating raid alert.',
          action: 'STREAM555_ALERT_CREATE',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatAlertResponse(alert: Alert): string {
  const lines: string[] = [];

  lines.push('**Alert Created**');
  lines.push('');
  lines.push(`**ID:** \`${alert.id}\``);
  lines.push(`**Type:** ${alert.eventType}`);
  lines.push(`**Message:** ${alert.message}`);
  if (alert.username) {
    lines.push(`**Username:** ${alert.username}`);
  }
  if (alert.amount) {
    lines.push(`**Amount:** ${alert.amount}`);
  }
  lines.push(`**Status:** ${alert.status}`);

  return lines.join('\n');
}

export default alertCreateAction;
