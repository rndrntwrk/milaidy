/**
 * STREAM555_PLATFORM_CONFIG Action
 *
 * Update platform configuration.
 * Requires approval when writing stream keys.
 */
import { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired, } from '../lib/approvalHelper.js';
export const platformConfigAction = {
    name: 'STREAM555_PLATFORM_CONFIG',
    description: 'Configure a streaming platform. Valid platforms: twitch, kick, youtube, pumpfun, x, tiktok, zora, custom. Requires approval when setting stream keys.',
    similes: [
        'CONFIGURE_PLATFORM',
        'SET_PLATFORM',
        'UPDATE_RTMP',
        'SET_STREAM_KEY',
    ],
    validate: async (runtime, _message, _state) => {
        const service = runtime.getService('stream555');
        return !!service;
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
            const config = service.getConfig();
            const platformId = options?.platformId;
            const approvalId = options?._approvalId;
            if (!platformId) {
                if (callback) {
                    callback({
                        text: 'No platform ID provided. Valid: twitch, kick, youtube, pumpfun, x, tiktok, zora, custom.',
                        content: { success: false, error: 'No platformId provided' },
                    });
                }
                return false;
            }
            const platformConfig = {
                rtmpUrl: options?.rtmpUrl,
                streamKey: options?.streamKey,
                enabled: options?.enabled,
            };
            // Require approval if stream key is being set
            const requireApproval = !!(platformConfig.streamKey && config?.requireApprovals);
            const params = {
                platformId,
                ...platformConfig,
                _approvalId: approvalId,
            };
            // Execute with approval flow if setting stream key
            const result = await withApproval('STREAM555_PLATFORM_CONFIG', params, requireApproval, async () => {
                const updated = await service.updatePlatform(platformId, platformConfig);
                return { success: true, data: updated };
            });
            if (result.pending) {
                if (callback) {
                    callback({
                        text: formatApprovalPending(result),
                        content: {
                            success: false,
                            data: {
                                pending: true,
                                approvalId: result.approvalId,
                                expiresAt: result.expiresAt,
                            },
                        },
                    });
                }
                return false;
            }
            if (result.error) {
                if (result.error.includes('rejected')) {
                    if (callback) {
                        callback({
                            text: formatApprovalRejected(),
                            content: { success: false, error: result.error },
                        });
                    }
                }
                else if (result.error.includes('expired')) {
                    if (callback) {
                        callback({
                            text: formatApprovalExpired(),
                            content: { success: false, error: result.error },
                        });
                    }
                }
                else {
                    if (callback) {
                        callback({
                            text: `Failed to configure platform: ${result.error}`,
                            content: { success: false, error: result.error },
                        });
                    }
                }
                return false;
            }
            const data = result.data;
            if (callback) {
                callback({
                    text: formatPlatformResponse(data),
                    content: { success: true, data },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to configure platform: ${errorMessage}`,
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
                content: { text: 'Configure Twitch streaming' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Configuring Twitch platform.',
                    action: 'STREAM555_PLATFORM_CONFIG',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Set the RTMP URL for YouTube' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Setting YouTube RTMP configuration.',
                    action: 'STREAM555_PLATFORM_CONFIG',
                },
            },
        ],
    ],
};
function formatPlatformResponse(data) {
    const lines = [];
    lines.push('**Platform Configured**');
    lines.push('');
    lines.push(`**Platform:** ${data.platformId}`);
    if (data.rtmpUrl) {
        lines.push(`**RTMP URL:** ${data.rtmpUrl}`);
    }
    lines.push(`**Enabled:** ${data.enabled ? 'Yes' : 'No'}`);
    lines.push(`**Configured:** ${data.configured ? 'Yes (stream key set)' : 'No'}`);
    return lines.join('\n');
}
export default platformConfigAction;
//# sourceMappingURL=platformConfig.js.map