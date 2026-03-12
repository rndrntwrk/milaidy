/**
 * STREAM555_GRAPHICS_UPDATE Action
 *
 * Update an existing graphic.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  GraphicConfig,
  Graphic,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const graphicsUpdateAction: Action = {
  name: 'STREAM555_GRAPHICS_UPDATE',
  description: 'Update an existing graphic. Can modify content, position, visibility, or type.',
  similes: [
    'UPDATE_GRAPHIC',
    'MODIFY_GRAPHIC',
    'EDIT_GRAPHIC',
    'CHANGE_GRAPHIC',
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

      if (!graphicId) {
        if (callback) {
          callback({
            text: 'No graphic ID provided. Specify which graphic to update.',
            content: { success: false, error: 'No graphicId provided' },
          });
        }
        return false;
      }

      // Build updates object
      const updates: Partial<GraphicConfig> = {};
      if (options?.content !== undefined) updates.content = options.content as string;
      if (options?.position !== undefined) updates.position = options.position as { x: number; y: number };
      if (options?.visible !== undefined) updates.visible = options.visible as boolean;
      if (options?.type !== undefined) updates.type = options.type as GraphicConfig['type'];

      if (Object.keys(updates).length === 0) {
        if (callback) {
          callback({
            text: 'No updates provided. Specify what to change.',
            content: { success: false, error: 'No updates provided' },
          });
        }
        return false;
      }

      const graphic = await service.updateGraphic(graphicId, updates);

      const response = formatUpdateResponse(graphic);

      if (callback) {
        callback({
          text: response,
          content: { success: true, data: { graphic } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to update graphic: ${errorMessage}`,
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
        content: { text: 'Change the title text' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Updating the title text.',
          action: 'STREAM555_GRAPHICS_UPDATE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Move the graphic to the bottom' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Moving the graphic.',
          action: 'STREAM555_GRAPHICS_UPDATE',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatUpdateResponse(graphic: Graphic): string {
  const lines: string[] = [];

  lines.push('**Graphic Updated**');
  lines.push('');
  lines.push(`**ID:** \`${graphic.id}\``);
  lines.push(`**Type:** ${graphic.type}`);
  if (graphic.content) {
    lines.push(`**Content:** ${graphic.content}`);
  }
  lines.push(`**Visible:** ${graphic.visible ? 'Yes' : 'No'}`);
  if (graphic.position) {
    lines.push(`**Position:** (${graphic.position.x}, ${graphic.position.y})`);
  }

  return lines.join('\n');
}

export default graphicsUpdateAction;
