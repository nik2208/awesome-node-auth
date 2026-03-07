import { randomUUID } from 'crypto';
import { AuthEventBus, AuthEventPayload } from '../events/auth-event-bus';
import { ITelemetryStore, TelemetryEvent } from '../interfaces/telemetry-store.interface';
import { IWebhookStore, OutgoingWebhookEvent } from '../interfaces/webhook-store.interface';
import { ISseDistributor } from '../interfaces/sse-distributor.interface';
import { SseManager, StreamEvent } from './sse-manager';
import { WebhookSender } from './webhook-sender';
import { SseNotifyRegistry } from './sse-notify.decorator';

/**
 * Options passed to {@link AuthTools}.
 */
export interface AuthToolsOptions {
  /**
   * Optional telemetry store.  When provided, every tracked event is also
   * persisted via `store.save()`.
   */
  telemetryStore?: ITelemetryStore;

  /**
   * Optional webhook store.  When provided, outgoing webhooks are dispatched
   * whenever an event is tracked.
   */
  webhookStore?: IWebhookStore;

  /**
   * When `true`, SSE streaming is enabled.  A `SseManager` instance will be
   * created and the `/tools/stream` endpoint will be available.
   * @default false
   */
  sse?: boolean;

  /**
   * Options forwarded to the `SseManager` constructor.
   */
  sseOptions?: {
    /** @default 30000 */
    heartbeatIntervalMs?: number;
    /** Distributor for cross-instance event synchronization. */
    distributor?: ISseDistributor;
    /** @default true */
    deduplicate?: boolean;
  };

  /**
   * Semantic version string attached to all outgoing webhook payloads.
   * @default '1'
   */
  webhookVersion?: string;
}

/**
 * Options for {@link AuthTools.track}.
 */
export interface TrackOptions {
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Options for {@link AuthTools.notify}.
 */
export interface NotifyOptions {
  type?: string;
  tenantId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The main tools module.
 *
 * Provides a unified API for telemetry tracking, real-time SSE notifications,
 * and outgoing webhooks.  All capabilities are optional and have zero overhead
 * when disabled.
 *
 * ```ts
 * import { AuthTools, AuthEventBus } from 'awesome-node-auth';
 *
 * const bus = new AuthEventBus();
 * const tools = new AuthTools(bus, {
 *   telemetryStore: myStore,
 *   webhookStore: myWebhookStore,
 *   sse: true,
 * });
 *
 * // Track an event programmatically
 * await tools.track('identity.auth.login.success', { user }, { userId: user.id });
 *
 * // Notify a topic over SSE
 * await tools.notify('user:123', { message: 'Welcome!' });
 * ```
 */
export class AuthTools {
  readonly eventBus: AuthEventBus;
  readonly sseManager: SseManager | null;
  private readonly telemetryStore?: ITelemetryStore;
  private readonly webhookStore?: IWebhookStore;
  private readonly webhookSender: WebhookSender;
  private readonly webhookVersion: string;

  constructor(eventBus: AuthEventBus, options: AuthToolsOptions = {}) {
    this.eventBus = eventBus;
    this.telemetryStore = options.telemetryStore;
    this.webhookStore = options.webhookStore;
    this.webhookSender = new WebhookSender();
    this.webhookVersion = options.webhookVersion ?? '1';
    this.sseManager = options.sse ? new SseManager(options.sseOptions) : null;

    if (this.sseManager) {
      SseNotifyRegistry.setManager(this.sseManager);
    }
  }

  /**
   * Track an event: persist it (optional), emit it on the event bus, broadcast
   * it to SSE subscribers and fire matching outgoing webhooks.
   *
   * @param eventName  Standardised event name (see `AuthEventNames`).
   * @param data       Arbitrary event data.
   * @param options    Metadata (userId, tenantId, …).
   */
  async track(eventName: string, data?: unknown, options: TrackOptions = {}): Promise<void> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    const telemetryEvent: TelemetryEvent = {
      id,
      event: eventName,
      timestamp,
      data,
      userId: options.userId,
      tenantId: options.tenantId,
      sessionId: options.sessionId,
      correlationId: options.correlationId,
      ip: options.ip,
      userAgent: options.userAgent,
    };

    // 1. Persist
    if (this.telemetryStore) {
      await this.telemetryStore.save(telemetryEvent).catch(() => {/* best-effort */ });
    }

    // 2. Emit on the event bus
    const busPayload: Omit<AuthEventPayload, 'event' | 'timestamp'> = {
      data,
      userId: options.userId,
      tenantId: options.tenantId,
      sessionId: options.sessionId,
      correlationId: options.correlationId,
      ip: options.ip,
      userAgent: options.userAgent,
    };
    this.eventBus.publish(eventName, busPayload);

    // 3. SSE broadcast (topic per tenant or global)
    if (this.sseManager) {
      const topics = this.resolveTopics(eventName, options);
      const streamEvent: Omit<StreamEvent, 'id' | 'timestamp' | 'topic'> & { id: string; timestamp: string } = {
        id,
        timestamp,
        type: eventName,
        data: telemetryEvent,
        userId: options.userId,
        tenantId: options.tenantId,
      };
      for (const topic of topics) {
        this.sseManager.broadcast(topic, streamEvent);
      }
    }

    // 4. Outgoing webhooks
    if (this.webhookStore) {
      const configs = await this.webhookStore.findByEvent(eventName, options.tenantId).catch(() => []);
      const webhookEvent: OutgoingWebhookEvent = {
        event: eventName,
        version: this.webhookVersion,
        timestamp,
        data: data ?? null,
        metadata: {
          userId: options.userId,
          tenantId: options.tenantId,
          sessionId: options.sessionId,
          correlationId: options.correlationId,
        },
      };
      for (const config of configs) {
        // Fire-and-forget; don't let webhook failures block the caller
        this.webhookSender.send(config, webhookEvent).catch(() => {/* best-effort */ });
      }
    }
  }

  /**
   * Send a real-time notification to a specific SSE topic.
   *
   * @param target   Target topic (e.g. `'user:123'`, `'tenant:acme'`).
   * @param data     Payload to deliver.
   * @param options  Optional type, tenantId, userId, metadata.
   */
  notify<T = unknown>(target: string, data: T, options: NotifyOptions = {}): void {
    if (!this.sseManager) return;
    this.sseManager.broadcast<T>(target, {
      type: options.type ?? 'notification',
      data,
      tenantId: options.tenantId,
      userId: options.userId,
      metadata: options.metadata,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the SSE topics an event should be broadcast to.
   * Always includes `'global'`; additionally adds tenant and user topics when
   * the corresponding IDs are present.
   */
  private resolveTopics(eventName: string, options: TrackOptions): string[] {
    const topics: string[] = ['global'];
    if (options.tenantId) topics.push(`tenant:${options.tenantId}`);
    if (options.userId) topics.push(`user:${options.userId}`);
    if (options.sessionId) topics.push(`session:${options.sessionId}`);
    return topics;
  }
}
