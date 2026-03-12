/**
 * STREAM555_UPLOAD_VIDEO Action
 *
 * Upload a video file from URL.
 * Does not require approval.
 */
export const uploadVideoAction = {
    name: 'STREAM555_UPLOAD_VIDEO',
    description: 'Upload a video to 555stream from a URL. Supported formats: mp4, webm, mov, avi, mkv.',
    similes: [
        'UPLOAD_VIDEO',
        'ADD_VIDEO',
        'IMPORT_VIDEO',
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
            const videoUrl = options?.url;
            if (!videoUrl) {
                if (callback) {
                    callback({
                        text: 'No video URL provided. Specify the URL of the video to upload.',
                        content: { success: false, error: 'No URL provided' },
                    });
                }
                return false;
            }
            const result = await service.uploadVideoFromUrl(videoUrl);
            if (callback) {
                callback({
                    text: formatUploadResponse('Video', result),
                    content: { success: true, data: result },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to upload video: ${errorMessage}`,
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
                content: { text: 'Upload this video file' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Uploading the video.',
                    action: 'STREAM555_UPLOAD_VIDEO',
                },
            },
        ],
    ],
};
function formatUploadResponse(type, result) {
    const lines = [];
    lines.push(`**${type} Uploaded**`);
    lines.push('');
    lines.push(`**URL:** ${result.url}`);
    lines.push(`**Filename:** ${result.filename}`);
    lines.push(`**Original:** ${result.originalName}`);
    lines.push(`**Size:** ${(result.size / 1024 / 1024).toFixed(2)} MB`);
    return lines.join('\n');
}
export default uploadVideoAction;
//# sourceMappingURL=uploadVideo.js.map