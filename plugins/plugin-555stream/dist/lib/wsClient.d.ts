/**
 * WebSocket Client for 555stream Agent API
 *
 * Features:
 * - Token-authenticated bind
 * - Auto-reconnect with exponential backoff
 * - Message parsing and event dispatch
 * - Ping/pong keepalive
 */
import type { WsClientOptions, WsClientMessage, WsEventHandler, WsErrorHandler, WsStateHandler } from '../types/index.js';
export declare class WsClient {
    private url;
    private token;
    private tokenProvider?;
    private ws;
    private reconnectInterval;
    private maxReconnectAttempts;
    private pingInterval;
    private reconnectAttempts;
    private pingTimer;
    private reconnectTimer;
    private boundSessionId;
    private clientId;
    private reconnectEnabled;
    private messageHandlers;
    private errorHandlers;
    private stateHandlers;
    private state;
    private lastPongTime;
    constructor(options: WsClientOptions);
    /**
     * Connect to the WebSocket server
     */
    connect(): Promise<void>;
    /**
     * Bind to a session with authentication
     */
    bind(sessionId: string): Promise<void>;
    /**
     * Send a message to the server
     */
    send(message: WsClientMessage): void;
    /**
     * Send a state patch
     */
    patchState(patch: Record<string, unknown>): Promise<string>;
    /**
     * Register message handler
     */
    onMessage(handler: WsEventHandler): () => void;
    /**
     * Register error handler
     */
    onError(handler: WsErrorHandler): () => void;
    /**
     * Register state change handler
     */
    onStateChange(handler: WsStateHandler): () => void;
    /**
     * Get current connection state
     */
    getState(): typeof this.state;
    /**
     * Get bound session ID
     */
    getBoundSessionId(): string | null;
    /**
     * Check if connected and bound
     */
    isReady(): boolean;
    /**
     * Disconnect from the server
     */
    disconnect(): void;
    private handleMessage;
    private notifyError;
    private setState;
    private startPing;
    private stopPing;
    private scheduleReconnect;
    private cleanup;
    private sendBindMessage;
    private isAuthError;
    private refreshToken;
}
//# sourceMappingURL=wsClient.d.ts.map