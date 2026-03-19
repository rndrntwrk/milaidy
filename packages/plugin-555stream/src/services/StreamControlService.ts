/**
 * StreamControlService
 *
 * Core service for 555stream control. Manages:
 * - HTTP client for Agent API
 * - WebSocket connection for real-time updates
 * - Session state caching
 */

import type { IAgentRuntime, Service } from '../types/index.js';
import { HttpClient } from '../lib/httpClient.js';
import { WsClient } from '../lib/wsClient.js';
import {
  approveRequest,
  listPendingApprovals,
  rejectRequest,
} from '../routes/approvals.js';
import {
  describeAgentAuthSource,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from '../lib/agentAuth.js';
import { resolveStream555BaseUrl } from '../lib/baseUrl.js';
import type {
  Stream555Config,
  Session,
  SessionState,
  HealthcheckResult,
  Stream555RuntimeState,
  WsServerMessage,
  ProductionState,
  PlatformStatus,
  StreamInput,
  StreamOptions,
  StreamStartResult,
  StreamStopResult,
  StreamStatus,
  FallbackResult,
  StudioState,
  LayoutConfig,
  GraphicConfig,
  Graphic,
  SourceConfig,
  SourceData,
  GuestInvite,
  GuestData,
  UploadResult,
  VideoAsset,
  PlatformConfig,
  UserSettings,
  RadioConfig,
  RadioTrack,
  RadioState,
  Source,
  AppCatalogResponse,
  AppStreamDescriptor,
  Approval,
} from '../types/index.js';

const STREAM555_CHANNEL_RUNTIME_SPECS = [
  {
    enabledKey: 'STREAM555_DEST_PUMPFUN_ENABLED',
    urlKey: 'STREAM555_DEST_PUMPFUN_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_PUMPFUN_STREAM_KEY',
  },
  {
    enabledKey: 'STREAM555_DEST_X_ENABLED',
    urlKey: 'STREAM555_DEST_X_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_X_STREAM_KEY',
  },
  {
    enabledKey: 'STREAM555_DEST_TWITCH_ENABLED',
    urlKey: 'STREAM555_DEST_TWITCH_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_TWITCH_STREAM_KEY',
  },
  {
    enabledKey: 'STREAM555_DEST_KICK_ENABLED',
    urlKey: 'STREAM555_DEST_KICK_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_KICK_STREAM_KEY',
  },
  {
    enabledKey: 'STREAM555_DEST_YOUTUBE_ENABLED',
    urlKey: 'STREAM555_DEST_YOUTUBE_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_YOUTUBE_STREAM_KEY',
  },
  {
    enabledKey: 'STREAM555_DEST_FACEBOOK_ENABLED',
    urlKey: 'STREAM555_DEST_FACEBOOK_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_FACEBOOK_STREAM_KEY',
  },
  {
    enabledKey: 'STREAM555_DEST_CUSTOM_ENABLED',
    urlKey: 'STREAM555_DEST_CUSTOM_RTMP_URL',
    streamKeyKey: 'STREAM555_DEST_CUSTOM_STREAM_KEY',
  },
] as const;

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
    case 'enabled':
      return true;
    default:
      return false;
  }
}

function deriveAgentWsUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = parsed.pathname.replace(/\/+$/g, '');
  if (normalizedPath.endsWith('/api/agent/v1')) {
    parsed.pathname = `${normalizedPath}/ws`;
  } else if (!normalizedPath || normalizedPath === '/') {
    parsed.pathname = '/api/agent/v1/ws';
  } else {
    parsed.pathname = `${normalizedPath}/api/agent/v1/ws`;
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export class StreamControlService implements Service {
  static serviceType = 'stream555';

  static async start(runtime: IAgentRuntime): Promise<StreamControlService> {
    const service = new StreamControlService();
    await service.initialize(runtime);
    return service;
  }

  private runtime: IAgentRuntime | null = null;
  private config: Stream555Config | null = null;
  private httpClient: HttpClient | null = null;
  private wsClient: WsClient | null = null;
  private sessionState: Map<string, SessionState> = new Map();
  private boundSessionId: string | null = null;
  private lastWsError: string | null = null;

  /**
   * Get service type identifier
   */
  get serviceType(): string {
    return StreamControlService.serviceType;
  }

  /**
   * Initialize the service
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    const baseUrl = resolveStream555BaseUrl(runtime.agentId?.toString());
    const agentToken =
      baseUrl && baseUrl.trim().length > 0
        ? await resolveAgentBearer(baseUrl)
        : undefined;

    if (!agentToken) {
      throw new Error(
        '[555stream] Missing required configuration. ' +
        'Set one of STREAM555_PUBLIC_BASE_URL / STREAM555_INTERNAL_BASE_URL (or legacy STREAM555_BASE_URL) and one of STREAM555_AGENT_API_KEY / STREAM555_AGENT_TOKEN.'
      );
    }

    this.config = {
      baseUrl,
      agentToken,
      defaultSessionId: process.env.STREAM555_DEFAULT_SESSION_ID,
      requireApprovals: process.env.STREAM555_REQUIRE_APPROVALS !== 'false',
    };

    // Initialize HTTP client
    this.httpClient = new HttpClient({
      baseUrl: this.config.baseUrl,
      token: this.config.agentToken,
      tokenProvider: () => resolveAgentBearer(this.config?.baseUrl ?? baseUrl),
    });

    // Initialize WebSocket client
    const wsUrl = deriveAgentWsUrl(this.config.baseUrl);

    this.wsClient = new WsClient({
      url: wsUrl,
      token: this.config.agentToken,
      tokenProvider: () => resolveAgentBearer(this.config?.baseUrl ?? baseUrl),
    });
    this.lastWsError = null;

    // Set up WebSocket message handlers
    this.setupWsHandlers();

    console.log('[555stream] Service initialized');
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    this.sessionState.clear();
    this.boundSessionId = null;
    this.lastWsError = null;
    this.wsClient = null;
    this.httpClient = null;
    this.config = null;
    this.runtime = null;
    console.log('[555stream] Service stopped');
  }

  /**
   * Perform healthcheck against 555stream API
   */
  async healthcheck(): Promise<HealthcheckResult> {
    const result: HealthcheckResult = {
      allPassed: false,
      checks: {
        apiReachable: { passed: false, message: 'Not checked' },
        authValid: { passed: false, message: 'Not checked' },
        wsConnectable: { passed: false, message: 'Not checked' },
      },
    };

    // Check 1: API reachable
    if (this.httpClient) {
      const healthResult = await this.httpClient.healthcheck();
      result.checks.apiReachable = {
        passed: healthResult.reachable,
        message: healthResult.reachable ? 'API is reachable' : (healthResult.error || 'API unreachable'),
        latencyMs: healthResult.latencyMs,
      };
    }

    // Check 2: Auth valid (try to get sessions list)
    if (result.checks.apiReachable.passed && this.httpClient) {
      const start = Date.now();
      const response = await this.httpClient.get('/api/agent/v1/sessions');
      result.checks.authValid = {
        passed: response.success,
        message: response.success ? 'Authentication valid' : (response.error || 'Auth failed'),
        latencyMs: Date.now() - start,
      };
    }

    // Check 3: WebSocket connectable
    if (result.checks.authValid.passed && this.wsClient) {
      try {
        const start = Date.now();
        await this.wsClient.connect();
        result.checks.wsConnectable = {
          passed: true,
          message: 'WebSocket connected',
          latencyMs: Date.now() - start,
        };
      } catch (error) {
        this.wsClient.disconnect();
        result.checks.wsConnectable = {
          passed: false,
          message: (error as Error).message,
        };
      }
    }

    // Check 4: Session accessible (if default session configured)
    if (result.checks.wsConnectable.passed && this.config?.defaultSessionId && this.wsClient) {
      try {
        const start = Date.now();
        await this.wsClient.bind(this.config.defaultSessionId);
        result.checks.sessionAccessible = {
          passed: true,
          message: `Bound to session ${this.config.defaultSessionId}`,
          latencyMs: Date.now() - start,
        };
        this.boundSessionId = this.config.defaultSessionId;
      } catch (error) {
        result.checks.sessionAccessible = {
          passed: false,
          message: (error as Error).message,
        };
      }
    }

    // Overall pass if all required checks pass
    result.allPassed =
      result.checks.apiReachable.passed &&
      result.checks.authValid.passed;

    return result;
  }

  getRuntimeState(): Stream555RuntimeState {
    const channels = STREAM555_CHANNEL_RUNTIME_SPECS.map((spec) => {
      const enabled = parseBooleanEnv(process.env[spec.enabledKey]);
      const urlSet = Boolean(process.env[spec.urlKey]?.trim());
      const streamKeySet = Boolean(process.env[spec.streamKeyKey]?.trim());
      return {
        enabled,
        streamKeySet,
        ready: enabled && urlSet && streamKeySet,
      };
    });

    const channelsSaved = channels.filter((channel) => channel.streamKeySet).length;
    const channelsEnabled = channels.filter((channel) => channel.enabled).length;
    const channelsReady = channels.filter((channel) => channel.ready).length;
    const warnings: string[] = [];
    const errors: string[] = [];

    const baseUrlConfigured = Boolean(this.config?.baseUrl?.trim());
    const authConfigured = isAgentAuthConfigured();
    const wsState = this.wsClient?.getState() ?? 'disconnected';

    if (!baseUrlConfigured) {
      errors.push('stream base URL not configured');
    }
    if (!authConfigured) {
      errors.push('stream authentication not configured');
    }
    if (this.lastWsError) {
      errors.push(`agent websocket error: ${this.lastWsError}`);
    } else if (wsState === 'error') {
      errors.push('agent websocket entered an error state');
    }
    if (channelsEnabled > 0 && channelsReady < channelsEnabled) {
      warnings.push('one or more enabled channels are missing RTMP URL or stream key');
    }
    if (channelsEnabled === 0 && channelsSaved > 0) {
      warnings.push('channel credentials are saved but no channels are enabled');
    }

    return {
      loaded: Boolean(this.config && this.httpClient && this.wsClient),
      baseUrlConfigured,
      authenticated: Boolean(this.config?.agentToken?.trim()) && authConfigured,
      authConfigured,
      authSource: describeAgentAuthSource(),
      wsState,
      lastWsError: this.lastWsError,
      sessionBound: Boolean(this.boundSessionId),
      channelsSaved,
      channelsEnabled,
      channelsReady,
      warnings,
      errors,
    };
  }

  /**
   * Create or resume a session
   */
  async createOrResumeSession(sessionId?: string): Promise<Session> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.post<Session>(
      '/api/agent/v1/sessions',
      sessionId ? { sessionId } : {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create/resume session');
    }

    // Initialize state cache for this session
    this.initSessionState(response.data);
    this.boundSessionId = response.data.sessionId;

    return response.data;
  }

  /**
   * Bind WebSocket to a session
   */
  async bindWebSocket(sessionId: string): Promise<void> {
    if (!this.wsClient) {
      throw new Error('[555stream] Service not initialized');
    }

    try {
      // Connect if not already connected
      if (this.wsClient.getState() !== 'connected') {
        await this.wsClient.connect();
      }

      // Bind to session
      await this.wsClient.bind(sessionId);
      this.boundSessionId = sessionId;

      console.log(`[555stream] Bound to session ${sessionId}`);
    } catch (error) {
      this.wsClient.disconnect();
      throw error;
    }
  }

  /**
   * Get cached session state
   */
  getState(sessionId?: string): SessionState | null {
    const id = sessionId || this.boundSessionId;
    if (!id) return null;
    return this.sessionState.get(id) || null;
  }

  /**
   * Get all cached session states
   */
  getAllStates(): Map<string, SessionState> {
    return new Map(this.sessionState);
  }

  /**
   * Get bound session ID
   */
  getBoundSessionId(): string | null {
    return this.boundSessionId;
  }

  /**
   * Check if service is ready (initialized, connected, bound)
   */
  isReady(): boolean {
    return !!(
      this.httpClient &&
      this.boundSessionId
    );
  }

  /**
   * Get configuration
   */
  getConfig(): Stream555Config | null {
    return this.config;
  }

  /**
   * List pending operator approvals owned by the stream plugin.
   */
  listPendingApprovals(): Approval[] {
    return listPendingApprovals();
  }

  /**
   * Resolve a plugin-owned approval request.
   */
  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    resolvedBy?: string,
  ): boolean {
    const approval =
      decision === 'approved'
        ? approveRequest(approvalId, resolvedBy)
        : rejectRequest(approvalId, resolvedBy);
    return Boolean(approval);
  }

  /**
   * Patch production state via HTTP
   */
  async patchState(patch: Partial<ProductionState>, sessionId?: string): Promise<ProductionState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.patch<{ productionState: ProductionState }>(
      `/api/agent/v1/sessions/${id}/state`,
      { patch }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to patch state');
    }

    return response.data.productionState;
  }

  /**
   * Get session details via HTTP
   */
  async getSession(sessionId?: string): Promise<Session> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session specified');
    }

    const response = await this.httpClient.get<Session>(
      `/api/agent/v1/sessions/${id}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get session');
    }

    return response.data;
  }

  // ==========================================
  // Stream Control Methods
  // ==========================================

  /**
   * List app-stream descriptors available to the agent.
   */
  async listApps(options?: { forceRefresh?: boolean }): Promise<AppCatalogResponse> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const forceRefresh = options?.forceRefresh ? '?forceRefresh=true' : '';
    const response = await this.httpClient.get<AppCatalogResponse>(`/api/agent/v1/apps${forceRefresh}`);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to list apps');
    }

    return response.data;
  }

  /**
   * Resolve an app descriptor by exact name or known alias.
   */
  async resolveAppDescriptor(appNameOrAlias: string, options?: { forceRefresh?: boolean }): Promise<AppStreamDescriptor | null> {
    const query = String(appNameOrAlias || '').trim().toLowerCase();
    if (!query) return null;

    const catalog = await this.listApps(options);
    return catalog.apps.find((app) => {
      const names = [
        app.name,
        ...(Array.isArray(app.aliases) ? app.aliases : []),
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim().toLowerCase());
      return names.includes(query);
    }) || null;
  }

  /**
   * Start streaming
   */
  async startStream(
    input: StreamInput,
    options?: StreamOptions,
    sources?: Source[],
    sessionId?: string
  ): Promise<StreamStartResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<StreamStartResult>(
      `/api/agent/v1/sessions/${id}/stream/start`,
      { input, options, sources }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to start stream');
    }

    return response.data;
  }

  /**
   * Stop streaming
   */
  async stopStream(sessionId?: string): Promise<StreamStopResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<StreamStopResult>(
      `/api/agent/v1/sessions/${id}/stream/stop`,
      {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to stop stream');
    }

    return response.data;
  }

  /**
   * Trigger server-side fallback capture
   */
  async fallbackStream(reason?: string, sessionId?: string): Promise<FallbackResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<FallbackResult>(
      `/api/agent/v1/sessions/${id}/stream/fallback`,
      { reason }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to start fallback');
    }

    return response.data;
  }

  /**
   * Get current stream status
   */
  async getStreamStatus(sessionId?: string): Promise<StreamStatus> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<StreamStatus>(
      `/api/agent/v1/sessions/${id}/stream/status`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get stream status');
    }

    return response.data;
  }

  // ==========================================
  // Studio Methods
  // ==========================================

  /**
   * Get studio state (scenes, layouts, graphics)
   */
  async getStudio(sessionId?: string): Promise<StudioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<StudioState>(
      `/api/agent/v1/sessions/${id}/studio`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get studio state');
    }

    return response.data;
  }

  /**
   * Update layout for a scene
   */
  async setLayout(sceneId: string, layout: LayoutConfig, sessionId?: string): Promise<LayoutConfig> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.put<{ sceneId: string; layout: LayoutConfig }>(
      `/api/agent/v1/sessions/${id}/studio/layout/${sceneId}`,
      layout
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to set layout');
    }

    return response.data.layout;
  }

  /**
   * Set the active scene
   */
  async setActiveScene(sceneId: string, sessionId?: string): Promise<string> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ activeScene: string }>(
      `/api/agent/v1/sessions/${id}/studio/scene/active`,
      { sceneId }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to set active scene');
    }

    return response.data.activeScene;
  }

  /**
   * Get all graphics
   */
  async getGraphics(sessionId?: string): Promise<Graphic[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ graphics: Graphic[] }>(
      `/api/agent/v1/sessions/${id}/studio/graphics`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get graphics');
    }

    return response.data.graphics;
  }

  /**
   * Create a new graphic
   */
  async createGraphic(graphic: GraphicConfig, sessionId?: string): Promise<Graphic> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ graphic: Graphic }>(
      `/api/agent/v1/sessions/${id}/studio/graphics`,
      graphic
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create graphic');
    }

    return response.data.graphic;
  }

  /**
   * Update an existing graphic
   */
  async updateGraphic(
    graphicId: string,
    updates: Partial<GraphicConfig>,
    sessionId?: string
  ): Promise<Graphic> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.put<{ graphic: Graphic }>(
      `/api/agent/v1/sessions/${id}/studio/graphics/${graphicId}`,
      updates
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update graphic');
    }

    return response.data.graphic;
  }

  /**
   * Delete a graphic
   */
  async deleteGraphic(graphicId: string, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/sessions/${id}/studio/graphics/${graphicId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete graphic');
    }
  }

  // ==========================================
  // Source Methods
  // ==========================================

  /**
   * Get all sources for a session
   */
  async getSources(sessionId?: string): Promise<SourceData[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ sources: SourceData[] }>(
      `/api/agent/v1/sessions/${id}/sources`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get sources');
    }

    return response.data.sources;
  }

  /**
   * Create a new source
   */
  async createSource(source: SourceConfig, sessionId?: string): Promise<SourceData> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ source: SourceData }>(
      `/api/agent/v1/sessions/${id}/sources`,
      source
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create source');
    }

    return response.data.source;
  }

  /**
   * Update a source
   */
  async updateSource(
    sourceId: string,
    updates: Partial<SourceConfig>,
    sessionId?: string
  ): Promise<SourceData> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.patch<{ source: SourceData }>(
      `/api/agent/v1/sessions/${id}/sources/${sourceId}`,
      updates
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update source');
    }

    return response.data.source;
  }

  /**
   * Delete a source
   */
  async deleteSource(sourceId: string, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/sessions/${id}/sources/${sourceId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete source');
    }
  }

  // ==========================================
  // Guest Methods
  // ==========================================

  /**
   * Get all guests for a session
   */
  async getGuests(sessionId?: string): Promise<GuestData[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ guests: GuestData[] }>(
      `/api/agent/v1/sessions/${id}/guests`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get guests');
    }

    return response.data.guests;
  }

  /**
   * Create a guest invite
   */
  async createGuestInvite(label?: string, sessionId?: string): Promise<GuestInvite> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<GuestInvite>(
      `/api/agent/v1/sessions/${id}/guests/invites`,
      { label }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create guest invite');
    }

    return response.data;
  }

  /**
   * Remove/revoke a guest
   */
  async removeGuest(guestId: string, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/sessions/${id}/guests/${guestId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to remove guest');
    }
  }

  // ==========================================
  // Media Methods
  // ==========================================

  /**
   * Upload an image file from URL
   * Note: For file uploads, use multipart form-data directly
   */
  async uploadImageFromUrl(imageUrl: string): Promise<UploadResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const blob = await imageResponse.blob();
    const filename = imageUrl.split('/').pop() || 'image.jpg';

    // Create form data
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await this.httpClient.postFormData<UploadResult>(
      '/api/agent/v1/uploads/image',
      formData
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload image');
    }

    return response.data;
  }

  /**
   * Upload a video file from URL
   * Note: For file uploads, use multipart form-data directly
   */
  async uploadVideoFromUrl(videoUrl: string): Promise<UploadResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    // Fetch the video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
    }

    const blob = await videoResponse.blob();
    const filename = videoUrl.split('/').pop() || 'video.mp4';

    // Create form data
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await this.httpClient.postFormData<UploadResult>(
      '/api/agent/v1/uploads/video',
      formData
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload video');
    }

    return response.data;
  }

  /**
   * Create a video asset from a URL (HLS or direct)
   */
  async addVideoUrl(url: string, name?: string): Promise<VideoAsset> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.post<VideoAsset>(
      '/api/agent/v1/videos/add-url',
      { url, name }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to add video URL');
    }

    return response.data;
  }

  /**
   * Get video asset details
   */
  async getVideo(videoId: string): Promise<VideoAsset> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<VideoAsset>(
      `/api/agent/v1/videos/${videoId}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get video');
    }

    return response.data;
  }

  /**
   * Delete a video asset
   */
  async deleteVideo(videoId: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/videos/${videoId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete video');
    }
  }

  /**
   * List all video assets
   */
  async listVideos(limit = 50, offset = 0): Promise<{ videos: VideoAsset[]; total: number }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<{ videos: VideoAsset[]; total: number }>(
      `/api/agent/v1/videos?limit=${limit}&offset=${offset}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to list videos');
    }

    return response.data;
  }

  // ==========================================
  // Platform Methods
  // ==========================================

  /**
   * Get user settings (platforms without stream keys)
   */
  async getSettings(): Promise<UserSettings> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<UserSettings>(
      '/api/agent/v1/settings'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get settings');
    }

    return response.data;
  }

  /**
   * Update platform configuration
   */
  async updatePlatform(
    platformId: string,
    config: PlatformConfig,
    sessionId?: string
  ): Promise<{ platformId: string; rtmpUrl?: string; enabled: boolean; configured: boolean }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const headers: Record<string, string> = {};
    if (sessionId || this.boundSessionId) {
      headers['x-session-id'] = sessionId || this.boundSessionId || '';
    }

    const response = await this.httpClient.put<{
      platformId: string;
      rtmpUrl?: string;
      enabled: boolean;
      configured: boolean;
    }>(
      `/api/agent/v1/platforms/${platformId}`,
      config,
      { headers }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update platform');
    }

    return response.data;
  }

  /**
   * Toggle platform enabled state for a session
   */
  async togglePlatform(platformId: string, enabled: boolean, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post(
      `/api/agent/v1/sessions/${id}/platforms/${platformId}/toggle`,
      { enabled }
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to toggle platform');
    }
  }

  // ==========================================
  // Radio Methods
  // ==========================================

  /**
   * Get available radio tracks
   */
  async getRadioTracks(): Promise<RadioTrack[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<{ tracks: RadioTrack[] }>(
      '/api/agent/v1/radio/tracks'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get radio tracks');
    }

    return response.data.tracks;
  }

  /**
   * Get radio configuration for a session
   */
  async getRadioConfig(sessionId?: string): Promise<RadioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<RadioState>(
      `/api/agent/v1/radio/${id}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get radio config');
    }

    return response.data;
  }

  /**
   * Create or update radio configuration
   */
  async setRadioConfig(config: RadioConfig, sessionId?: string): Promise<RadioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<RadioState>(
      `/api/agent/v1/radio/${id}`,
      config
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to set radio config');
    }

    return response.data;
  }

  /**
   * Send a live control command to the radio
   */
  async controlRadio(
    action: 'toggleTrack' | 'toggleEffect' | 'setAutoDJMode' | 'setVolume' | 'setBackground',
    payload: Record<string, unknown>,
    sessionId?: string
  ): Promise<RadioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ success: boolean; state: RadioState }>(
      `/api/agent/v1/radio/${id}/control`,
      { action, payload }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to control radio');
    }

    return response.data.state;
  }

  // ==========================================
  // Alert Methods
  // ==========================================

  /**
   * Create and queue an alert
   */
  async createAlert(
    config: {
      eventType: 'follow' | 'subscribe' | 'donation' | 'raid' | 'bits' | 'custom';
      message: string;
      username?: string;
      amount?: string;
      image?: string;
      sound?: { src: string; volume: number };
      duration?: number;
      priority?: number;
      variant?: 'popup' | 'banner' | 'corner' | 'fullscreen';
    },
    sessionId?: string
  ): Promise<{ id: string; eventType: string; message: string; status: string; createdAt: string }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ alert: { id: string; eventType: string; message: string; status: string; createdAt: string } }>(
      `/api/agent/v1/sessions/${id}/studio/alerts`,
      config
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create alert');
    }

    return response.data.alert;
  }

  /**
   * Control the alert queue (skip, pause, resume, clear)
   */
  async controlAlerts(
    action: 'skip' | 'pause' | 'resume' | 'clear',
    sessionId?: string
  ): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post(
      `/api/agent/v1/sessions/${id}/studio/alerts/${action}`,
      {}
    );

    if (!response.success) {
      throw new Error(response.error || `Failed to ${action} alerts`);
    }
  }

  /**
   * Get alert queue status
   */
  async getAlerts(sessionId?: string): Promise<{
    queue: Array<{ id: string; eventType: string; message: string; status: string }>;
    isPaused: boolean;
    currentAlert?: { id: string; eventType: string };
  }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{
      queue: Array<{ id: string; eventType: string; message: string; status: string }>;
      isPaused: boolean;
      currentAlert?: { id: string; eventType: string };
    }>(
      `/api/agent/v1/sessions/${id}/studio/alerts`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get alerts');
    }

    return response.data;
  }

  // ==========================================
  // Scene Transition Methods
  // ==========================================

  /**
   * Transition to a scene with optional transition effect
   */
  async transitionToScene(
    sceneId: string,
    transition?: {
      type?: 'cut' | 'fade' | 'slide' | 'wipe' | 'zoom' | 'blur' | 'stinger';
      duration?: number;
      direction?: 'left' | 'right' | 'up' | 'down';
      easing?: string;
      stingerUrl?: string;
    },
    sessionId?: string
  ): Promise<{ previousScene?: string; currentScene: string }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ previousScene?: string; currentScene: string }>(
      `/api/agent/v1/sessions/${id}/studio/scenes/transition`,
      { sceneId, transition }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to transition scene');
    }

    return response.data;
  }

  /**
   * Get all scenes
   */
  async getScenes(sessionId?: string): Promise<Array<{
    id: string;
    name: string;
    isActive: boolean;
    graphicIds: string[];
  }>> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{
      scenes: Array<{ id: string; name: string; isActive: boolean; graphicIds: string[] }>;
    }>(
      `/api/agent/v1/sessions/${id}/studio/scenes`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get scenes');
    }

    return response.data.scenes;
  }

  // ==========================================
  // Template Methods
  // ==========================================

  /**
   * Get available templates
   */
  async getTemplates(filters?: {
    category?: string;
    type?: string;
  }): Promise<Array<{
    id: string;
    name: string;
    category: string;
    type: string;
    description?: string;
    thumbnail?: string;
  }>> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const queryParams = new URLSearchParams();
    if (filters?.category) queryParams.set('category', filters.category);
    if (filters?.type) queryParams.set('type', filters.type);

    const queryString = queryParams.toString();
    const url = `/api/agent/v1/templates${queryString ? `?${queryString}` : ''}`;

    const response = await this.httpClient.get<{
      templates: Array<{
        id: string;
        name: string;
        category: string;
        type: string;
        description?: string;
        thumbnail?: string;
      }>;
    }>(url);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get templates');
    }

    return response.data.templates;
  }

  /**
   * Apply a template to create a graphic
   */
  async applyTemplate(
    templateId: string,
    customizations?: {
      title?: string;
      subtitle?: string;
      content?: string;
      position?: { x: number; y: number };
      visible?: boolean;
    },
    sessionId?: string
  ): Promise<{ id: string; type: string; name?: string }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{
      graphic: { id: string; type: string; name?: string };
    }>(
      `/api/agent/v1/sessions/${id}/studio/templates/${templateId}/apply`,
      customizations || {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to apply template');
    }

    return response.data.graphic;
  }

  // ==========================================
  // AI Suggestions Methods
  // ==========================================

  /**
   * Get AI-driven overlay suggestions based on context
   */
  async getOverlaySuggestions(context: {
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
  }>> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    // Get available templates first
    const templates = await this.getTemplates();

    // AI-driven suggestions based on context
    const suggestions = this.generateSuggestions(templates, context);

    return suggestions;
  }

  /**
   * Generate suggestions based on content type and mood
   */
  private generateSuggestions(
    templates: Array<{ id: string; name: string; category: string; type: string }>,
    context: { contentType?: string; mood?: string; currentScene?: string; query?: string }
  ): Array<{
    templateId: string;
    templateName: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
  }> {
    const suggestions: Array<{
      templateId: string;
      templateName: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
      category: string;
    }> = [];

    const contentType = context.contentType?.toLowerCase() || '';
    const mood = context.mood?.toLowerCase() || '';
    const query = context.query?.toLowerCase() || '';

    // Content type based suggestions
    const contentTypeMatches: Record<string, { categories: string[]; types: string[]; reason: string }> = {
      gaming: {
        categories: ['gaming', 'esports'],
        types: ['lowerThird', 'alert', 'countdown'],
        reason: 'Great for gaming streams with dynamic alerts and countdowns',
      },
      podcast: {
        categories: ['podcast', 'minimal', 'professional'],
        types: ['lowerThird', 'ticker'],
        reason: 'Clean, professional look for podcast content',
      },
      tutorial: {
        categories: ['education', 'minimal'],
        types: ['lowerThird', 'countdown'],
        reason: 'Clear overlays that don\'t distract from educational content',
      },
      music: {
        categories: ['music', 'minimal'],
        types: ['nowPlaying', 'lowerThird'],
        reason: 'Perfect for music streams with now playing info',
      },
      irl: {
        categories: ['minimal', 'social'],
        types: ['lowerThird', 'chatOverlay'],
        reason: 'Unobtrusive overlays for real-life streaming',
      },
    };

    // Mood based adjustments
    const moodMatches: Record<string, { categories: string[]; reason: string }> = {
      energetic: {
        categories: ['gaming', 'esports', 'vibrant'],
        reason: 'High-energy visuals to match the vibe',
      },
      chill: {
        categories: ['lofi', 'minimal', 'relaxed'],
        reason: 'Relaxed, easy-on-the-eyes overlays',
      },
      professional: {
        categories: ['corporate', 'news', 'minimal'],
        reason: 'Clean, professional appearance',
      },
      fun: {
        categories: ['gaming', 'social', 'colorful'],
        reason: 'Playful and engaging overlays',
      },
    };

    // Score each template
    for (const template of templates) {
      let score = 0;
      let reasons: string[] = [];

      const templateCat = template.category.toLowerCase();
      const templateType = template.type.toLowerCase();

      // Content type matching
      if (contentType && contentTypeMatches[contentType]) {
        const match = contentTypeMatches[contentType];
        if (match.categories.some(c => templateCat.includes(c))) {
          score += 3;
          reasons.push(match.reason);
        }
        if (match.types.some(t => templateType.includes(t))) {
          score += 2;
        }
      }

      // Mood matching
      if (mood && moodMatches[mood]) {
        const match = moodMatches[mood];
        if (match.categories.some(c => templateCat.includes(c))) {
          score += 2;
          if (!reasons.includes(match.reason)) {
            reasons.push(match.reason);
          }
        }
      }

      // Query matching (keyword search)
      if (query) {
        if (template.name.toLowerCase().includes(query) || templateCat.includes(query)) {
          score += 4;
          reasons.push('Matches your search');
        }
      }

      // Essential overlays get base score
      if (['lowerthird', 'alert'].includes(templateType)) {
        score += 1;
        if (reasons.length === 0) {
          reasons.push('Essential overlay for any stream');
        }
      }

      if (score > 0) {
        suggestions.push({
          templateId: template.id,
          templateName: template.name,
          reason: reasons[0] || 'Recommended overlay',
          priority: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low',
          category: template.category,
        });
      }
    }

    // Sort by priority and limit
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return suggestions.slice(0, 10);
  }

  // ==========================================
  // Ad Break Methods
  // ==========================================

  /**
   * List available ad configurations
   */
  async listAds(sessionId?: string): Promise<Array<{
    id: string;
    name: string;
    layout: string;
    duration: number;
    sponsorName?: string;
  }>> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{
      ads: Array<{
        id: string;
        name: string;
        layout: string;
        duration: number;
        sponsorName?: string;
      }>;
    }>(
      `/api/agent/v1/sessions/${id}/ads`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to list ads');
    }

    return response.data.ads;
  }

  /**
   * Trigger an ad break
   */
  async triggerAdBreak(
    adId: string,
    options?: { duration?: number },
    sessionId?: string
  ): Promise<{
    graphicId: string;
    layout: string;
    duration: number;
  }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{
      success: boolean;
      graphic: {
        id: string;
        content: {
          layout: string;
          duration: number;
        };
      };
    }>(
      `/api/agent/v1/sessions/${id}/ads/${adId}/trigger`,
      options || {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to trigger ad break');
    }

    return {
      graphicId: response.data.graphic.id,
      layout: response.data.graphic.content.layout,
      duration: response.data.graphic.content.duration,
    };
  }

  /**
   * Dismiss the current ad break
   */
  async dismissAdBreak(sessionId?: string): Promise<{ dismissed: boolean }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{
      success: boolean;
      dismissed: boolean;
    }>(
      `/api/agent/v1/sessions/${id}/ads/dismiss`,
      {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to dismiss ad break');
    }

    return { dismissed: response.data.dismissed };
  }

  /**
   * Schedule an ad break for a specific time
   */
  async scheduleAdBreak(
    adId: string,
    startTime: string,
    sessionId?: string
  ): Promise<{
    id: string;
    adId: string;
    startTime: string;
  }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{
      success: boolean;
      schedule: {
        id: string;
        adId: string;
        startTime: string;
      };
    }>(
      `/api/agent/v1/sessions/${id}/ads/schedule`,
      { adId, startTime }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to schedule ad break');
    }

    return response.data.schedule;
  }

  // ==========================================
  // Private Methods
  // ==========================================

  private setupWsHandlers(): void {
    if (!this.wsClient) return;

    this.wsClient.onMessage((message) => {
      this.handleWsMessage(message);
    });

    this.wsClient.onStateChange((state) => {
      console.log(`[555stream] WebSocket state: ${state}`);
      if (state === 'connected') {
        this.lastWsError = null;
      }
    });

    this.wsClient.onError((error) => {
      this.lastWsError = error.message;
      console.error('[555stream] WebSocket error:', error);
    });
  }

  private handleWsMessage(message: WsServerMessage): void {
    switch (message.type) {
      case 'bound':
        this.updateSessionState(message.sessionId, {
          productionState: message.productionState,
          sequence: message.sequence,
        });
        break;

      case 'state_update':
        this.updateSessionState(message.sessionId, {
          productionState: message.productionState,
          sequence: message.sequence,
        });
        break;

      case 'stream_status':
        this.updateSessionState(message.sessionId, {
          active: message.active,
          jobId: message.jobId,
          cfSessionId: message.cfSessionId,
        });
        break;

      case 'platform_status':
        this.updatePlatformStatus(message.sessionId, message.platformId, {
          platformId: message.platformId,
          enabled: message.enabled,
          status: message.status as PlatformStatus['status'],
          error: message.error,
        });
        break;

      case 'stats':
        // Handle both wrapped (message.payload) and unwrapped stats formats
        // Backend wraps stats in a payload object: { type: 'stats', sessionId, payload: { fps, kbps, duration } }
        const statsData = message.payload || message;
        this.updateSessionState(message.sessionId, {
          stats: {
            fps: statsData.fps?.toString(),
            kbps: statsData.kbps?.toString(),
            duration: statsData.duration,
          },
        });
        break;

      case 'error':
        console.error('[555stream] Server error:', message.error);
        break;
    }
  }

  private initSessionState(session: Session): void {
    this.sessionState.set(session.sessionId, {
      sessionId: session.sessionId,
      active: session.active,
      jobId: session.jobId,
      cfSessionId: session.cfSessionId,
      productionState: session.productionState,
      platforms: session.platforms || {},
      sequence: 0,
      lastUpdate: Date.now(),
    });
  }

  private updateSessionState(sessionId: string, updates: Partial<SessionState>): void {
    const current = this.sessionState.get(sessionId);
    if (current) {
      this.sessionState.set(sessionId, {
        ...current,
        ...updates,
        lastUpdate: Date.now(),
      });
    }
  }

  private updatePlatformStatus(sessionId: string, platformId: string, status: PlatformStatus): void {
    const current = this.sessionState.get(sessionId);
    if (current) {
      current.platforms[platformId] = status;
      current.lastUpdate = Date.now();
    }
  }

  // ==========================================
  // Chat Methods
  // ==========================================

  /**
   * Get recent chat messages for the bound session.
   */
  async getChatMessages(
    options?: { limit?: number; platform?: string },
    sessionId?: string
  ): Promise<{ sessionId: string; messages: unknown[]; count: number }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.platform) params.set('platform', options.platform);

    const qs = params.toString();
    const url = `/api/agent/v1/sessions/${id}/chat/messages${qs ? `?${qs}` : ''}`;

    const response = await this.httpClient.get<{ sessionId: string; messages: unknown[]; count: number }>(url);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get chat messages');
    }

    return response.data;
  }

  /**
   * Send a message to chat.
   */
  async sendChatMessage(
    message: string,
    platform?: string,
    sessionId?: string
  ): Promise<{ sent: boolean; sessionId: string; platform: string }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ sent: boolean; sessionId: string; platform: string }>(
      `/api/agent/v1/sessions/${id}/chat/send`,
      { message, platform: platform || undefined }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to send chat message');
    }

    return response.data;
  }

  /**
   * Get chat ingestion status.
   */
  async getChatStatus(
    sessionId?: string
  ): Promise<{ sessionId: string; active: boolean; platforms: Record<string, unknown> }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ sessionId: string; active: boolean; platforms: Record<string, unknown> }>(
      `/api/agent/v1/sessions/${id}/chat/status`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get chat status');
    }

    return response.data;
  }

  /**
   * Start chat ingestion for platforms.
   */
  async startChat(
    platforms: Array<{ platform: string; channelId: string; credentials?: Record<string, string> }>,
    sessionId?: string
  ): Promise<{ success: boolean; sessionId: string; platforms: string[] }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ success: boolean; sessionId: string; platforms: string[] }>(
      `/api/agent/v1/sessions/${id}/chat/start`,
      { platforms }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to start chat');
    }

    return response.data;
  }

  /**
   * Stop chat ingestion.
   */
  async stopChat(
    sessionId?: string
  ): Promise<{ success: boolean; sessionId: string }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ success: boolean; sessionId: string }>(
      `/api/agent/v1/sessions/${id}/chat/stop`,
      {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to stop chat');
    }

    return response.data;
  }
}
