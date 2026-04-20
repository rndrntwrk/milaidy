/**
 * WebSocket client used by the background service worker to talk to the
 * local Milady / LifeOps agent.
 *
 * TODO(lifeops-browser-extension): no agent-side WebSocket handler for
 * `ws://127.0.0.1:31339/ext` exists today. Until one is added, this
 * channel reconnects forever and every `send()` buffers or drops. Two
 * resolutions are on the table, neither done:
 *
 *   (a) Add a WebSocket upgrade route in the app-lifeops runtime.
 *   (b) Switch this client to either REST
 *       (`/api/lifeops/browser/companions/sync`, which the older
 *       `eliza/apps/app-lifeops/extensions/lifeops-browser/` already
 *       uses) or Chrome native-messaging (hence the file name).
 *
 * The module is kept behaviorally correct in isolation so the decision
 * can be made without churn.
 */

import { createLogger } from "../logger.js";
import type { InboundMessage, OutboundMessage } from "../types.js";

const log = createLogger("agent-ws");

export interface AgentChannelOptions {
  readonly url: string;
  readonly onMessage?: (message: InboundMessage) => void;
}

export class AgentChannel {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending: OutboundMessage[] = [];
  private url: string;
  private readonly onMessage: ((message: InboundMessage) => void) | undefined;
  private closed = false;

  constructor(options: AgentChannelOptions) {
    this.url = options.url;
    this.onMessage = options.onMessage;
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  setUrl(url: string): void {
    if (url === this.url) {
      return;
    }
    this.url = url;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (!this.closed) {
      this.connect();
    }
  }

  send(message: OutboundMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    this.pending.push(message);
  }

  private connect(): void {
    if (this.closed) {
      return;
    }
    log.info("connecting", { url: this.url });
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      log.info("connected", { url: this.url });
      const drain = this.pending.splice(0, this.pending.length);
      for (const message of drain) {
        socket.send(JSON.stringify(message));
      }
    });

    socket.addEventListener("message", (event) => {
      const parsed = parseInbound(event.data);
      if (!parsed) {
        log.warn("received unparseable payload");
        return;
      }
      this.onMessage?.(parsed);
    });

    socket.addEventListener("close", (event) => {
      log.warn("closed", { code: event.code, reason: event.reason });
      this.socket = null;
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      log.warn("socket error");
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5_000);
  }
}

function parseInbound(raw: unknown): InboundMessage | null {
  if (typeof raw !== "string") {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const type = (value as { type?: unknown }).type;
  if (type === "ack" || type === "ping") {
    return { type } as InboundMessage;
  }
  return null;
}
