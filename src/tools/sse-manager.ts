import { Response } from 'express';
import { randomUUID } from 'crypto';
import { ISseDistributor } from '../interfaces/sse-distributor.interface';

/**
 * A single real-time SSE event delivered to subscribers.
 */
export interface StreamEvent<T = unknown> {
  /** Unique event identifier (auto-generated if not provided). */
  id: string;
  /** Event type / name. */
  type: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Topic / channel this event was published to. */
  topic: string;
  /** Arbitrary event data. */
  data: T;
  /** User ID (optional). */
  userId?: string;
  /** Tenant ID (optional). */
  tenantId?: string;
  /** Optional extra metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Represents an active SSE connection.
 */
interface SseConnection {
  id: string;
  res: Response;
  /** Topics this connection is authorised to receive. */
  topics: Set<string>;
  userId?: string;
  tenantId?: string;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

/**
 * Options for the {@link SseManager}.
 */
export interface SseManagerOptions {
  /**
   * Interval in milliseconds between heartbeat comments (`:heartbeat`).
   * Set to `0` to disable heartbeats.
   * @default 30000
   */
  heartbeatIntervalMs?: number;

  /**
   * Optional distributor for cross-instance event synchronization.
   * Required for horizontal scaling.
   */
  distributor?: ISseDistributor;
}

/**
 * Manages Server-Sent Events connections.
 *
 * Tracks open HTTP streams and broadcasts `StreamEvent` objects to all
 * subscribers matching a given topic.  Topics follow the hierarchical
 * channel scheme:
 *
 * ```
 * global
 * tenant:{tenantId}
 * tenant:{tenantId}:role:{role}
 * tenant:{tenantId}:group:{groupId}
 * user:{userId}
 * session:{sessionId}
 * custom:{namespace}
 * ```
 *
 * The server controls which topics a connection is allowed to subscribe to —
 * clients cannot self-declare channels.
 */
export class SseManager {
  private connections = new Map<string, SseConnection>();
  private readonly distributor?: ISseDistributor;

  /**
   * Interval in milliseconds between heartbeat comments (`:heartbeat`).
   * Set to `0` to disable heartbeats.
   * @default 30000
   */
  readonly heartbeatIntervalMs: number;

  constructor(options?: SseManagerOptions) {
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 30_000;
    this.distributor = options?.distributor;

    if (this.distributor) {
      this.distributor.subscribe((topic, event) => {
        this.broadcastLocal(topic, event);
      });
    }
  }

  /**
   * Attach an SSE response to a new connection and register its authorised
   * topics.
   *
   * @param res     The HTTP response to write events to.
   * @param topics  Topics this connection may receive (enforced server-side).
   * @param meta    Optional user / tenant context.
   * @returns The generated connection ID.
   */
  connect(
    res: Response,
    topics: string[],
    meta?: { userId?: string; tenantId?: string },
  ): string {
    const id = randomUUID();

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send initial connection event
    this.write(res, {
      id: randomUUID(),
      type: 'connected',
      timestamp: new Date().toISOString(),
      topic: 'meta',
      data: { connectionId: id, topics },
    });

    const conn: SseConnection = {
      id,
      res,
      topics: new Set(topics),
      userId: meta?.userId,
      tenantId: meta?.tenantId,
    };

    if (this.heartbeatIntervalMs > 0) {
      conn.heartbeatTimer = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          this.disconnect(id);
        }
      }, this.heartbeatIntervalMs);
    }

    this.connections.set(id, conn);

    // Clean up when the client disconnects
    res.on('close', () => this.disconnect(id));

    return id;
  }

  /**
   * Broadcast a `StreamEvent` to all connections subscribed to `topic`.
   * If a distributor is configured, the event is published to it for
   * cross-instance delivery.
   */
  broadcast<T = unknown>(
    topic: string,
    event: Omit<StreamEvent<T>, 'id' | 'timestamp' | 'topic'> & { id?: string; timestamp?: string },
  ): void {
    const full: StreamEvent<T> = {
      id: event.id ?? randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      topic,
      ...(event as any),
    };

    if (this.distributor) {
      this.distributor.publish(topic, full).catch(() => {
        // Fallback to local broadcast if distribution fails
        this.broadcastLocal(topic, full);
      });
    } else {
      this.broadcastLocal(topic, full);
    }
  }

  /**
   * Broadcast an event to ONLY the local connections.
   * This is typically called by the distributor's subscription callback.
   */
  private broadcastLocal<T = unknown>(topic: string, event: StreamEvent<T>): void {
    for (const conn of this.connections.values()) {
      if (!conn.topics.has(topic)) continue;

      // Tenant isolation: if the event has a tenantId the connection must
      // belong to the same tenant (unless it is a global connection with no
      // tenantId set).
      if (event.tenantId && conn.tenantId && conn.tenantId !== event.tenantId) continue;

      try {
        this.write(conn.res, event);
      } catch {
        this.disconnect(conn.id);
      }
    }
  }

  /**
   * Close and remove a connection by its ID.
   */
  disconnect(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer);
    this.connections.delete(connectionId);
    try {
      conn.res.end();
    } catch {
      // already closed
    }
  }

  /**
   * Number of currently open connections.
   */
  get connectionCount(): number {
    return this.connections.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private write<T>(res: Response, event: StreamEvent<T>): void {
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify({ ...event, data: undefined, rawData: event.data })}\n\n`);
  }
}
