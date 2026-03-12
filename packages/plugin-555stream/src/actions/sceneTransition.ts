/**
 * STREAM555_SCENE_TRANSITION Action
 *
 * Trigger a scene transition with optional transition effect.
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

export interface TransitionConfig {
  type: 'cut' | 'fade' | 'slide' | 'wipe' | 'zoom' | 'blur' | 'stinger';
  duration?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  easing?: string;
  stingerUrl?: string;
}

export const sceneTransitionAction: Action = {
  name: 'STREAM555_SCENE_TRANSITION',
  description: 'Transition to a different scene with optional effects. Types: cut, fade, slide, wipe, zoom, blur, stinger.',
  similes: [
    'SWITCH_SCENE',
    'CHANGE_SCENE',
    'TRANSITION_TO',
    'GO_TO_SCENE',
    'SCENE_CHANGE',
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

      const targetSceneId = options?.sceneId as string;
      if (!targetSceneId) {
        if (callback) {
          callback({
            text: 'Scene ID is required for transition.',
            content: { success: false, error: 'Missing sceneId' },
          });
        }
        return false;
      }

      const transition: TransitionConfig = {
        type: (options?.transitionType as TransitionConfig['type']) || 'fade',
        duration: (options?.duration as number) || 500,
        direction: options?.direction as TransitionConfig['direction'],
        easing: options?.easing as string,
        stingerUrl: options?.stingerUrl as string,
      };

      const result = await service.transitionToScene(targetSceneId, transition);

      const response = formatTransitionResponse(targetSceneId, transition, result);

      if (callback) {
        callback({
          text: response,
          content: { success: true, data: { sceneId: targetSceneId, transition } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to transition scene: ${errorMessage}`,
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
        content: { text: 'Switch to the gaming scene' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Transitioning to gaming scene.',
          action: 'STREAM555_SCENE_TRANSITION',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Fade to the BRB scene' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Fading to BRB scene.',
          action: 'STREAM555_SCENE_TRANSITION',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Use the stinger transition to switch to ending scene' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Playing stinger transition to ending scene.',
          action: 'STREAM555_SCENE_TRANSITION',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatTransitionResponse(
  sceneId: string,
  transition: TransitionConfig,
  result: { previousScene?: string; currentScene: string }
): string {
  const lines: string[] = [];

  lines.push('**Scene Transition Complete**');
  lines.push('');
  if (result.previousScene) {
    lines.push(`**From:** ${result.previousScene}`);
  }
  lines.push(`**To:** ${result.currentScene}`);
  lines.push(`**Transition:** ${transition.type}`);
  if (transition.duration) {
    lines.push(`**Duration:** ${transition.duration}ms`);
  }
  if (transition.direction) {
    lines.push(`**Direction:** ${transition.direction}`);
  }

  return lines.join('\n');
}

export default sceneTransitionAction;
