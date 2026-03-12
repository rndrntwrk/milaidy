export declare const STREAM555_AGENT_TOKEN_ENV = "STREAM555_AGENT_TOKEN";
export declare const STREAM555_AGENT_API_KEY_ENV = "STREAM555_AGENT_API_KEY";
export declare const STREAM_API_BEARER_TOKEN_ENV = "STREAM_API_BEARER_TOKEN";
export declare const STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV = "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT";
export declare const STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV = "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS";
export declare function isAgentAuthConfigured(): boolean;
export declare function describeAgentAuthSource(): string;
export declare function invalidateExchangedAgentTokenCache(): void;
export declare function setActiveBearerToken(token: string): void;
export declare function resolveAgentBearer(baseUrl: string): Promise<string>;
//# sourceMappingURL=agentAuth.d.ts.map