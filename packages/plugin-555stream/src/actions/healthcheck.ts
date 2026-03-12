/**
 * STREAM555_HEALTHCHECK Action
 *
 * Validates connectivity and authentication to 555stream.
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
import type { HealthcheckResult } from '../types/index.js';

export const healthcheckAction: Action = {
  name: 'STREAM555_HEALTHCHECK',
  description: 'Verify 555stream connectivity, authentication, and WebSocket binding. Use this to diagnose connection issues.',
  similes: [
    'CHECK_555STREAM',
    'STREAM555_CHECK',
    'CHECK_STREAM_CONNECTION',
    'VERIFY_555STREAM',
    'TEST_555STREAM',
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    // Always allow healthcheck - it's diagnostic
    const service = runtime.getService('stream555') as StreamControlService | undefined;
    return !!service;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      const service = runtime.getService('stream555') as StreamControlService | undefined;

      if (!service) {
        if (callback) {
          callback({
            text: '555stream service is not initialized. Check that STREAM555_BASE_URL and STREAM555_AGENT_TOKEN are set.',
            content: {
              success: false,
              error: 'Service not initialized',
            },
          });
        }
        return false;
      }

      // Perform healthcheck
      const result = await service.healthcheck();

      // Format response
      const response = formatHealthcheckResponse(result);

      if (callback) {
        callback({
          text: response,
          content: {
            success: result.allPassed,
            data: result,
          },
        });
      }

      return result.allPassed;
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (callback) {
        callback({
          text: `555stream healthcheck failed: ${errorMessage}`,
          content: {
            success: false,
            error: errorMessage,
          },
        });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Check if 555stream is working',
        },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll check the 555stream connection for you.',
          action: 'STREAM555_HEALTHCHECK',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Is the streaming service connected?',
        },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Let me verify the 555stream connectivity.',
          action: 'STREAM555_HEALTHCHECK',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Test the stream connection',
        },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Running a healthcheck on 555stream.',
          action: 'STREAM555_HEALTHCHECK',
        },
      },
    ],
  ] as ActionExample[][],
};

function formatHealthcheckResponse(result: HealthcheckResult): string {
  const lines: string[] = [];

  if (result.allPassed) {
    lines.push('✅ **555stream Healthcheck Passed**');
  } else {
    lines.push('❌ **555stream Healthcheck Failed**');
  }

  lines.push('');
  lines.push('**Check Results:**');

  // API reachable
  const apiCheck = result.checks.apiReachable;
  const apiIcon = apiCheck.passed ? '✅' : '❌';
  lines.push(`${apiIcon} API Reachable: ${apiCheck.message}${apiCheck.latencyMs ? ` (${apiCheck.latencyMs}ms)` : ''}`);

  // Auth valid
  const authCheck = result.checks.authValid;
  const authIcon = authCheck.passed ? '✅' : '❌';
  lines.push(`${authIcon} Authentication: ${authCheck.message}${authCheck.latencyMs ? ` (${authCheck.latencyMs}ms)` : ''}`);

  // WS connectable
  const wsCheck = result.checks.wsConnectable;
  const wsIcon = wsCheck.passed ? '✅' : '❌';
  lines.push(`${wsIcon} WebSocket: ${wsCheck.message}${wsCheck.latencyMs ? ` (${wsCheck.latencyMs}ms)` : ''}`);

  // Session accessible (optional)
  if (result.checks.sessionAccessible) {
    const sessionCheck = result.checks.sessionAccessible;
    const sessionIcon = sessionCheck.passed ? '✅' : '❌';
    lines.push(`${sessionIcon} Session: ${sessionCheck.message}${sessionCheck.latencyMs ? ` (${sessionCheck.latencyMs}ms)` : ''}`);
  }

  if (!result.allPassed) {
    lines.push('');
    lines.push('**Troubleshooting:**');
    if (!result.checks.apiReachable.passed) {
      lines.push('- Check STREAM555_BASE_URL is correct and the server is running');
    }
    if (!result.checks.authValid.passed) {
      lines.push('- Check STREAM555_AGENT_TOKEN is valid and not expired');
    }
    if (!result.checks.wsConnectable.passed) {
      lines.push('- WebSocket endpoint may be blocked or the server may not support it');
    }
  }

  return lines.join('\n');
}

export default healthcheckAction;
