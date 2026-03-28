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

export class HttpClient {
  private baseUrl: string;
  private token: string;
  private tokenProvider?: () => Promise<string>;
  private timeout: number;
  private maxRetries: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = options.token;
    this.tokenProvider = options.tokenProvider;
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown, options?: { idempotencyKey?: string }): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body);
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Make a POST request with FormData (multipart/form-data)
   * Includes retry logic for large uploads that may fail due to network issues
   */
  async postFormData<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const requestId = uuidv4();

    let lastError: Error | null = null;
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

        const data = await response.json() as T & { error?: string; requestId?: string };

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
      } catch (error) {
        lastError = error as Error;

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
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { idempotencyKey?: string; headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const requestId = uuidv4();
    let lastError: Error | null = null;
    let authRetried = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
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

        const data = await response.json() as T & { error?: string; requestId?: string };

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
      } catch (error) {
        lastError = error as Error;

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
  async healthcheck(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const response = await this.get('/api/agent/v1/health');
      return {
        reachable: response.success,
        latencyMs: Date.now() - start,
        error: response.error,
      };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async refreshToken(): Promise<void> {
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
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
