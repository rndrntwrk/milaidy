/**
 * StreamControlService
 *
 * Core service for 555stream control. Manages:
 * - HTTP client for Agent API
 * - WebSocket connection for real-time updates
 * - Session state caching
 */
import type { IAgentRuntime, Service } from '../types/index.js';
import type { Stream555Config, Session, SessionState, HealthcheckResult, Stream555RuntimeState, ProductionState, StreamInput, StreamOptions, StreamStartResult, StreamStopResult, StreamStatus, FallbackResult, StudioState, LayoutConfig, GraphicConfig, Graphic, SourceConfig, SourceData, GuestInvite, GuestData, UploadResult, VideoAsset, PlatformConfig, UserSettings, RadioConfig, RadioTrack, RadioState, Source, AppCatalogResponse, AppStreamDescriptor, Approval } from '../types/index.js';
export declare class StreamControlService implements Service {
    static serviceType: string;
    static start(runtime: IAgentRuntime): Promise<StreamControlService>;
    private runtime;
    private config;
    private httpClient;
    private wsClient;
    private sessionState;
    private boundSessionId;
    /**
     * Get service type identifier
     */
    get serviceType(): string;
    /**
     * Initialize the service
     */
    initialize(runtime: IAgentRuntime): Promise<void>;
    /**
     * Stop the service
     */
    stop(): Promise<void>;
    /**
     * Perform healthcheck against 555stream API
     */
    healthcheck(): Promise<HealthcheckResult>;
    getRuntimeState(): Stream555RuntimeState;
    /**
     * Create or resume a session
     */
    createOrResumeSession(sessionId?: string): Promise<Session>;
    /**
     * Bind WebSocket to a session
     */
    bindWebSocket(sessionId: string): Promise<void>;
    /**
     * Get cached session state
     */
    getState(sessionId?: string): SessionState | null;
    /**
     * Get all cached session states
     */
    getAllStates(): Map<string, SessionState>;
    /**
     * Get bound session ID
     */
    getBoundSessionId(): string | null;
    /**
     * Check if service is ready (initialized, connected, bound)
     */
    isReady(): boolean;
    /**
     * Get configuration
     */
    getConfig(): Stream555Config | null;
    /**
     * List pending operator approvals owned by the stream plugin.
     */
    listPendingApprovals(): Approval[];
    /**
     * Resolve a plugin-owned approval request.
     */
    resolveApproval(approvalId: string, decision: 'approved' | 'denied', resolvedBy?: string): boolean;
    /**
     * Patch production state via HTTP
     */
    patchState(patch: Partial<ProductionState>, sessionId?: string): Promise<ProductionState>;
    /**
     * Get session details via HTTP
     */
    getSession(sessionId?: string): Promise<Session>;
    /**
     * List app-stream descriptors available to the agent.
     */
    listApps(options?: {
        forceRefresh?: boolean;
    }): Promise<AppCatalogResponse>;
    /**
     * Resolve an app descriptor by exact name or known alias.
     */
    resolveAppDescriptor(appNameOrAlias: string, options?: {
        forceRefresh?: boolean;
    }): Promise<AppStreamDescriptor | null>;
    /**
     * Start streaming
     */
    startStream(input: StreamInput, options?: StreamOptions, sources?: Source[], sessionId?: string): Promise<StreamStartResult>;
    /**
     * Stop streaming
     */
    stopStream(sessionId?: string): Promise<StreamStopResult>;
    /**
     * Trigger server-side fallback capture
     */
    fallbackStream(reason?: string, sessionId?: string): Promise<FallbackResult>;
    /**
     * Get current stream status
     */
    getStreamStatus(sessionId?: string): Promise<StreamStatus>;
    /**
     * Get studio state (scenes, layouts, graphics)
     */
    getStudio(sessionId?: string): Promise<StudioState>;
    /**
     * Update layout for a scene
     */
    setLayout(sceneId: string, layout: LayoutConfig, sessionId?: string): Promise<LayoutConfig>;
    /**
     * Set the active scene
     */
    setActiveScene(sceneId: string, sessionId?: string): Promise<string>;
    /**
     * Get all graphics
     */
    getGraphics(sessionId?: string): Promise<Graphic[]>;
    /**
     * Create a new graphic
     */
    createGraphic(graphic: GraphicConfig, sessionId?: string): Promise<Graphic>;
    /**
     * Update an existing graphic
     */
    updateGraphic(graphicId: string, updates: Partial<GraphicConfig>, sessionId?: string): Promise<Graphic>;
    /**
     * Delete a graphic
     */
    deleteGraphic(graphicId: string, sessionId?: string): Promise<void>;
    /**
     * Get all sources for a session
     */
    getSources(sessionId?: string): Promise<SourceData[]>;
    /**
     * Create a new source
     */
    createSource(source: SourceConfig, sessionId?: string): Promise<SourceData>;
    /**
     * Update a source
     */
    updateSource(sourceId: string, updates: Partial<SourceConfig>, sessionId?: string): Promise<SourceData>;
    /**
     * Delete a source
     */
    deleteSource(sourceId: string, sessionId?: string): Promise<void>;
    /**
     * Get all guests for a session
     */
    getGuests(sessionId?: string): Promise<GuestData[]>;
    /**
     * Create a guest invite
     */
    createGuestInvite(label?: string, sessionId?: string): Promise<GuestInvite>;
    /**
     * Remove/revoke a guest
     */
    removeGuest(guestId: string, sessionId?: string): Promise<void>;
    /**
     * Upload an image file from URL
     * Note: For file uploads, use multipart form-data directly
     */
    uploadImageFromUrl(imageUrl: string): Promise<UploadResult>;
    /**
     * Upload a video file from URL
     * Note: For file uploads, use multipart form-data directly
     */
    uploadVideoFromUrl(videoUrl: string): Promise<UploadResult>;
    /**
     * Create a video asset from a URL (HLS or direct)
     */
    addVideoUrl(url: string, name?: string): Promise<VideoAsset>;
    /**
     * Get video asset details
     */
    getVideo(videoId: string): Promise<VideoAsset>;
    /**
     * Delete a video asset
     */
    deleteVideo(videoId: string): Promise<void>;
    /**
     * List all video assets
     */
    listVideos(limit?: number, offset?: number): Promise<{
        videos: VideoAsset[];
        total: number;
    }>;
    /**
     * Get user settings (platforms without stream keys)
     */
    getSettings(): Promise<UserSettings>;
    /**
     * Update platform configuration
     */
    updatePlatform(platformId: string, config: PlatformConfig, sessionId?: string): Promise<{
        platformId: string;
        rtmpUrl?: string;
        enabled: boolean;
        configured: boolean;
    }>;
    /**
     * Toggle platform enabled state for a session
     */
    togglePlatform(platformId: string, enabled: boolean, sessionId?: string): Promise<void>;
    /**
     * Get available radio tracks
     */
    getRadioTracks(): Promise<RadioTrack[]>;
    /**
     * Get radio configuration for a session
     */
    getRadioConfig(sessionId?: string): Promise<RadioState>;
    /**
     * Create or update radio configuration
     */
    setRadioConfig(config: RadioConfig, sessionId?: string): Promise<RadioState>;
    /**
     * Send a live control command to the radio
     */
    controlRadio(action: 'toggleTrack' | 'toggleEffect' | 'setAutoDJMode' | 'setVolume' | 'setBackground', payload: Record<string, unknown>, sessionId?: string): Promise<RadioState>;
    /**
     * Create and queue an alert
     */
    createAlert(config: {
        eventType: 'follow' | 'subscribe' | 'donation' | 'raid' | 'bits' | 'custom';
        message: string;
        username?: string;
        amount?: string;
        image?: string;
        sound?: {
            src: string;
            volume: number;
        };
        duration?: number;
        priority?: number;
        variant?: 'popup' | 'banner' | 'corner' | 'fullscreen';
    }, sessionId?: string): Promise<{
        id: string;
        eventType: string;
        message: string;
        status: string;
        createdAt: string;
    }>;
    /**
     * Control the alert queue (skip, pause, resume, clear)
     */
    controlAlerts(action: 'skip' | 'pause' | 'resume' | 'clear', sessionId?: string): Promise<void>;
    /**
     * Get alert queue status
     */
    getAlerts(sessionId?: string): Promise<{
        queue: Array<{
            id: string;
            eventType: string;
            message: string;
            status: string;
        }>;
        isPaused: boolean;
        currentAlert?: {
            id: string;
            eventType: string;
        };
    }>;
    /**
     * Transition to a scene with optional transition effect
     */
    transitionToScene(sceneId: string, transition?: {
        type?: 'cut' | 'fade' | 'slide' | 'wipe' | 'zoom' | 'blur' | 'stinger';
        duration?: number;
        direction?: 'left' | 'right' | 'up' | 'down';
        easing?: string;
        stingerUrl?: string;
    }, sessionId?: string): Promise<{
        previousScene?: string;
        currentScene: string;
    }>;
    /**
     * Get all scenes
     */
    getScenes(sessionId?: string): Promise<Array<{
        id: string;
        name: string;
        isActive: boolean;
        graphicIds: string[];
    }>>;
    /**
     * Get available templates
     */
    getTemplates(filters?: {
        category?: string;
        type?: string;
    }): Promise<Array<{
        id: string;
        name: string;
        category: string;
        type: string;
        description?: string;
        thumbnail?: string;
    }>>;
    /**
     * Apply a template to create a graphic
     */
    applyTemplate(templateId: string, customizations?: {
        title?: string;
        subtitle?: string;
        content?: string;
        position?: {
            x: number;
            y: number;
        };
        visible?: boolean;
    }, sessionId?: string): Promise<{
        id: string;
        type: string;
        name?: string;
    }>;
    /**
     * Get AI-driven overlay suggestions based on context
     */
    getOverlaySuggestions(context: {
        contentType?: string;
        mood?: string;
        currentScene?: string;
        query?: string;
    }): Promise<Array<{
        templateId: string;
        templateName: string;
        reason: string;
        priority: 'high' | 'medium' | 'low';
        category: string;
    }>>;
    /**
     * Generate suggestions based on content type and mood
     */
    private generateSuggestions;
    /**
     * List available ad configurations
     */
    listAds(sessionId?: string): Promise<Array<{
        id: string;
        name: string;
        layout: string;
        duration: number;
        sponsorName?: string;
    }>>;
    /**
     * Trigger an ad break
     */
    triggerAdBreak(adId: string, options?: {
        duration?: number;
    }, sessionId?: string): Promise<{
        graphicId: string;
        layout: string;
        duration: number;
    }>;
    /**
     * Dismiss the current ad break
     */
    dismissAdBreak(sessionId?: string): Promise<{
        dismissed: boolean;
    }>;
    /**
     * Schedule an ad break for a specific time
     */
    scheduleAdBreak(adId: string, startTime: string, sessionId?: string): Promise<{
        id: string;
        adId: string;
        startTime: string;
    }>;
    private setupWsHandlers;
    private handleWsMessage;
    private initSessionState;
    private updateSessionState;
    private updatePlatformStatus;
    /**
     * Get recent chat messages for the bound session.
     */
    getChatMessages(options?: {
        limit?: number;
        platform?: string;
    }, sessionId?: string): Promise<{
        sessionId: string;
        messages: unknown[];
        count: number;
    }>;
    /**
     * Send a message to chat.
     */
    sendChatMessage(message: string, platform?: string, sessionId?: string): Promise<{
        sent: boolean;
        sessionId: string;
        platform: string;
    }>;
    /**
     * Get chat ingestion status.
     */
    getChatStatus(sessionId?: string): Promise<{
        sessionId: string;
        active: boolean;
        platforms: Record<string, unknown>;
    }>;
    /**
     * Start chat ingestion for platforms.
     */
    startChat(platforms: Array<{
        platform: string;
        channelId: string;
        credentials?: Record<string, string>;
    }>, sessionId?: string): Promise<{
        success: boolean;
        sessionId: string;
        platforms: string[];
    }>;
    /**
     * Stop chat ingestion.
     */
    stopChat(sessionId?: string): Promise<{
        success: boolean;
        sessionId: string;
    }>;
}
//# sourceMappingURL=StreamControlService.d.ts.map