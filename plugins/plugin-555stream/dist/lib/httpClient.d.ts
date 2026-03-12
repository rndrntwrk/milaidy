/**
 * HTTP Client for 555stream Agent API
 *
 * Features:
 * - Bearer token authentication
 * - Request ID propagation
 * - Retry with exponential backoff
 * - Error normalization
 */
import type { HttpClientOptions, ApiResponse } from '../types/index.js';
export declare class HttpClient {
    private baseUrl;
    private token;
    private tokenProvider?;
    private timeout;
    private maxRetries;
    constructor(options: HttpClientOptions);
    /**
     * Make a GET request
     */
    get<T>(path: string): Promise<ApiResponse<T>>;
    /**
     * Make a POST request
     */
    post<T>(path: string, body?: unknown, options?: {
        idempotencyKey?: string;
    }): Promise<ApiResponse<T>>;
    /**
     * Make a PATCH request
     */
    patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>>;
    /**
     * Make a PUT request
     */
    put<T>(path: string, body?: unknown, options?: {
        headers?: Record<string, string>;
    }): Promise<ApiResponse<T>>;
    /**
     * Make a DELETE request
     */
    delete<T>(path: string): Promise<ApiResponse<T>>;
    /**
     * Make a POST request with FormData (multipart/form-data)
     * Includes retry logic for large uploads that may fail due to network issues
     */
    postFormData<T>(path: string, formData: FormData): Promise<ApiResponse<T>>;
    /**
     * Core request method with retry logic
     */
    private request;
    /**
     * Check if the API is reachable
     */
    healthcheck(): Promise<{
        reachable: boolean;
        latencyMs: number;
        error?: string;
    }>;
    private sleep;
    private refreshToken;
}
//# sourceMappingURL=httpClient.d.ts.map