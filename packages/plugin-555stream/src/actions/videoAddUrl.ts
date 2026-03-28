/**
 * STREAM555_VIDEO_ADD_URL Action
 *
 * Create a video asset from a URL (HLS or direct).
 * Does not require approval.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  VideoAsset,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';

export const videoAddUrlAction: Action = {
  name: 'STREAM555_VIDEO_ADD_URL',
  description: 'Create a video asset from a URL. Works with HLS (.m3u8) streams and direct video URLs.',
  similes: [
    'ADD_VIDEO_URL',
    'IMPORT_HLS',
    'ADD_STREAM_URL',
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

      const url = options?.url as string | undefined;
      const name = options?.name as string | undefined;

      if (!url) {
        if (callback) {
          callback({
            text: 'No URL provided. Specify the URL of the video or HLS stream.',
            content: { success: false, error: 'No URL provided' },
          });
        }
        return false;
      }

      const asset = await service.addVideoUrl(url, name);

      if (callback) {
        callback({
          text: formatAssetResponse(asset),
          content: { success: true, data: asset },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to add video URL: ${errorMessage}`,
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
        content: { text: 'Add this HLS stream URL' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Adding the video URL.',
          action: 'STREAM555_VIDEO_ADD_URL',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Import this video stream' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Importing the video stream.',
          action: 'STREAM555_VIDEO_ADD_URL',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatAssetResponse(asset: VideoAsset): string {
  const lines: string[] = [];

  lines.push('**Video Asset Created**');
  lines.push('');
  lines.push(`**ID:** \`${asset.id}\``);
  lines.push(`**Filename:** ${asset.filename}`);
  lines.push(`**Status:** ${asset.status}`);
  lines.push(`**Type:** ${asset.isHls ? 'HLS Stream' : 'Direct Video'}`);
  lines.push(`**Proxy URL:** ${asset.proxyUrl}`);

  return lines.join('\n');
}

export default videoAddUrlAction;
