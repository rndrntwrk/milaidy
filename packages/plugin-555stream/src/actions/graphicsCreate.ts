/**
 * STREAM555_GRAPHICS_CREATE Action
 *
 * Create a new graphic (text, image, or overlay).
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

export const graphicsCreateAction: Action = {
  name: 'STREAM555_GRAPHICS_CREATE',
  description: 'Create a new graphic overlay. Types: text (for titles/captions), image (for logos/images), overlay (for custom overlays).',
  similes: [
    'ADD_GRAPHIC',
    'CREATE_OVERLAY',
    'ADD_TEXT',
    'ADD_IMAGE',
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

      const graphicType = (options?.type as GraphicConfig['type']) || 'text';
      const content = options?.content as string | undefined;
      const position = options?.position as { x: number; y: number } | undefined;
      const visible = options?.visible !== false;

      const graphicConfig: GraphicConfig = {
        type: graphicType,
        content,
        position,
        visible,
      };

      const graphic = await service.createGraphic(graphicConfig);

      const response = formatCreateResponse(graphic);

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
          text: `Failed to create graphic: ${errorMessage}`,
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
        content: { text: 'Add a title that says "Welcome to the stream"' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Creating a title graphic.',
          action: 'STREAM555_GRAPHICS_CREATE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Add an image overlay' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Adding an image overlay.',
          action: 'STREAM555_GRAPHICS_CREATE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Create a lower third' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Creating a lower third graphic.',
          action: 'STREAM555_GRAPHICS_CREATE',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatCreateResponse(graphic: Graphic): string {
  const lines: string[] = [];

  lines.push('**Graphic Created**');
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

export default graphicsCreateAction;
