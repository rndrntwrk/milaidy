/**
 * Ad Break Actions
 *
 * Actions for AI agent to control ad breaks (squeeze-back overlays)
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

/**
 * STREAM555_AD_BREAK_TRIGGER - Trigger an ad break
 */
export const adBreakTriggerAction: Action = {
  name: 'STREAM555_AD_BREAK_TRIGGER',
  description: 'Trigger an ad break with squeeze-back layout. The main scene will scale down to make room for advertisement panels.',
  similes: [
    'TRIGGER_AD',
    'START_AD_BREAK',
    'SHOW_SPONSOR',
    'RUN_COMMERCIAL',
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

      const adId = options?.adId as string;
      const duration = options?.duration as number | undefined;

      if (!adId) {
        if (callback) {
          callback({
            text: 'Ad ID is required to trigger an ad break.',
            content: { success: false, error: 'Ad ID required' },
          });
        }
        return false;
      }

      // Call the API to trigger the ad break
      const response = await service.triggerAdBreak(adId, { duration });

      if (callback) {
        callback({
          text: `Ad break started. Layout: ${response.layout}, Duration: ${Math.round(response.duration / 1000)}s`,
          content: { success: true, data: response },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to trigger ad break: ${errorMessage}`,
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
        content: { text: 'Run the sponsor ad' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Triggering the sponsor ad break.',
          action: 'STREAM555_AD_BREAK_TRIGGER',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Start a commercial break' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Starting commercial break with squeeze-back layout.',
          action: 'STREAM555_AD_BREAK_TRIGGER',
        },
      },
    ],
  ] as ActionExample[][],
};

/**
 * STREAM555_AD_BREAK_DISMISS - End the current ad break early
 */
export const adBreakDismissAction: Action = {
  name: 'STREAM555_AD_BREAK_DISMISS',
  description: 'End the current ad break early. The main scene will return to full size.',
  similes: [
    'END_AD',
    'STOP_AD_BREAK',
    'DISMISS_AD',
    'CLOSE_COMMERCIAL',
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

      // Call the API to dismiss the ad break
      const response = await service.dismissAdBreak();

      if (callback) {
        callback({
          text: response.dismissed
            ? 'Ad break ended. Main scene restored to full size.'
            : 'No active ad break to dismiss.',
          content: { success: true, data: response },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to dismiss ad break: ${errorMessage}`,
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
        content: { text: 'End the ad break' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Ending the ad break.',
          action: 'STREAM555_AD_BREAK_DISMISS',
        },
      },
    ],
  ] as ActionExample[][],
};

/**
 * STREAM555_AD_BREAK_SCHEDULE - Schedule an ad break for a specific time
 */
export const adBreakScheduleAction: Action = {
  name: 'STREAM555_AD_BREAK_SCHEDULE',
  description: 'Schedule an ad break to start at a specific time.',
  similes: [
    'SCHEDULE_AD',
    'PLAN_AD_BREAK',
    'SET_AD_TIME',
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

      const adId = options?.adId as string;
      const startTime = options?.startTime as string;

      if (!adId || !startTime) {
        if (callback) {
          callback({
            text: 'Both adId and startTime are required to schedule an ad break.',
            content: { success: false, error: 'adId and startTime required' },
          });
        }
        return false;
      }

      // Call the API to schedule the ad break
      const response = await service.scheduleAdBreak(adId, startTime);

      if (callback) {
        callback({
          text: `Ad break scheduled for ${new Date(startTime).toLocaleString()}.`,
          content: { success: true, data: response },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to schedule ad break: ${errorMessage}`,
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
        content: { text: 'Schedule the sponsor ad for 3pm' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Scheduling the sponsor ad break for 3pm.',
          action: 'STREAM555_AD_BREAK_SCHEDULE',
        },
      },
    ],
  ] as ActionExample[][],
};

/**
 * STREAM555_AD_LIST - List available ads
 */
export const adListAction: Action = {
  name: 'STREAM555_AD_LIST',
  description: 'List all available ad configurations for the current session.',
  similes: [
    'LIST_ADS',
    'SHOW_ADS',
    'GET_ADS',
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

      // Call the API to list ads
      const ads = await service.listAds();

      const formatAdList = (ads: any[]) => {
        if (ads.length === 0) {
          return 'No ad configurations found. Create one using the Ad Break editor.';
        }

        const lines = ['**Available Ad Configurations:**\n'];
        ads.forEach((ad, i) => {
          lines.push(`${i + 1}. **${ad.name}** (ID: \`${ad.id}\`)`);
          lines.push(`   Layout: ${ad.layout}, Duration: ${Math.round(ad.duration / 1000)}s`);
          if (ad.sponsorName) {
            lines.push(`   Sponsor: ${ad.sponsorName}`);
          }
        });
        return lines.join('\n');
      };

      if (callback) {
        callback({
          text: formatAdList(ads),
          content: { success: true, data: { ads } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to list ads: ${errorMessage}`,
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
        content: { text: 'What ads do we have?' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Listing available ad configurations.',
          action: 'STREAM555_AD_LIST',
        },
      },
    ],
  ] as ActionExample[][],
};

export default {
  adBreakTriggerAction,
  adBreakDismissAction,
  adBreakScheduleAction,
  adListAction,
};
