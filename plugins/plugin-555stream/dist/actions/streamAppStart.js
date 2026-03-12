/**
 * STREAM555_GO_LIVE_APP Action
 *
 * Convenience action for app streaming:
 * - Uses website capture (`input.type = website`)
 * - Carries `options.app` metadata so 555stream can validate auth/requirements
 * - Requires operator approval
 */
import { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired, } from '../lib/approvalHelper.js';
function isLocalhostUrl(raw) {
    try {
        const url = new URL(raw);
        const hostname = url.hostname.toLowerCase();
        return (hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || hostname === '::1');
    }
    catch {
        return false;
    }
}
function summarizeHttpUrl(raw) {
    try {
        const url = new URL(raw);
        const queryKeys = [];
        for (const key of url.searchParams.keys()) {
            queryKeys.push(key);
            if (queryKeys.length >= 25)
                break;
        }
        return {
            origin: url.origin,
            path: url.pathname,
            queryKeys,
            hasHash: Boolean(url.hash),
            isLocalhost: isLocalhostUrl(raw),
        };
    }
    catch {
        return null;
    }
}
function formatUrlForDisplay(raw) {
    const summary = summarizeHttpUrl(raw);
    if (!summary)
        return raw;
    const base = `${summary.origin}${summary.path}`;
    if (summary.queryKeys.length === 0 && !summary.hasHash)
        return base;
    const parts = [];
    if (summary.queryKeys.length > 0)
        parts.push(`query keys: ${summary.queryKeys.join(', ')}`);
    if (summary.hasHash)
        parts.push('hash: present');
    return `${base} (${parts.join('; ')})`;
}
function parseBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized))
        return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized))
        return false;
    return undefined;
}
function buildAppSpecFromDescriptor(descriptor) {
    return {
        name: descriptor.name,
        ...(descriptor.displayName ? { displayName: descriptor.displayName } : {}),
        ...(descriptor.category ? { category: descriptor.category } : {}),
        ...(descriptor.launchType ? { launchType: descriptor.launchType } : {}),
        viewer: {
            postMessageAuth: Boolean(descriptor.viewer?.postMessageAuth),
            ...(descriptor.viewer?.sandbox ? { sandbox: descriptor.viewer.sandbox } : {}),
            ...(Array.isArray(descriptor.viewer?.embedParamKeys)
                ? { embedParamKeys: descriptor.viewer.embedParamKeys }
                : {}),
        },
        requirements: {
            ...(typeof descriptor.requirements?.wrapperRequired === 'boolean'
                ? { wrapperRequired: descriptor.requirements.wrapperRequired }
                : {}),
            ...(typeof descriptor.requirements?.wrapperProvided === 'boolean'
                ? { wrapperProvided: descriptor.requirements.wrapperProvided }
                : {}),
            ...(typeof descriptor.requirements?.publicUrlRequired === 'boolean'
                ? { publicUrlRequired: descriptor.requirements.publicUrlRequired }
                : {}),
            ...(typeof descriptor.requirements?.localhostAllowed === 'boolean'
                ? { localhostAllowed: descriptor.requirements.localhostAllowed }
                : {}),
        },
    };
}
export const streamAppStartAction = {
    name: 'STREAM555_GO_LIVE_APP',
    description: 'Start a website-capture stream for an app viewer URL (Babylon, Agent Town, etc). Accepts viewerUrl directly or resolves it from appName via catalog. Sends app requirements metadata via options.app. Requires operator approval.',
    similes: [
        'STREAM_APP',
        'GO_LIVE_APP',
        'START_APP_STREAM',
        'STREAM_WEBSITE_APP',
    ],
    validate: async (runtime, _message, _state) => {
        const service = runtime.getService('stream555');
        return !!(service?.isReady());
    },
    handler: async (runtime, _message, _state, options, callback) => {
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
            const requireApprovals = config?.requireApprovals ?? true;
            const rawViewerUrl = (options?.viewerUrl ?? options?.inputUrl ?? options?.url);
            const requestedAppName = options?.appName;
            const scene = options?.scene ?? 'default';
            const allowLocalhost = parseBoolean(options?.allowLocalhost) ?? false;
            const forceRefreshCatalog = parseBoolean(options?.forceRefresh) ?? false;
            const sources = options?.sources;
            const approvalId = options?._approvalId;
            let viewerUrl = typeof rawViewerUrl === 'string' ? rawViewerUrl.trim() : '';
            let appName = typeof requestedAppName === 'string' ? requestedAppName.trim() : '';
            let resolvedCatalogApp = null;
            let catalogResolutionUsed = false;
            if (!viewerUrl && appName) {
                try {
                    resolvedCatalogApp = await service.resolveAppDescriptor(appName, { forceRefresh: forceRefreshCatalog });
                    if (resolvedCatalogApp?.viewer?.url) {
                        viewerUrl = resolvedCatalogApp.viewer.url.trim();
                        appName = resolvedCatalogApp.name;
                        catalogResolutionUsed = true;
                    }
                }
                catch (error) {
                    if (callback) {
                        callback({
                            text: `Failed to resolve app catalog for "${appName}": ${error.message}`,
                            content: { success: false, error: error.message },
                        });
                    }
                    return false;
                }
            }
            if (!viewerUrl) {
                if (callback) {
                    const resolutionHint = appName
                        ? `No viewer URL provided and app "${appName}" could not be resolved from catalog.`
                        : 'No viewer URL provided.';
                    callback({
                        text: `${resolutionHint} Set viewerUrl directly or provide a valid appName from STREAM555_APP_LIST.`,
                        content: { success: false, error: 'No viewerUrl provided' },
                    });
                }
                return false;
            }
            const normalizedViewerUrl = viewerUrl.trim();
            if (!allowLocalhost && isLocalhostUrl(normalizedViewerUrl)) {
                if (callback) {
                    callback({
                        text: `Viewer URL resolves to localhost (${normalizedViewerUrl}). ` +
                            'Provide a public URL or set allowLocalhost=true for local testing.',
                        content: { success: false, error: 'viewerUrl is localhost' },
                    });
                }
                return false;
            }
            const normalizedAppName = appName || resolvedCatalogApp?.name || undefined;
            const appSpecFromOptions = options?.app;
            const appSpecFromCatalog = resolvedCatalogApp ? buildAppSpecFromDescriptor(resolvedCatalogApp) : undefined;
            const appSpec = appSpecFromOptions ?? appSpecFromCatalog ?? (normalizedAppName
                ? {
                    name: normalizedAppName,
                    requirements: {
                        publicUrlRequired: !allowLocalhost,
                        localhostAllowed: allowLocalhost,
                    },
                }
                : undefined);
            const input = {
                type: 'website',
                url: normalizedViewerUrl,
            };
            const streamOptions = {
                framerate: options?.framerate,
                videoBitrate: options?.videoBitrate,
                audioBitrate: options?.audioBitrate,
                width: options?.width,
                height: options?.height,
                timeoutSeconds: options?.timeoutSeconds,
                scene,
                ...(normalizedAppName ? { appName: normalizedAppName } : {}),
                resolvedFrom: catalogResolutionUsed ? 'catalog' : 'viewerUrl',
                ...(appSpec ? { app: appSpec } : {}),
            };
            const viewerUrlSummary = summarizeHttpUrl(normalizedViewerUrl);
            const viewerUrlForApproval = viewerUrlSummary
                ? {
                    origin: viewerUrlSummary.origin,
                    path: viewerUrlSummary.path,
                    queryKeys: viewerUrlSummary.queryKeys,
                    hasHash: viewerUrlSummary.hasHash,
                    isLocalhost: viewerUrlSummary.isLocalhost,
                }
                : { provided: true };
            const params = {
                appName: normalizedAppName,
                viewerUrl: viewerUrlForApproval,
                scene,
                allowLocalhost,
                resolvedFrom: catalogResolutionUsed ? 'catalog' : 'viewerUrl',
                app: appSpec,
                sources,
                _approvalId: approvalId,
            };
            const result = await withApproval('STREAM555_GO_LIVE_APP', params, requireApprovals, async () => {
                const startResult = await service.startStream(input, streamOptions, sources);
                return { success: true, data: startResult };
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
                            text: `Failed to start app stream: ${result.error}`,
                            content: { success: false, error: result.error },
                        });
                    }
                }
                return false;
            }
            const data = result.data;
            if (callback) {
                const jobId = typeof data.jobId === 'string' ? data.jobId : undefined;
                const cfSessionId = typeof data.cfSessionId === 'string' ? data.cfSessionId : undefined;
                callback({
                    text: [
                        '**App Stream Started**',
                        '',
                        ...(normalizedAppName ? [`**App:** ${normalizedAppName}`] : []),
                        `**Input:** website capture`,
                        `**Viewer URL:** ${formatUrlForDisplay(normalizedViewerUrl)}`,
                        ...(jobId ? [`**Job ID:** ${jobId}`] : []),
                        ...(cfSessionId ? [`**Cloudflare Live Input:** ${cfSessionId}`] : []),
                    ].join('\n'),
                    content: { success: true, data },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to start app stream: ${errorMessage}`,
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
                content: { text: 'Go live streaming Babylon' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Starting the Babylon app stream.',
                    action: 'STREAM555_GO_LIVE_APP',
                },
            },
        ],
    ],
};
export default streamAppStartAction;
//# sourceMappingURL=streamAppStart.js.map