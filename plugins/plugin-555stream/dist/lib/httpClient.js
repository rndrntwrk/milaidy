/**
 * HTTP Client for 555stream Agent API
 *
 * Features:
 * - Bearer token authentication
 * - Request ID propagation
 * - Retry with exponential backoff
 * - Error normalization
 */
export class HttpClient {
    baseUrl;
    token;
    tokenProvider;
    timeout;
    maxRetries;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.token = options.token;
        this.tokenProvider = options.tokenProvider;
        this.timeout = options.timeout ?? 30000;
        this.maxRetries = options.maxRetries ?? 3;
    }
    /**
     * Make a GET request
     */
    async get(path) {
        return this.request('GET', path);
    }
    /**
     * Make a POST request
     */
    async post(path, body, options) {
        return this.request('POST', path, body, options);
    }
    /**
     * Make a PATCH request
     */
    async patch(path, body) {
        return this.request('PATCH', path, body);
    }
    /**
     * Make a PUT request
     */
    async put(path, body, options) {
        return this.request('PUT', path, body, options);
    }
    /**
     * Make a DELETE request
     */
    async delete(path) {
        return this.request('DELETE', path);
    }
    /**
     * Make a POST request with FormData (multipart/form-data)
     * Includes retry logic for large uploads that may fail due to network issues
     */
    async postFormData(path, formData) {
        const url = `${this.baseUrl}${path}`;
        const requestId = uuidv4();
        let lastError = null;
        let authRetried = false;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                // Use longer timeout for uploads (3x normal timeout)
                const uploadTimeout = this.timeout * 3;
                const timeoutId = setTimeout(() => controller.abort(), uploadTimeout);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'X-Request-Id': requestId,
                        // Note: Don't set Content-Type for FormData - browser will set it with boundary
                    },
                    body: formData,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const data = await response.json();
                if (!response.ok) {
                    if (response.status === 401 && this.tokenProvider && !authRetried) {
                        authRetried = true;
                        await this.refreshToken();
                        attempt -= 1;
                        continue;
                    }
                    // Don't retry 4xx errors (client errors)
                    if (response.status >= 400 && response.status < 500) {
                        return {
                            success: false,
                            error: data.error || `HTTP ${response.status}`,
                            requestId: data.requestId || requestId,
                        };
                    }
                    // Retry 5xx errors
                    throw new Error(data.error || `HTTP ${response.status}`);
                }
                return {
                    success: true,
                    data,
                    requestId: data.requestId || requestId,
                };
            }
            catch (error) {
                lastError = error;
                // Don't retry on abort (timeout)
                if (lastError.name === 'AbortError') {
                    return {
                        success: false,
                        error: 'Upload timeout - file may be too large',
                        requestId,
                    };
                }
                // Exponential backoff before retry (longer delays for uploads)
                if (attempt < this.maxRetries) {
                    const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
                    console.log(`[555stream HTTP] Upload failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
                    await this.sleep(delay);
                }
            }
        }
        return {
            success: false,
            error: lastError?.message || 'Upload failed after retries',
            requestId,
        };
    }
    /**
     * Core request method with retry logic
     */
    async request(method, path, body, options) {
        const url = `${this.baseUrl}${path}`;
        const requestId = uuidv4();
        let lastError = null;
        let authRetried = false;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const headers = {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'X-Request-Id': requestId,
                    ...(options?.headers || {}),
                };
                if (options?.idempotencyKey) {
                    headers['Idempotency-Key'] = options.idempotencyKey;
                }
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const data = await response.json();
                if (!response.ok) {
                    if (response.status === 401 && this.tokenProvider && !authRetried) {
                        authRetried = true;
                        await this.refreshToken();
                        attempt -= 1;
                        continue;
                    }
                    // Don't retry 4xx errors (client errors)
                    if (response.status >= 400 && response.status < 500) {
                        return {
                            success: false,
                            error: data.error || `HTTP ${response.status}`,
                            requestId: data.requestId || requestId,
                        };
                    }
                    // Retry 5xx errors
                    throw new Error(data.error || `HTTP ${response.status}`);
                }
                return {
                    success: true,
                    data,
                    requestId: data.requestId || requestId,
                };
            }
            catch (error) {
                lastError = error;
                // Don't retry on abort (timeout)
                if (lastError.name === 'AbortError') {
                    return {
                        success: false,
                        error: 'Request timeout',
                        requestId,
                    };
                }
                // Exponential backoff before retry
                if (attempt < this.maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await this.sleep(delay);
                }
            }
        }
        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            requestId,
        };
    }
    /**
     * Check if the API is reachable
     */
    async healthcheck() {
        const start = Date.now();
        try {
            const response = await this.get('/api/agent/v1/health');
            return {
                reachable: response.success,
                latencyMs: Date.now() - start,
                error: response.error,
            };
        }
        catch (error) {
            return {
                reachable: false,
                latencyMs: Date.now() - start,
                error: error.message,
            };
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async refreshToken() {
        if (!this.tokenProvider) {
            return;
        }
        const nextToken = (await this.tokenProvider()).trim();
        if (!nextToken) {
            throw new Error('Agent token refresh returned an empty token');
        }
        this.token = nextToken;
    }
}
// Simple UUID generator for environments without crypto.randomUUID
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
//# sourceMappingURL=httpClient.js.map