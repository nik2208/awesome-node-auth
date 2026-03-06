/**
 * Represents a tenant in a multi-tenant application.
 *
 * `ITenantStore` implementations use this shape to create and query tenants.
 * The `config` field can hold arbitrary per-tenant settings (e.g. allowed
 * OAuth providers, custom branding, feature flags).
 */
export interface Tenant {
  /** Unique identifier for the tenant (e.g. slug, UUID, or subdomain). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Whether the tenant is currently active. Defaults to `true`. */
  isActive?: boolean;
  /** Arbitrary per-tenant configuration (allowed auth methods, branding, etc.). */
  config?: Record<string, unknown>;
  /** When the tenant was created. */
  createdAt?: Date;
}
