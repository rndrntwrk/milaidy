/**
 * STREAM555_UPLOAD_IMAGE Action
 *
 * Upload an image file from URL.
 * Does not require approval.
 */
export const uploadImageAction = {
    name: 'STREAM555_UPLOAD_IMAGE',
    description: 'Upload an image to 555stream from a URL. Supported formats: jpg, png, gif, webp, svg.',
    similes: [
        'UPLOAD_IMAGE',
        'ADD_IMAGE',
        'IMPORT_IMAGE',
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
            const imageUrl = options?.url;
            if (!imageUrl) {
                if (callback) {
                    callback({
                        text: 'No image URL provided. Specify the URL of the image to upload.',
                        content: { success: false, error: 'No URL provided' },
                    });
                }
                return false;
            }
            const result = await service.uploadImageFromUrl(imageUrl);
            if (callback) {
                callback({
                    text: formatUploadResponse('Image', result),
                    content: { success: true, data: result },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to upload image: ${errorMessage}`,
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
                content: { text: 'Upload this logo image' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Uploading the image.',
                    action: 'STREAM555_UPLOAD_IMAGE',
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
    lines.push(`**Size:** ${(result.size / 1024).toFixed(1)} KB`);
    return lines.join('\n');
}
export default uploadImageAction;
//# sourceMappingURL=uploadImage.js.map