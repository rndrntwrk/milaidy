/**
 * STREAM555_STATE Provider
 *
 * Provides current cached session state for LLM context.
 */
export const stateProvider = {
    name: 'STREAM555_STATE',
    description: 'Current 555stream session state including stream status, platforms, and production state',
    get: async (runtime, _message, _state) => {
        try {
            const service = runtime.getService('stream555');
            if (!service) {
                return formatNotInitialized();
            }
            const sessionState = service.getState();
            if (!sessionState) {
                return formatNoSession(service);
            }
            return formatStateForLLM(sessionState);
        }
        catch (error) {
            return `[555stream State Error] ${error.message}`;
        }
    },
};
function formatNotInitialized() {
    return `## 555stream Status
**Not initialized** - The 555stream plugin is not loaded or failed to initialize.
Use STREAM555_HEALTHCHECK to diagnose connectivity issues.`;
}
function formatNoSession(service) {
    const config = service.getConfig();
    return `## 555stream Status
**Not connected** - No session is currently bound.

Configuration:
- Base URL: ${config?.baseUrl || 'Not set'}
- Default Session: ${config?.defaultSessionId || 'None'}
- Approvals Required: ${config?.requireApprovals ? 'Yes' : 'No'}

Use STREAM555_BOOTSTRAP_SESSION to connect to a session.`;
}
function formatStateForLLM(state) {
    const { productionState, platforms, stats, active, jobId, sessionId } = state;
    const lines = [
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
        if (stats.fps)
            lines.push(`- FPS: ${stats.fps}`);
        if (stats.kbps)
            lines.push(`- Bitrate: ${stats.kbps} kbps`);
        if (stats.duration)
            lines.push(`- Duration: ${stats.duration}`);
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
function getPlatformStatusEmoji(status) {
    switch (status) {
        case 'live': return '🟢';
        case 'connecting': return '🟡';
        case 'error': return '🔴';
        case 'disconnected': return '⚫';
        default: return '⚪';
    }
}
export default stateProvider;
//# sourceMappingURL=stateProvider.js.map