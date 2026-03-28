/**
 * STREAM555_OVERLAY_SUGGEST Action
 *
 * AI-driven overlay suggestions based on stream context.
 * Analyzes current stream state and suggests appropriate overlays.
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

export interface OverlaySuggestion {
  templateId: string;
  templateName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

export const overlaySuggestAction: Action = {
  name: 'STREAM555_OVERLAY_SUGGEST',
  description: 'Get AI-driven overlay suggestions based on stream context, content type, or specific needs.',
  similes: [
    'SUGGEST_OVERLAYS',
    'RECOMMEND_GRAPHICS',
    'WHAT_OVERLAYS',
    'OVERLAY_IDEAS',
    'HELP_WITH_OVERLAYS',
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

      // Context for suggestions
      const context = {
        contentType: options?.contentType as string | undefined, // gaming, podcast, tutorial, irl, music
        mood: options?.mood as string | undefined, // energetic, chill, professional, fun
        currentScene: options?.currentScene as string | undefined,
        query: (message.content?.text as string) || options?.query as string | undefined,
      };

      const suggestions = await service.getOverlaySuggestions(context);

      const response = formatSuggestions(suggestions, context);

      if (callback) {
        callback({
          text: response,
          content: { success: true, data: { suggestions, context } },
        });
      }

      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `Failed to get suggestions: ${errorMessage}`,
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
        content: { text: 'What overlays should I use for a gaming stream?' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Analyzing stream context for overlay suggestions.',
          action: 'STREAM555_OVERLAY_SUGGEST',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Suggest some overlays for my podcast' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Getting podcast overlay recommendations.',
          action: 'STREAM555_OVERLAY_SUGGEST',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'I need help making my stream look more professional' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Suggesting professional overlays.',
          action: 'STREAM555_OVERLAY_SUGGEST',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatSuggestions(
  suggestions: OverlaySuggestion[],
  context: { contentType?: string; mood?: string }
): string {
  const lines: string[] = [];

  lines.push('**Overlay Suggestions**');
  lines.push('');

  if (context.contentType || context.mood) {
    const contextParts: string[] = [];
    if (context.contentType) contextParts.push(`Content: ${context.contentType}`);
    if (context.mood) contextParts.push(`Mood: ${context.mood}`);
    lines.push(`*Based on: ${contextParts.join(', ')}*`);
    lines.push('');
  }

  // Group by priority
  const highPriority = suggestions.filter(s => s.priority === 'high');
  const mediumPriority = suggestions.filter(s => s.priority === 'medium');
  const lowPriority = suggestions.filter(s => s.priority === 'low');

  if (highPriority.length > 0) {
    lines.push('**Recommended:**');
    for (const s of highPriority) {
      lines.push(`  - **${s.templateName}** (\`${s.templateId}\`)`);
      lines.push(`    ${s.reason}`);
    }
    lines.push('');
  }

  if (mediumPriority.length > 0) {
    lines.push('**Also Consider:**');
    for (const s of mediumPriority) {
      lines.push(`  - ${s.templateName} (\`${s.templateId}\`) - ${s.reason}`);
    }
    lines.push('');
  }

  if (lowPriority.length > 0) {
    lines.push('**Optional:**');
    for (const s of lowPriority) {
      lines.push(`  - ${s.templateName} (\`${s.templateId}\`)`);
    }
    lines.push('');
  }

  if (suggestions.length === 0) {
    lines.push('No specific suggestions available. Try providing more context about your stream.');
  } else {
    lines.push('---');
    lines.push('Use `STREAM555_TEMPLATE_APPLY` with a template ID to add an overlay.');
  }

  return lines.join('\n');
}

export default overlaySuggestAction;
