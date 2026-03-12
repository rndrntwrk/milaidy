/**
 * STREAM555_RADIO_CONTROL Action
 *
 * Send live control commands to the radio.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  RadioState,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

type RadioAction = 'toggleTrack' | 'toggleEffect' | 'setAutoDJMode' | 'setVolume' | 'setBackground';

export const radioControlAction: Action = {
  name: 'STREAM555_RADIO_CONTROL',
  description: 'Send live control commands to the radio. Actions: toggleTrack, toggleEffect, setAutoDJMode, setVolume, setBackground.',
  similes: [
    'CONTROL_RADIO',
    'RADIO_COMMAND',
    'TOGGLE_TRACK',
    'SET_VOLUME',
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

      const action = options?.action as RadioAction | undefined;
      const payload = (options?.payload || {}) as Record<string, unknown>;

      if (!action) {
        if (callback) {
          callback({
            text: 'No action provided. Valid: toggleTrack, toggleEffect, setAutoDJMode, setVolume, setBackground.',
            content: { success: false, error: 'No action provided' },
          });
        }
        return false;
      }

      const validActions: RadioAction[] = ['toggleTrack', 'toggleEffect', 'setAutoDJMode', 'setVolume', 'setBackground'];
      if (!validActions.includes(action)) {
        if (callback) {
          callback({
            text: `Invalid action: ${action}. Valid: ${validActions.join(', ')}`,
            content: { success: false, error: 'Invalid action' },
          });
        }
        return false;
      }

      const state = await service.controlRadio(action, payload);

      if (callback) {
        callback({
          text: formatControlResponse(action, state),
          content: { success: true, data: state },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to control radio: ${errorMessage}`,
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
        content: { text: 'Toggle the lofi track' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Toggling the track.',
          action: 'STREAM555_RADIO_CONTROL',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Turn on the rain sound effect' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Enabling rain sound effect.',
          action: 'STREAM555_RADIO_CONTROL',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Set the volume to 80%' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Setting the volume.',
          action: 'STREAM555_RADIO_CONTROL',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatControlResponse(action: string, state: RadioState): string {
  const lines: string[] = [];

  const actionLabels: Record<string, string> = {
    toggleTrack: 'Track Toggled',
    toggleEffect: 'Effect Toggled',
    setAutoDJMode: 'Mode Changed',
    setVolume: 'Volume Set',
    setBackground: 'Background Changed',
  };

  lines.push(`**${actionLabels[action] || 'Radio Updated'}**`);
  lines.push('');
  lines.push(`**Mode:** ${state.autoDJMode}`);
  if (state.activeTracks.length > 0) {
    lines.push(`**Active Tracks:** ${state.activeTracks.join(', ')}`);
  }
  if (state.activeEffects.length > 0) {
    lines.push(`**Effects:** ${state.activeEffects.join(', ')}`);
  }

  return lines.join('\n');
}

export default radioControlAction;
