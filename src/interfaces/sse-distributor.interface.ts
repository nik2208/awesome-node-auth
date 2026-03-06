/**
 * Interface for cross-instance SSE event distribution.
 *
 * When awesome-node-auth runs in a multi-instance (clustered) environment, SSE 
 * connections are local to each server's memory.  An implementation of this 
 * interface (e.g. using Redis Pub/Sub) allows broadcasting events across all 
 * instances so that every subscriber receives them regardless of which server 
 * they are connected to.
 */
export interface ISseDistributor {
    /**
     * Publish an event to the distribution bus.
     *
     * @param topic  The topic/channel name.
     * @param event  The event payload (must be serializable).
     */
    publish(topic: string, event: any): Promise<void>;

    /**
     * Subscribe to events from the distribution bus.
     *
     * @param callback  Invoked whenever an event is received from another instance.
     */
    subscribe(callback: (topic: string, event: any) => void): Promise<void>;
}
