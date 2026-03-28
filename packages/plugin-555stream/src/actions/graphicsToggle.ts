/**
 * STREAM555_GRAPHICS_TOGGLE Action
 *
 * Toggle graphic visibility.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  Graphic,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const graphicsToggleAction: Action = {
  name: 'STREAM555_GRAPHICS_TOGGLE',
  description: 'Toggle graphic visibility on/off. If visible is not specified, it toggles the current state.',
  similes: [
    'TOGGLE_GRAPHIC',
    'SHOW_GRAPHIC',
    'HIDE_GRAPHIC',
    'TOGGLE_OVERLAY',
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

      const graphicId = options?.graphicId as string | undefined;
      let visible = options?.visible as boolean | undefined;

      if (!graphicId) {
        if (callback) {
          callback({
            text: 'No graphic ID provided. Specify which graphic to toggle.',
            content: { success: false, error: 'No graphicId provided' },
          });
        }
        return false;
      }

      // If visible not specified, get current state and toggle
      if (visible === undefined) {
        const graphics = await service.getGraphics();
        const graphic = graphics.find(g => g.id === graphicId);
        if (graphic) {
          visible = !graphic.visible;
        } else {
          if (callback) {
            callback({
              text: `Graphic not found: ${graphicId}`,
              content: { success: false, error: 'Graphic not found' },
            });
          }
          return false;
        }
      }

      const graphic = await service.updateGraphic(graphicId, { visible });

      if (callback) {
        callback({
          text: `**Graphic ${visible ? 'Shown' : 'Hidden'}**\n\n**ID:** \`${graphicId}\`\n**Visible:** ${visible ? 'Yes' : 'No'}`,
          content: { success: true, data: { graphic } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to toggle graphic: ${errorMessage}`,
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
        content: { text: 'Show the title' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Showing the title graphic.',
          action: 'STREAM555_GRAPHICS_TOGGLE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hide the overlay' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Hiding the overlay.',
          action: 'STREAM555_GRAPHICS_TOGGLE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Toggle the lower third' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Toggling the lower third visibility.',
          action: 'STREAM555_GRAPHICS_TOGGLE',
        },
      },
    ],
  ] as ActionExample[][],
};

export default graphicsToggleAction;
