/**
 * 555stream Plugin Types
 */
export interface IAgentRuntime {
    getService<T = unknown>(name: string): T | undefined;
    [key: string]: any;
}
export interface Memory {
    content?: {
        text?: string;
        [key: string]: any;
    };
    [key: string]: any;
}
export interface State {
    [key: string]: any;
}
export interface HandlerCallback {
    (response: {
        text: string;
        content?: {
            success: boolean;
            data?: any;
            error?: string;
        };
    }): void;
}
export interface ActionExample {
    user: string;
    content: {
        text: string;
        action?: string;
    };
}
export interface Action {
    name: string;
    description: string;
    similes?: string[];
    validate: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
    handler: (runtime: IAgentRuntime, message: Memory, state?: State, options?: Record<string, any>, callback?: HandlerCallback) => Promise<boolean>;
    examples?: ActionExample[][];
}
export interface Provider {
    name: string;
    description: string;
    get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}
export interface Route {
    path: string;
    type: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    handler: (req: Request, res: Response, runtime: IAgentRuntime) => Promise<Response>;
}
export interface Service {
    serviceType: string;
    initialize(runtime: IAgentRuntime): Promise<void>;
    stop?(): Promise<void>;
}
export interface Plugin {
    name: string;
    description: string;
    init?: (config: any, runtime: any) => Promise<void>;
    services?: any[];
    providers?: Provider[];
    actions?: Action[];
    routes?: Route[];
    schema?: any;
}
export interface Stream555Config {
    baseUrl: string;
    agentToken: string;
    defaultSessionId?: string;
    requireApprovals: boolean;
}
export interface Session {
    sessionId: string;
    resumed: boolean;
    active: boolean;
    jobId?: string;
    cfSessionId?: string;
    productionState: ProductionState;
    platforms: Record<string, PlatformStatus>;
}
export interface ProductionState {
    activeLayout: 'full' | 'split' | 'pip' | 'grid' | 'side-by-side';
    pipPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    cameraOn: boolean;
    screenOn: boolean;
    micOn: boolean;
    sources: Source[];
    graphics?: Graphic[];
    activeSceneId?: string;
}
export interface Source {
    id: string;
    type: 'camera' | 'screen' | 'guest' | 'media' | 'browser';
    label?: string;
    position?: number;
    muted?: boolean;
}
export interface Graphic {
    id: string;
    type: 'text' | 'image' | 'overlay';
    visible: boolean;
    content?: string;
    position?: {
        x: number;
        y: number;
    };
}
export interface PlatformStatus {
    platformId: string;
    enabled: boolean;
    status: 'idle' | 'connecting' | 'live' | 'error' | 'disconnected';
    error?: string;
}
export interface SessionState {
    sessionId: string;
    active: boolean;
    jobId?: string;
    cfSessionId?: string;
    productionState: ProductionState;
    platforms: Record<string, PlatformStatus>;
    stats?: StreamStats;
    sequence: number;
    lastUpdate: number;
}
export interface StreamStats {
    fps?: string;
    kbps?: string;
    duration?: string;
    viewers?: string;
}
export interface HealthcheckResult {
    allPassed: boolean;
    checks: {
        apiReachable: CheckResult;
        authValid: CheckResult;
        wsConnectable: CheckResult;
        sessionAccessible?: CheckResult;
    };
}
export interface CheckResult {
    passed: boolean;
    message: string;
    latencyMs?: number;
}
export interface Stream555RuntimeState {
    loaded: boolean;
    authenticated: boolean;
    authSource: string;
    sessionBound: boolean;
    channelsSaved: number;
    channelsEnabled: number;
    channelsReady: number;
    warnings: string[];
    errors: string[];
}
export type WsClientMessage = {
    type: 'bind';
    sessionId: string;
    token: string;
    clientId?: string;
} | {
    type: 'patch_state';
    sessionId: string;
    requestId: string;
    patch: Partial<ProductionState>;
} | {
    type: 'ping';
};
export type WsServerMessage = {
    type: 'bound';
    sessionId: string;
    productionState: ProductionState;
    sequence: number;
} | {
    type: 'state_update';
    sessionId: string;
    sequence: number;
    productionState: ProductionState;
} | {
    type: 'stream_status';
    sessionId: string;
    active: boolean;
    jobId?: string;
    cfSessionId?: string;
} | {
    type: 'platform_status';
    sessionId: string;
    platformId: string;
    status: string;
    enabled: boolean;
    error?: string;
} | {
    type: 'stats';
    sessionId: string;
    fps?: number;
    kbps?: number;
    duration?: string;
    payload?: {
        fps?: number;
        kbps?: number;
        duration?: string;
    };
} | {
    type: 'ack';
    requestId: string;
    sequence?: number;
} | {
    type: 'error';
    requestId?: string;
    error: string;
} | {
    type: 'pong';
};
export interface Approval {
    id: string;
    actionName: string;
    actionParams: Record<string, unknown>;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    createdAt: number;
    expiresAt: number;
    resolvedAt?: number;
    resolvedBy?: string;
}
export interface HttpClientOptions {
    baseUrl: string;
    token: string;
    tokenProvider?: () => Promise<string>;
    timeout?: number;
    maxRetries?: number;
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    requestId?: string;
}
export interface WsClientOptions {
    url: string;
    token: string;
    tokenProvider?: () => Promise<string>;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
}
export type WsEventHandler = (message: WsServerMessage) => void;
export type WsErrorHandler = (error: Error) => void;
export type WsStateHandler = (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
export interface StreamInput {
    type: 'camera' | 'screen' | 'whip' | 'browser' | 'capture' | 'website' | 'rtmp' | 'file' | 'radio' | 'lofi' | 'composition';
    url?: string;
    radioConfig?: RadioConfig;
}
export interface AppStreamRequirements {
    wrapperRequired?: boolean;
    wrapperProvided?: boolean;
    publicUrlRequired?: boolean;
    localhostAllowed?: boolean;
}
export interface AppViewerSpec {
    url?: string;
    postMessageAuth: boolean;
    sandbox?: string | null;
    embedParamKeys?: string[];
}
export interface AppStreamSpec {
    name: string;
    displayName?: string | null;
    category?: string | null;
    launchType?: string | null;
    viewer?: AppViewerSpec | null;
    requirements?: AppStreamRequirements;
}
export interface AppStreamDescriptor extends AppStreamSpec {
    specVersion?: string;
    aliases?: string[];
    viewer: AppViewerSpec & {
        url: string;
    };
    resolvedFrom?: string;
}
export interface AppCatalogResponse {
    apps: AppStreamDescriptor[];
    source: string;
    fetchedAt?: string;
    ttlMs?: number;
    requestId?: string;
}
export interface StreamOptions {
    framerate?: number;
    videoBitrate?: number;
    audioBitrate?: number;
    width?: number;
    height?: number;
    timeoutSeconds?: number;
    scene?: string;
    appName?: string;
    resolvedFrom?: string;
    app?: AppStreamSpec;
}
export interface StreamStartResult {
    jobId?: string;
    cfSessionId?: string;
    status: string;
    inputType: string;
    platforms?: string[];
    ingest?: {
        whip?: {
            url: string;
        };
        rtmps?: {
            url: string;
        };
        srt?: {
            url: string;
        };
    };
    playback?: {
        hls?: string;
        dash?: string;
    };
}
export interface StreamStopResult {
    stopped: boolean;
    wasActive: boolean;
    previousJobId?: string;
}
export interface StreamStatus {
    sessionId: string;
    active: boolean;
    jobId?: string;
    cfSessionId?: string;
    serverFallbackActive: boolean;
    startTime?: number;
    platforms: Record<string, {
        enabled: boolean;
        status: string;
        error?: string;
    }>;
    stats?: StreamStats;
    jobStatus?: {
        state: string;
        progress?: number;
        queueName?: string;
    };
}
export interface FallbackResult {
    success: boolean;
    jobId: string;
    message: string;
}
export interface StudioState {
    activeScene: string;
    scenes: Record<string, LayoutConfig>;
    graphics: Graphic[];
}
export interface LayoutConfig {
    layout?: string;
    positions?: Record<string, {
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
    [key: string]: unknown;
}
export interface GraphicConfig {
    type: 'text' | 'image' | 'overlay';
    content?: string;
    position?: {
        x: number;
        y: number;
    };
    visible?: boolean;
    [key: string]: unknown;
}
export interface SourceConfig {
    type: string;
    label?: string;
    deviceId?: string;
    deviceLabel?: string;
    metadata?: Record<string, unknown>;
}
export interface SourceData {
    id: string;
    type: string;
    label: string;
    deviceId?: string;
    deviceLabel?: string;
    status: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
}
export interface GuestInvite {
    inviteId: string;
    token: string;
    inviteUrl: string;
    label?: string;
}
export interface GuestData {
    id: string;
    label: string;
    status: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
}
export interface UploadResult {
    url: string;
    filename: string;
    originalName: string;
    size: number;
}
export interface VideoAsset {
    id: string;
    filename: string;
    proxyUrl: string;
    status: string;
    isHls: boolean;
    originalUrl?: string;
    hlsUrl?: string;
    cfVideoId?: string;
    createdAt?: string;
}
export interface PlatformConfig {
    rtmpUrl?: string;
    streamKey?: string;
    enabled?: boolean;
}
export interface PlatformSettings {
    platformId: string;
    rtmpUrl?: string;
    enabled: boolean;
    configured: boolean;
    updatedAt?: string;
}
export interface UserSettings {
    userId: string;
    platforms: PlatformSettings[];
}
export interface RadioConfig {
    autoDJMode?: string;
    activeTracks?: string[];
    activeEffects?: string[];
    volumes?: Record<string, number>;
    hlsBg?: string;
}
export interface RadioTrack {
    id: string;
    name: string;
    category: string;
}
export interface RadioState {
    sessionId: string;
    autoDJMode: string;
    activeTracks: string[];
    activeEffects: string[];
    volumes: Record<string, number>;
    hlsBg?: string;
    createdAt?: string;
    updatedAt?: string;
}
export interface RadioControlAction {
    action: 'toggleTrack' | 'toggleEffect' | 'setAutoDJMode' | 'setVolume' | 'setBackground';
    payload: Record<string, unknown>;
}
export type AdLayout = 'l-bar' | 'bottom-bar' | 'side-bar' | 'squeeze-all';
export interface AdPanel {
    id: string;
    placement: 'left' | 'right' | 'top' | 'bottom';
    size: {
        width: string | number;
        height: string | number;
    };
    backgroundColor?: string;
    imageUrl?: string;
    logoUrl?: string;
    text?: string;
    qrCodeUrl?: string;
    dataSourceId?: string;
    template?: string;
}
export interface AdMainContent {
    scale: number;
    position: string;
    borderRadius?: number;
    shadow?: boolean;
}
export interface AdConfig {
    id: string;
    name: string;
    layout: AdLayout;
    duration: number;
    mainContent: AdMainContent;
    panels: AdPanel[];
    sponsorId?: string;
    sponsorName?: string;
    showCountdown: boolean;
    onCompleteAction: 'hide' | 'repeat' | 'next';
    createdAt?: string;
    updatedAt?: string;
}
export interface AdBreakTriggerResult {
    graphicId: string;
    layout: AdLayout;
    duration: number;
}
export interface AdBreakSchedule {
    id: string;
    adId: string;
    startTime: string;
    createdAt?: string;
}
export interface AdMetrics {
    impressions: number;
    clicks: number;
    lastImpression?: string;
}
export interface Sponsor {
    id: string;
    name: string;
    logoUrl?: string;
    websiteUrl?: string;
    description?: string;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    createdAt?: string;
    updatedAt?: string;
}
export interface ChatMessage {
    id: string;
    platform: string;
    platformMessageId?: string;
    channelId?: string;
    user: {
        id: string;
        username: string;
        displayName: string;
        avatarUrl?: string | null;
        color?: string;
        badges?: Array<{
            type: string;
            label: string;
            imageUrl?: string | null;
        }>;
    };
    content: {
        text: string;
        emotes?: Array<{
            code: string;
            url: string;
            start: number;
            end: number;
        }>;
        isAction?: boolean;
    };
    metadata?: {
        timestamp: number;
        isModerator?: boolean;
        isSubscriber?: boolean;
        isReply?: boolean;
        replyToId?: string | null;
    };
    sessionId?: string;
}
export interface ChatStatus {
    sessionId: string;
    active: boolean;
    platforms: Record<string, {
        connected: boolean;
        connecting: boolean;
    }>;
}
export interface ChatPlatformConfig {
    platform: 'twitch' | 'kick' | 'pump';
    channelId: string;
    credentials?: {
        username?: string;
        oauthToken?: string;
    };
}
export interface ChatMessagesResult {
    sessionId: string;
    messages: ChatMessage[];
    count: number;
}
export interface ChatSendResult {
    sent: boolean;
    sessionId: string;
    platform: string;
}
export interface ChatStartResult {
    success: boolean;
    sessionId: string;
    platforms: string[];
}
//# sourceMappingURL=index.d.ts.map