/**
 * Tests for the optional IUserMetadataStore, IRolesPermissionsStore,
 * ISessionStore, and ITenantStore interfaces.
 *
 * These tests use simple in-memory implementations to verify that the
 * interface contracts are correctly shaped and usable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  IUserMetadataStore,
  IRolesPermissionsStore,
  ISessionStore,
  ITenantStore,
  SessionInfo,
  Tenant,
} from '../src/index';

// ---------------------------------------------------------------------------
// In-memory implementations used only in these tests
// ---------------------------------------------------------------------------

class InMemoryUserMetadataStore implements IUserMetadataStore {
  private store = new Map<string, Record<string, unknown>>();

  async getMetadata(userId: string) {
    return this.store.get(userId) ?? {};
  }
  async updateMetadata(userId: string, metadata: Record<string, unknown>) {
    const existing = this.store.get(userId) ?? {};
    this.store.set(userId, { ...existing, ...metadata });
  }
  async clearMetadata(userId: string) {
    this.store.delete(userId);
  }
}

class InMemoryRbacStore implements IRolesPermissionsStore {
  private userRoles = new Map<string, Set<string>>();
  private rolePermissions = new Map<string, Set<string>>();

  private userKey(userId: string, tenantId?: string) {
    return tenantId ? `${tenantId}::${userId}` : userId;
  }

  async addRoleToUser(userId: string, role: string, tenantId?: string) {
    const key = this.userKey(userId, tenantId);
    if (!this.userRoles.has(key)) this.userRoles.set(key, new Set());
    this.userRoles.get(key)!.add(role);
  }
  async removeRoleFromUser(userId: string, role: string, tenantId?: string) {
    this.userRoles.get(this.userKey(userId, tenantId))?.delete(role);
  }
  async getRolesForUser(userId: string, tenantId?: string) {
    return [...(this.userRoles.get(this.userKey(userId, tenantId)) ?? [])];
  }
  async createRole(role: string, permissions?: string[]) {
    if (!this.rolePermissions.has(role)) this.rolePermissions.set(role, new Set());
    for (const p of permissions ?? []) this.rolePermissions.get(role)!.add(p);
  }
  async deleteRole(role: string) {
    this.rolePermissions.delete(role);
    for (const [key, roles] of this.userRoles) roles.delete(role);
  }
  async addPermissionToRole(role: string, permission: string) {
    if (!this.rolePermissions.has(role)) this.rolePermissions.set(role, new Set());
    this.rolePermissions.get(role)!.add(permission);
  }
  async removePermissionFromRole(role: string, permission: string) {
    this.rolePermissions.get(role)?.delete(permission);
  }
  async getPermissionsForRole(role: string) {
    return [...(this.rolePermissions.get(role) ?? [])];
  }
  async getPermissionsForUser(userId: string, tenantId?: string) {
    const roles = await this.getRolesForUser(userId, tenantId);
    const perms = new Set<string>();
    for (const r of roles) {
      for (const p of await this.getPermissionsForRole(r)) perms.add(p);
    }
    return [...perms];
  }
  async userHasPermission(userId: string, permission: string, tenantId?: string) {
    const perms = await this.getPermissionsForUser(userId, tenantId);
    return perms.includes(permission);
  }
}

class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, SessionInfo>();
  private counter = 0;

  async createSession(info: Omit<SessionInfo, 'sessionHandle'>) {
    const sessionHandle = `session-${++this.counter}`;
    const session: SessionInfo = { sessionHandle, ...info };
    this.sessions.set(sessionHandle, session);
    return session;
  }
  async getSession(sessionHandle: string) {
    return this.sessions.get(sessionHandle) ?? null;
  }
  async getSessionsForUser(userId: string, tenantId?: string) {
    return [...this.sessions.values()].filter(
      s => s.userId === userId && (tenantId === undefined || s.tenantId === tenantId)
    );
  }
  async updateSessionLastActive(sessionHandle: string) {
    const s = this.sessions.get(sessionHandle);
    if (s) s.lastActiveAt = new Date();
  }
  async revokeSession(sessionHandle: string) {
    this.sessions.delete(sessionHandle);
  }
  async revokeAllSessionsForUser(userId: string, tenantId?: string) {
    for (const [handle, s] of this.sessions) {
      if (s.userId === userId && (tenantId === undefined || s.tenantId === tenantId)) {
        this.sessions.delete(handle);
      }
    }
  }
}

class InMemoryTenantStore implements ITenantStore {
  private tenants = new Map<string, Tenant>();
  private memberships = new Map<string, Set<string>>(); // tenantId -> Set<userId>
  private counter = 0;

  async createTenant(data: Omit<Tenant, 'id'>) {
    const id = `tenant-${++this.counter}`;
    const tenant: Tenant = { id, ...data };
    this.tenants.set(id, tenant);
    return tenant;
  }
  async getTenantById(id: string) {
    return this.tenants.get(id) ?? null;
  }
  async getAllTenants() {
    return [...this.tenants.values()];
  }
  async updateTenant(id: string, data: Partial<Omit<Tenant, 'id'>>) {
    const t = this.tenants.get(id);
    if (t) this.tenants.set(id, { ...t, ...data });
  }
  async deleteTenant(id: string) {
    this.tenants.delete(id);
    this.memberships.delete(id);
  }
  async associateUserWithTenant(userId: string, tenantId: string) {
    if (!this.memberships.has(tenantId)) this.memberships.set(tenantId, new Set());
    this.memberships.get(tenantId)!.add(userId);
  }
  async disassociateUserFromTenant(userId: string, tenantId: string) {
    this.memberships.get(tenantId)?.delete(userId);
  }
  async getTenantsForUser(userId: string) {
    return [...this.tenants.values()].filter(t =>
      this.memberships.get(t.id)?.has(userId)
    );
  }
  async getUsersForTenant(tenantId: string) {
    return [...(this.memberships.get(tenantId) ?? [])];
  }
}

// ---------------------------------------------------------------------------
// IUserMetadataStore
// ---------------------------------------------------------------------------

describe('IUserMetadataStore', () => {
  let store: InMemoryUserMetadataStore;
  beforeEach(() => { store = new InMemoryUserMetadataStore(); });

  it('returns empty object for unknown user', async () => {
    expect(await store.getMetadata('u1')).toEqual({});
  });

  it('stores and retrieves metadata', async () => {
    await store.updateMetadata('u1', { theme: 'dark', lang: 'it' });
    expect(await store.getMetadata('u1')).toEqual({ theme: 'dark', lang: 'it' });
  });

  it('merges (shallow-patches) metadata', async () => {
    await store.updateMetadata('u1', { theme: 'dark', lang: 'en' });
    await store.updateMetadata('u1', { lang: 'it' });
    expect(await store.getMetadata('u1')).toEqual({ theme: 'dark', lang: 'it' });
  });

  it('clears metadata', async () => {
    await store.updateMetadata('u1', { theme: 'dark' });
    await store.clearMetadata('u1');
    expect(await store.getMetadata('u1')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// IRolesPermissionsStore
// ---------------------------------------------------------------------------

describe('IRolesPermissionsStore', () => {
  let store: InMemoryRbacStore;
  beforeEach(() => { store = new InMemoryRbacStore(); });

  it('assigns and retrieves roles for a user', async () => {
    await store.addRoleToUser('u1', 'admin');
    expect(await store.getRolesForUser('u1')).toContain('admin');
  });

  it('removes a role from a user', async () => {
    await store.addRoleToUser('u1', 'admin');
    await store.removeRoleFromUser('u1', 'admin');
    expect(await store.getRolesForUser('u1')).not.toContain('admin');
  });

  it('creates a role with pre-loaded permissions', async () => {
    await store.createRole('editor', ['posts:read', 'posts:write']);
    expect(await store.getPermissionsForRole('editor')).toContain('posts:write');
  });

  it('deletes a role', async () => {
    await store.createRole('editor', ['posts:read']);
    await store.addRoleToUser('u1', 'editor');
    await store.deleteRole('editor');
    expect(await store.getRolesForUser('u1')).not.toContain('editor');
    expect(await store.getPermissionsForRole('editor')).toEqual([]);
  });

  it('adds and removes permissions from a role', async () => {
    await store.addPermissionToRole('viewer', 'posts:read');
    await store.addPermissionToRole('viewer', 'comments:read');
    expect(await store.getPermissionsForRole('viewer')).toHaveLength(2);
    await store.removePermissionFromRole('viewer', 'comments:read');
    expect(await store.getPermissionsForRole('viewer')).toEqual(['posts:read']);
  });

  it('aggregates permissions across all user roles', async () => {
    await store.addPermissionToRole('reader', 'posts:read');
    await store.addPermissionToRole('writer', 'posts:write');
    await store.addRoleToUser('u1', 'reader');
    await store.addRoleToUser('u1', 'writer');
    const perms = await store.getPermissionsForUser('u1');
    expect(perms).toContain('posts:read');
    expect(perms).toContain('posts:write');
  });

  it('checks permission correctly', async () => {
    await store.addPermissionToRole('admin', 'users:delete');
    await store.addRoleToUser('u1', 'admin');
    expect(await store.userHasPermission('u1', 'users:delete')).toBe(true);
    expect(await store.userHasPermission('u1', 'users:create')).toBe(false);
  });

  it('scopes roles and permissions to tenantId', async () => {
    await store.addPermissionToRole('admin', 'posts:delete');
    await store.addRoleToUser('u1', 'admin', 'tenant-a');
    expect(await store.getRolesForUser('u1', 'tenant-a')).toContain('admin');
    expect(await store.getRolesForUser('u1', 'tenant-b')).not.toContain('admin');
    expect(await store.userHasPermission('u1', 'posts:delete', 'tenant-a')).toBe(true);
    expect(await store.userHasPermission('u1', 'posts:delete', 'tenant-b')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ISessionStore
// ---------------------------------------------------------------------------

describe('ISessionStore', () => {
  let store: InMemorySessionStore;
  const now = new Date();
  const later = new Date(now.getTime() + 3600_000);

  beforeEach(() => { store = new InMemorySessionStore(); });

  it('creates and retrieves a session', async () => {
    const s = await store.createSession({
      userId: 'u1', createdAt: now, expiresAt: later, userAgent: 'Chrome',
    });
    expect(s.sessionHandle).toBeTruthy();
    const fetched = await store.getSession(s.sessionHandle);
    expect(fetched?.userId).toBe('u1');
    expect(fetched?.userAgent).toBe('Chrome');
  });

  it('returns null for unknown session handle', async () => {
    expect(await store.getSession('nonexistent')).toBeNull();
  });

  it('lists sessions for a user', async () => {
    await store.createSession({ userId: 'u1', createdAt: now, expiresAt: later });
    await store.createSession({ userId: 'u1', createdAt: now, expiresAt: later });
    await store.createSession({ userId: 'u2', createdAt: now, expiresAt: later });
    expect(await store.getSessionsForUser('u1')).toHaveLength(2);
  });

  it('filters sessions by tenantId', async () => {
    await store.createSession({ userId: 'u1', tenantId: 'a', createdAt: now, expiresAt: later });
    await store.createSession({ userId: 'u1', tenantId: 'b', createdAt: now, expiresAt: later });
    expect(await store.getSessionsForUser('u1', 'a')).toHaveLength(1);
  });

  it('updates lastActiveAt', async () => {
    const s = await store.createSession({ userId: 'u1', createdAt: now, expiresAt: later });
    await store.updateSessionLastActive(s.sessionHandle);
    const updated = await store.getSession(s.sessionHandle);
    expect(updated?.lastActiveAt).toBeDefined();
  });

  it('revokes a single session', async () => {
    const s = await store.createSession({ userId: 'u1', createdAt: now, expiresAt: later });
    await store.revokeSession(s.sessionHandle);
    expect(await store.getSession(s.sessionHandle)).toBeNull();
  });

  it('revokes all sessions for a user', async () => {
    await store.createSession({ userId: 'u1', createdAt: now, expiresAt: later });
    await store.createSession({ userId: 'u1', createdAt: now, expiresAt: later });
    await store.createSession({ userId: 'u2', createdAt: now, expiresAt: later });
    await store.revokeAllSessionsForUser('u1');
    expect(await store.getSessionsForUser('u1')).toHaveLength(0);
    expect(await store.getSessionsForUser('u2')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ITenantStore
// ---------------------------------------------------------------------------

describe('ITenantStore', () => {
  let store: InMemoryTenantStore;
  beforeEach(() => { store = new InMemoryTenantStore(); });

  it('creates and retrieves a tenant', async () => {
    const t = await store.createTenant({ name: 'Acme Corp' });
    expect(t.id).toBeTruthy();
    const fetched = await store.getTenantById(t.id);
    expect(fetched?.name).toBe('Acme Corp');
  });

  it('returns null for unknown tenant', async () => {
    expect(await store.getTenantById('nonexistent')).toBeNull();
  });

  it('lists all tenants', async () => {
    await store.createTenant({ name: 'A' });
    await store.createTenant({ name: 'B' });
    expect(await store.getAllTenants()).toHaveLength(2);
  });

  it('updates a tenant', async () => {
    const t = await store.createTenant({ name: 'Old Name' });
    await store.updateTenant(t.id, { name: 'New Name', isActive: false });
    expect((await store.getTenantById(t.id))?.name).toBe('New Name');
    expect((await store.getTenantById(t.id))?.isActive).toBe(false);
  });

  it('deletes a tenant', async () => {
    const t = await store.createTenant({ name: 'Temp' });
    await store.deleteTenant(t.id);
    expect(await store.getTenantById(t.id)).toBeNull();
  });

  it('associates and dissociates users with tenants', async () => {
    const t = await store.createTenant({ name: 'Corp' });
    await store.associateUserWithTenant('u1', t.id);
    await store.associateUserWithTenant('u2', t.id);
    expect(await store.getUsersForTenant(t.id)).toContain('u1');
    await store.disassociateUserFromTenant('u1', t.id);
    expect(await store.getUsersForTenant(t.id)).not.toContain('u1');
  });

  it('returns tenants for a user', async () => {
    const t1 = await store.createTenant({ name: 'A' });
    const t2 = await store.createTenant({ name: 'B' });
    await store.associateUserWithTenant('u1', t1.id);
    await store.associateUserWithTenant('u1', t2.id);
    const tenants = await store.getTenantsForUser('u1');
    expect(tenants.map(t => t.id)).toContain(t1.id);
    expect(tenants.map(t => t.id)).toContain(t2.id);
  });
});
