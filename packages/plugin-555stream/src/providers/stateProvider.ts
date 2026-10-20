/**
 * STREAM555_STATE Provider
 *
 * Provides current native status or legacy cached session state for LLM context.
 */

import type { Provider, ProviderResult, IAgentRuntime, Memory, State, SessionState, StreamStatus, PlatformStatus } from '../types/index.js';
import type { StreamControlService } from '../services/StreamControlService.js';
import { isAliceNativeStreamRuntime } from '../lib/agentAuth.js';

export const stateProvider: Provider = {
  name: 'STREAM555_STATE',
  description: 'Current 555stream session state including stream status, platforms, and production state',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<ProviderResult> => {
    const native = isAliceNativeStreamRuntime();
    try {
      const service = runtime.getService('stream555') as StreamControlService | undefined;

      if (!service) {
        return { text: native ? '## 555stream Status\nCurrent native Stream status is unavailable; the service is not initialized.' : formatNotInitialized() };
      }

      if (native) {
        const sessionId = service.getConfig()?.defaultSessionId?.trim();
        if (!sessionId) return { text: '## 555stream Status\nCurrent native Stream status is unavailable; no session is configured.' };
        return { text: formatNativeStatus(await service.getStreamStatus(sessionId)) };
      }

      const sessionState = service.getState();

      if (!sessionState) {
        return { text: formatNoSession(service) };
      }

      return { text: formatStateForLLM(sessionState) };
    } catch {
      return { text: native ? '## 555stream Status\nCurrent native Stream status is unavailable. No live state has been verified.' : '[555stream State Error] Current session state is unavailable.' };
    }
  },
};

function formatNativeStatus(state: StreamStatus): string {
  const lines = [
    '## 555stream Native Status',
    `**Session ID:** ${state.sessionId}`,
    `**Capture State:** ${state.status ?? 'unavailable'}`,
    `**Stream Active:** ${state.active ? 'YES - LIVE' : 'No'}`,
  ];
  if (state.jobId) lines.push(`**Dispatch ID:** ${state.jobId}`);
  if (state.continuity) lines.push(`**Continuity:** ${state.continuity.publisher} (${state.continuity.status})`);
  for (const [name, platform] of Object.entries(state.platforms)) {
    lines.push(`- ${name}: ${platform.status}`);
  }
  return lines.join('\n');
}

function formatNotInitialized(): string {
  return `## 555stream Status
**Not initialized** - The 555stream plugin is not loaded or failed to initialize.
Use STREAM555_HEALTHCHECK to diagnose connectivity issues.`;
}

function formatNoSession(service: StreamControlService): string {
  const config = service.getConfig();
  return `## 555stream Status
**Not connected** - No session is currently bound.

Configuration:
- Base URL: ${config?.baseUrl || 'Not set'}
- Default Session: ${config?.defaultSessionId || 'None'}
- Approvals Required: ${config?.requireApprovals ? 'Yes' : 'No'}

Use STREAM555_BOOTSTRAP_SESSION to connect to a session.`;
}

function formatStateForLLM(state: SessionState): string {
  const { productionState, platforms, stats, active, jobId, sessionId } = state;

  const lines: string[] = [
    '## 555stream Session State',
    '',
    `**Session ID:** ${sessionId}`,
    `**Stream Active:** ${active ? 'YES - LIVE' : 'No'}`,
  ];

  if (jobId) {
    lines.push(`**Job ID:** ${jobId}`);
  }

  // Stream stats if available
  if (stats && (stats.fps || stats.kbps || stats.duration)) {
    lines.push('');
    lines.push('### Stream Stats');
    if (stats.fps) lines.push(`- FPS: ${stats.fps}`);
    if (stats.kbps) lines.push(`- Bitrate: ${stats.kbps} kbps`);
    if (stats.duration) lines.push(`- Duration: ${stats.duration}`);
  }

  // Production state
  lines.push('');
  lines.push('### Production State');
  lines.push(`- Layout: ${productionState.activeLayout}`);
  if (productionState.pipPosition) {
    lines.push(`- PiP Position: ${productionState.pipPosition}`);
  }
  lines.push(`- Camera: ${productionState.cameraOn ? 'ON' : 'OFF'}`);
  lines.push(`- Screen Share: ${productionState.screenOn ? 'ON' : 'OFF'}`);
  lines.push(`- Microphone: ${productionState.micOn ? 'ON' : 'OFF'}`);

  // Sources
  if (productionState.sources && productionState.sources.length > 0) {
    lines.push('');
    lines.push('### Active Sources');
    for (const source of productionState.sources) {
      const muteStatus = source.muted ? ' (muted)' : '';
      lines.push(`- [${source.type}] ${source.label || source.id}${muteStatus}`);
    }
  }

  // Graphics
  if (productionState.graphics && productionState.graphics.length > 0) {
    lines.push('');
    lines.push('### Graphics');
    for (const graphic of productionState.graphics) {
      const visibility = graphic.visible ? 'visible' : 'hidden';
      lines.push(`- [${graphic.type}] ${graphic.id}: ${visibility}`);
    }
  }

  // Platforms
  const platformEntries = Object.entries(platforms);
  if (platformEntries.length > 0) {
    lines.push('');
    lines.push('### Platforms');
    for (const [id, platform] of platformEntries) {
      const enabledStatus = platform.enabled ? 'enabled' : 'disabled';
      const statusEmoji = getPlatformStatusEmoji(platform.status);
      lines.push(`- ${id}: ${statusEmoji} ${platform.status} (${enabledStatus})`);
      if (platform.error) {
        lines.push(`  - Error: ${platform.error}`);
      }
    }
  }

  // Last update
  lines.push('');
  lines.push(`*Last updated: ${new Date(state.lastUpdate).toISOString()}*`);
  lines.push(`*Sequence: ${state.sequence}*`);

  return lines.join('\n');
}

function getPlatformStatusEmoji(status: PlatformStatus['status']): string {
  switch (status) {
    case 'live': return '🟢';
    case 'connecting': return '🟡';
    case 'error': return '🔴';
    case 'disconnected': return '⚫';
    default: return '⚪';
  }
}

export default stateProvider;
