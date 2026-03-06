import { createHmac, randomUUID } from 'crypto';
import { WebhookConfig, OutgoingWebhookEvent } from '../interfaces/webhook-store.interface';

/**
 * Sends outgoing webhooks with optional HMAC signing and exponential
 * back-off retry.
 */
export class WebhookSender {
  /**
   * Deliver an event to a single webhook endpoint.
   * Retries on transient HTTP errors according to the webhook's `maxRetries`
   * and `retryDelayMs` settings.
   *
   * @param config  Webhook configuration (URL, secret, retry policy, …).
   * @param event   The event payload to deliver.
   */
  async send(config: WebhookConfig, event: OutgoingWebhookEvent): Promise<void> {
    const maxRetries = config.maxRetries ?? 3;
    const baseDelayMs = config.retryDelayMs ?? 1_000;
    const body = JSON.stringify(event);

    let attempt = 0;
    while (attempt <= maxRetries) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event.event,
        'X-Webhook-Delivery': randomUUID(),
        'X-Webhook-Timestamp': event.timestamp,
      };

      if (config.secret) {
        headers['X-Webhook-Signature'] = this.sign(body, config.secret);
      }

      try {
        const res = await fetch(config.url, { method: 'POST', headers, body });
        if (res.ok) return;
        // Non-2xx: retry if attempts remain
        if (attempt >= maxRetries) return;
      } catch {
        // Network error: retry if attempts remain
        if (attempt >= maxRetries) return;
      }

      attempt++;
      await this.delay(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }

  /**
   * Compute an HMAC-SHA256 signature of `body` using `secret`.
   * The signature is returned as `sha256=<hex>` so receivers can verify it.
   */
  sign(body: string, secret: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }

  /**
   * Verify an inbound webhook signature.
   * Returns `true` when the `X-Webhook-Signature` header matches the
   * expected HMAC-SHA256 of the raw request body.
   *
   * Use constant-time comparison to prevent timing attacks.
   */
  verify(body: string, secret: string, signature: string): boolean {
    const expected = this.sign(body, secret);
    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
