/**
 * STREAM555_RADIO_CONFIG Action
 *
 * Configure radio settings.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  RadioConfig,
  RadioState,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const radioConfigAction: Action = {
  name: 'STREAM555_RADIO_CONFIG',
  description: 'Configure lofi radio settings including autoDJ mode, active tracks, effects, volumes, and background.',
  similes: [
    'CONFIGURE_RADIO',
    'SET_RADIO',
    'UPDATE_RADIO',
    'RADIO_SETTINGS',
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

      const config: RadioConfig = {
        autoDJMode: options?.autoDJMode as string | undefined,
        activeTracks: options?.activeTracks as string[] | undefined,
        activeEffects: options?.activeEffects as string[] | undefined,
        volumes: options?.volumes as Record<string, number> | undefined,
        hlsBg: options?.hlsBg as string | undefined,
      };

      // Remove undefined values
      Object.keys(config).forEach(key => {
        if (config[key as keyof RadioConfig] === undefined) {
          delete config[key as keyof RadioConfig];
        }
      });

      if (Object.keys(config).length === 0) {
        if (callback) {
          callback({
            text: 'No radio configuration provided.',
            content: { success: false, error: 'No config provided' },
          });
        }
        return false;
      }

      const state = await service.setRadioConfig(config);

      if (callback) {
        callback({
          text: formatRadioResponse(state),
          content: { success: true, data: state },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to configure radio: ${errorMessage}`,
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
        content: { text: 'Set radio to music mode' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Setting radio to music mode.',
          action: 'STREAM555_RADIO_CONFIG',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Configure the lofi radio tracks' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Configuring radio tracks.',
          action: 'STREAM555_RADIO_CONFIG',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatRadioResponse(state: RadioState): string {
  const lines: string[] = [];

  lines.push('**Radio Configured**');
  lines.push('');
  lines.push(`**Mode:** ${state.autoDJMode}`);
  if (state.activeTracks.length > 0) {
    lines.push(`**Active Tracks:** ${state.activeTracks.join(', ')}`);
  }
  if (state.activeEffects.length > 0) {
    lines.push(`**Effects:** ${state.activeEffects.join(', ')}`);
  }
  if (state.hlsBg) {
    lines.push(`**Background:** ${state.hlsBg}`);
  }

  return lines.join('\n');
}

export default radioConfigAction;
