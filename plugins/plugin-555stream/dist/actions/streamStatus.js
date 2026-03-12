/**
 * STREAM555_STREAM_STATUS Action
 *
 * Get current stream status.
 * Does not require approval.
 */
export const streamStatusAction = {
    name: 'STREAM555_STREAM_STATUS',
    description: 'Get current stream status including active state, job info, platform statuses, and statistics.',
    similes: [
        'GET_STREAM_STATUS',
        'CHECK_STREAM',
        'STREAM_INFO',
        'IS_LIVE',
    ],
    validate: async (runtime, _message, _state) => {
        const service = runtime.getService('stream555');
        return !!(service?.isReady());
    },
    handler: async (runtime, message, _state, options, callback) => {
        try {
            const service = runtime.getService('stream555');
            if (!service) {
                if (callback) {
                    callback({
                        text: '555stream service is not initialized.',
                        content: { success: false, error: 'Service not initialized' },
                    });
                }
                return false;
            }
            const status = await service.getStreamStatus();
            const response = formatStatusResponse(status);
            if (callback) {
                callback({
                    text: response,
                    content: { success: true, data: status },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to get stream status: ${errorMessage}`,
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
                content: { text: 'What\'s the stream status?' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Let me check the stream status.',
                    action: 'STREAM555_STREAM_STATUS',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Are we live?' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll check if we\'re live.',
                    action: 'STREAM555_STREAM_STATUS',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Show stream info' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Here\'s the current stream information.',
                    action: 'STREAM555_STREAM_STATUS',
                },
            },
        ],
    ],
};
function formatStatusResponse(status) {
    const lines = [];
    const statusIcon = status.active ? '**LIVE**' : '**OFFLINE**';
    lines.push(`## Stream Status: ${statusIcon}`);
    lines.push('');
    lines.push(`**Session:** \`${status.sessionId}\``);
    if (status.active) {
        if (status.jobId) {
            lines.push(`**Job ID:** \`${status.jobId}\``);
        }
        if (status.cfSessionId) {
            lines.push(`**CF Session:** \`${status.cfSessionId}\``);
        }
        if (status.serverFallbackActive) {
            lines.push('**Fallback:** Server-side capture active');
        }
        if (status.startTime) {
            const duration = Date.now() - status.startTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            lines.push(`**Duration:** ${minutes}m ${seconds}s`);
        }
    }
    // Platform statuses
    if (Object.keys(status.platforms).length > 0) {
        lines.push('');
        lines.push('**Platforms:**');
        for (const [platformId, platform] of Object.entries(status.platforms)) {
            const statusIcon = platform.enabled ? (platform.status === 'live' ? '' : '') : '';
            const statusText = platform.enabled ? platform.status : 'disabled';
            let platformLine = `- ${platformId}: ${statusIcon} ${statusText}`;
            if (platform.error) {
                platformLine += ` (${platform.error})`;
            }
            lines.push(platformLine);
        }
    }
    // Stats
    if (status.stats) {
        lines.push('');
        lines.push('**Stats:**');
        if (status.stats.fps) {
            lines.push(`- FPS: ${status.stats.fps}`);
        }
        if (status.stats.kbps) {
            lines.push(`- Bitrate: ${status.stats.kbps} kbps`);
        }
        if (status.stats.duration) {
            lines.push(`- Duration: ${status.stats.duration}`);
        }
    }
    // Job status
    if (status.jobStatus) {
        lines.push('');
        lines.push('**Job Status:**');
        lines.push(`- State: ${status.jobStatus.state}`);
        if (status.jobStatus.progress !== undefined) {
            lines.push(`- Progress: ${status.jobStatus.progress}%`);
        }
        if (status.jobStatus.queueName) {
            lines.push(`- Queue: ${status.jobStatus.queueName}`);
        }
    }
    return lines.join('\n');
}
export default streamStatusAction;
//# sourceMappingURL=streamStatus.js.map