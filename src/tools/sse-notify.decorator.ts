import { SseManager } from './sse-manager';

/**
 * Options for the `@sseNotify` decorator.
 */
export interface SseNotifyOptions {
    /**
     * The SSE topic to broadcast to.  Can be a static string or a function 
     * that resolves the topic based on method arguments and execution result.
     */
    topic: string | ((args: any[], result: any) => string);

    /**
     * The event type name.  Defaults to `'notification'`.
     */
    event?: string;

    /**
     * Optional payload transformer.  By default, the method's return value is sent.
     */
    payload?: (result: any, args: any[]) => any;

    /**
     * Optional tenant ID resolver.
     */
    tenantId?: (result: any, args: any[]) => string | undefined;

    /**
     * Optional user ID resolver.
     */
    userId?: (result: any, args: any[]) => string | undefined;
}

/**
 * Global registry and dispatcher for decorated SSE notifications.
 */
export class SseNotifyRegistry {
    private static manager: SseManager | null = null;

    /**
     * Set the active SSE manager used for broadcasts.  Should be called 
     * during application initialization.
     */
    static setManager(manager: SseManager | null): void {
        this.manager = manager;
    }

    /**
     * Perform a broadcast if a manager is registered.
     */
    static notify(topic: string, event: { type: string; data: any; tenantId?: string; userId?: string }): void {
        if (!this.manager) return;
        this.manager.broadcast(topic, event);
    }

    /**
     * Internal helper to execute notification logic.
     * Can be called manually to bypass decorators.
     */
    static async executeNotify(options: SseNotifyOptions, args: any[], result: any): Promise<void> {
        try {
            const topic = typeof options.topic === 'function' ? options.topic(args, result) : options.topic;
            const data = options.payload ? options.payload(result, args) : result;
            const eventType = options.event ?? 'notification';
            const tenantId = options.tenantId ? options.tenantId(result, args) : undefined;
            const userId = options.userId ? options.userId(result, args) : undefined;

            this.notify(topic, {
                type: eventType,
                data,
                tenantId,
                userId,
            });
        } catch (err) {
            console.error('[SseNotifyRegistry] Error in notification logic:', err);
        }
    }
}

/**
 * Method decorator that automatically triggers an SSE broadcast after 
 * successful execution.
 *
 * Uses the **TC39 Stage 3** decorator syntax (TypeScript 5.x+).
 * For legacy environments, use manual notification via `SseNotifyRegistry.notify()`.
 *
 * @example
 * ```ts
 * class UserService {
 *   @sseNotify({
 *     topic: (_args, user) => `user:${user.id}`,
 *     event: 'user.updated',
 *   })
 *   async updateProfile(userId: string, data: any) {
 *     return await db.users.update(userId, data);
 *   }
 * }
 * ```
 */
export function sseNotify(options: SseNotifyOptions) {
    return function <This, Args extends unknown[], Return>(
        target: (this: This, ...args: Args) => Promise<Return> | Return,
        _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return> | Return>,
    ) {
        return async function (this: This, ...args: Args): Promise<Return> {
            const result = await target.apply(this, args);
            await SseNotifyRegistry.executeNotify(options, args, result);
            return result;
        };
    };
}
