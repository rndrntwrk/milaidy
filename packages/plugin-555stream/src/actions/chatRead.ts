/**
 * STREAM555_CHAT_READ Action
 *
 * Read recent chat messages from the stream.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  ChatMessage,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const chatReadAction: Action = {
  name: 'STREAM555_CHAT_READ',
  description: 'Read recent chat messages from the stream. Optionally filter by platform (twitch, kick, pump) and limit the number of messages.',
  similes: [
    'READ_CHAT',
    'GET_CHAT',
    'CHECK_CHAT',
    'VIEW_CHAT_MESSAGES',
    'SEE_CHAT',
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

      const limit = (options?.limit as number) || 20;
      const platform = options?.platform as string | undefined;

      const result = await service.getChatMessages({ limit, platform });

      if (callback) {
        callback({
          text: formatChatMessages(result.messages as ChatMessage[], result.count),
          content: { success: true, data: result },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to read chat: ${errorMessage}`,
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
        content: { text: 'Read the chat messages' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Reading recent chat messages.',
          action: 'STREAM555_CHAT_READ',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'What are people saying in Twitch chat?' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Let me check the Twitch chat.',
          action: 'STREAM555_CHAT_READ',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Show me the last 10 chat messages' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Fetching the last 10 messages.',
          action: 'STREAM555_CHAT_READ',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatChatMessages(messages: ChatMessage[], count: number): string {
  if (count === 0) {
    return 'No chat messages found.';
  }

  const lines: string[] = [`**Recent Chat** (${count} messages)\n`];

  for (const msg of messages.slice(0, 20)) {
    const platform = msg.platform ? `[${msg.platform}]` : '';
    const user = msg.user?.displayName || msg.user?.username || 'Unknown';
    const text = msg.content?.text || '';
    lines.push(`${platform} **${user}**: ${text}`);
  }

  return lines.join('\n');
}

export default chatReadAction;
