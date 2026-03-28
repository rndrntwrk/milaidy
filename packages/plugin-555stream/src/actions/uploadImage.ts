/**
 * STREAM555_UPLOAD_IMAGE Action
 *
 * Upload an image file from URL.
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  UploadResult,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const uploadImageAction: Action = {
  name: 'STREAM555_UPLOAD_IMAGE',
  description: 'Upload an image to 555stream from a URL. Supported formats: jpg, png, gif, webp, svg.',
  similes: [
    'UPLOAD_IMAGE',
    'ADD_IMAGE',
    'IMPORT_IMAGE',
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const service = runtime.getService('stream555') as StreamControlService | undefined;
    return !!service;
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

      const imageUrl = options?.url as string | undefined;

      if (!imageUrl) {
        if (callback) {
          callback({
            text: 'No image URL provided. Specify the URL of the image to upload.',
            content: { success: false, error: 'No URL provided' },
          });
        }
        return false;
      }

      const result = await service.uploadImageFromUrl(imageUrl);

      if (callback) {
        callback({
          text: formatUploadResponse('Image', result),
          content: { success: true, data: result },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to upload image: ${errorMessage}`,
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
        content: { text: 'Upload this logo image' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Uploading the image.',
          action: 'STREAM555_UPLOAD_IMAGE',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatUploadResponse(type: string, result: UploadResult): string {
  const lines: string[] = [];

  lines.push(`**${type} Uploaded**`);
  lines.push('');
  lines.push(`**URL:** ${result.url}`);
  lines.push(`**Filename:** ${result.filename}`);
  lines.push(`**Original:** ${result.originalName}`);
  lines.push(`**Size:** ${(result.size / 1024).toFixed(1)} KB`);

  return lines.join('\n');
}

export default uploadImageAction;
