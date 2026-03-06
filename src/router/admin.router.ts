import { Router, Request, Response, RequestHandler } from 'express';
import { IUserStore } from '../interfaces/user-store.interface';
import { ISessionStore } from '../interfaces/session-store.interface';
import { IRolesPermissionsStore } from '../interfaces/roles-permissions-store.interface';
import { ITenantStore } from '../interfaces/tenant-store.interface';
import { IUserMetadataStore } from '../interfaces/user-metadata-store.interface';
import { ISettingsStore, AuthSettings } from '../interfaces/settings-store.interface';
import { ILinkedAccountsStore } from '../interfaces/linked-accounts-store.interface';
import { IApiKeyStore } from '../interfaces/api-key-store.interface';
import { IWebhookStore } from '../interfaces/webhook-store.interface';
import { ApiKeyService } from '../services/api-key.service';
import { ActionRegistry } from '../tools/webhook-action';
import { buildAdminOpenApiSpec, buildSwaggerUiHtml } from './openapi';

export interface AdminOptions {
  /**
   * Secret token required to access all admin endpoints.
   * Pass as a Bearer token: `Authorization: Bearer <adminSecret>`
   * The HTML UI presents a login form that stores the token in sessionStorage.
   */
  adminSecret: string;
  /** Optional session store — enables the Sessions tab in the admin UI. */
  sessionStore?: ISessionStore;
  /** Optional RBAC store — enables the Roles & Permissions tab and user-role assignment. */
  rbacStore?: IRolesPermissionsStore;
  /** Optional tenant store — enables the Tenants tab and user-tenant assignment. */
  tenantStore?: ITenantStore;
  /**
   * Optional user-metadata store — enables the Metadata section in the user detail
   * panel (view and edit arbitrary per-user key/value data).
   */
  userMetadataStore?: IUserMetadataStore;
  /** Optional settings store — enables the ⚙️ Control tab in the admin UI. */
  settingsStore?: ISettingsStore;
  /**
   * Optional linked-accounts store — enables the Linked Accounts column in the
   * users table and the Linked Accounts section in the user detail panel.
   */
  linkedAccountsStore?: ILinkedAccountsStore;

  /**
   * Optional API Key store — enables the 🔑 API Keys tab in the admin UI.
   * Requires `IApiKeyStore.listAll` for listing and optionally `delete` for hard deletion.
   */
  apiKeyStore?: IApiKeyStore;

  /**
   * Optional webhook store — enables the 🔗 Webhooks tab in the admin UI.
   * Requires `IWebhookStore.listAll` for listing and optionally `add`/`remove`/`update`
   * for full management.
   */
  webhookStore?: IWebhookStore;

  /**
   * Enable Swagger UI (`GET /api/openapi.json`, `GET /api/docs`) on the admin router.
   *
   * - `true`   — always enabled
   * - `false`  — always disabled
   * - `'auto'` (default) — enabled when `NODE_ENV` is **not** `'production'`
   *
   * @default 'auto'
   */
  swagger?: boolean | 'auto';

  /**
   * Base path where the admin router is mounted.
   * Used to build accurate path entries in the OpenAPI spec.
   *
   * @default '/admin'
   */
  swaggerBasePath?: string;
}

function adminAuth(secret: string): RequestHandler {
  return (req: Request, res: Response, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = auth.slice(7);
    if (token !== secret) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Embedded HTML/JS/CSS admin UI (no build step, no external dependencies)
// ---------------------------------------------------------------------------

function buildAdminHtml(baseUrl: string, features: {
  sessions: boolean;
  roles: boolean;
  tenants: boolean;
  metadata: boolean;
  twoFAPolicy: boolean;
  control: boolean;
  linkedAccounts: boolean;
  apiKeys: boolean;
  webhooks: boolean;
}): string {
  const tabs = [
    { id: 'users', label: '👤 Users' },
    ...(features.sessions ? [{ id: 'sessions', label: '📋 Sessions' }] : []),
    ...(features.roles ? [{ id: 'roles', label: '🛡️ Roles & Permissions' }] : []),
    ...(features.tenants ? [{ id: 'tenants', label: '🏢 Tenants' }] : []),
    ...(features.apiKeys ? [{ id: 'apiKeys', label: '🔑 API Keys' }] : []),
    ...(features.webhooks ? [{ id: 'webhooks', label: '🔗 Webhooks' }] : []),
    ...(features.control ? [{ id: 'control', label: '⚙️ Control' }] : []),
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>awesome-node-auth Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f0f2f5;color:#1a1a2e}
    /* Login */
    #login{display:flex;align-items:center;justify-content:center;min-height:100vh}
    .login-card{background:white;padding:2.5rem;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.12);width:340px}
    .login-card h1{font-size:1.5rem;margin-bottom:.25rem}
    .login-card p{color:#666;font-size:.875rem;margin-bottom:1.5rem}
    /* App */
    #app{display:none;min-height:100vh;flex-direction:column}
    header{background:#1a1a2e;color:white;padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between}
    header h1{font-size:1.1rem;font-weight:700;letter-spacing:.5px}
    header span{font-size:.75rem;opacity:.6}
    nav{background:white;border-bottom:1px solid #e5e7eb;padding:0 2rem;display:flex;gap:.25rem}
    nav button{padding:.75rem 1.25rem;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#6b7280;font-size:.875rem;font-weight:500;transition:all .15s}
    nav button:hover{color:#1a1a2e}
    nav button.active{color:#1a1a2e;border-color:#1a1a2e}
    main{padding:2rem;flex:1}
    /* Cards */
    .card{background:white;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;margin-bottom:1.5rem}
    .card-header{padding:1rem 1.5rem;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between}
    .card-header h2{font-size:.9375rem;font-weight:600}
    .card-header .meta{font-size:.75rem;color:#9ca3af}
    /* Tables */
    .table-wrap{overflow-x:auto}
    table{width:100%;border-collapse:collapse}
    th{padding:.625rem 1rem;text-align:left;font-size:.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;background:#fafafa;border-bottom:1px solid #f3f4f6;white-space:nowrap}
    td{padding:.75rem 1rem;border-bottom:1px solid #f9fafb;font-size:.8125rem;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#fafafa}
    /* Badges */
    .badge{display:inline-flex;align-items:center;gap:.25rem;padding:.125rem .5rem;border-radius:999px;font-size:.6875rem;font-weight:600}
    .badge-green{background:#dcfce7;color:#166534}
    .badge-gray{background:#f3f4f6;color:#4b5563}
    .badge-red{background:#fee2e2;color:#991b1b}
    .badge-blue{background:#dbeafe;color:#1d4ed8}
    /* Forms */
    .form-row{display:flex;gap:.5rem;align-items:center}
    input[type=text],input[type=password],input[type=email]{padding:.5rem .75rem;border:1px solid #d1d5db;border-radius:6px;font-size:.875rem;width:100%;outline:none;transition:border .15s}
    input:focus{border-color:#1a1a2e}
    .btn{padding:.5rem 1rem;border:none;border-radius:6px;font-size:.875rem;font-weight:500;cursor:pointer;transition:opacity .15s}
    .btn:hover{opacity:.88}
    .btn-primary{background:#1a1a2e;color:white}
    .btn-danger{background:#dc2626;color:white;font-size:.75rem;padding:.25rem .6rem}
    .btn-sm{font-size:.75rem;padding:.25rem .6rem}
    /* Misc */
    .empty{text-align:center;color:#9ca3af;padding:3rem 1rem}
    .empty svg{display:block;margin:0 auto 1rem;opacity:.4}
    .pager{display:flex;align-items:center;gap:.5rem;padding:.75rem 1rem;border-top:1px solid #f3f4f6;font-size:.8125rem;color:#6b7280}
    .pager button{padding:.25rem .625rem;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer;font-size:.8125rem}
    .pager button:disabled{opacity:.4;cursor:default}
    .alert{padding:.75rem 1rem;border-radius:6px;font-size:.8125rem;margin-bottom:1rem}
    .alert-error{background:#fee2e2;color:#991b1b}
    .alert-success{background:#dcfce7;color:#166534}
    .spinner{display:inline-block;width:16px;height:16px;border:2px solid #e5e7eb;border-top-color:#1a1a2e;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle}
    @keyframes spin{to{transform:rotate(360deg)}}
    #flash{position:fixed;top:1rem;right:1rem;z-index:999;max-width:320px}
    .badge-indigo{background:#e0e7ff;color:#3730a3}
    tr.tr-open>td{background:#eff6ff}
    .manage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(600px,800px));gap:1.25rem}
    .manage-section{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:1rem 1.25rem}
    .manage-section-title{font-size:.8125rem;font-weight:600;color:#374151;margin-bottom:.625rem}
    .roles-list{display:flex;flex-wrap:wrap;gap:.375rem;min-height:26px;align-items:flex-start}
    .role-chip{cursor:pointer;user-select:none;transition:opacity .1s}
    .role-chip:hover{opacity:.75}
    .form-select{padding:.375rem .625rem;border:1px solid #d1d5db;border-radius:6px;font-size:.8125rem;outline:none;flex-shrink:0}
    .form-select:focus{border-color:#1a1a2e}
    .meta-editor{width:100%;height:130px;margin-top:.25rem;padding:.5rem;font-family:monospace;font-size:.8125rem;border:1px solid #d1d5db;border-radius:6px;resize:vertical;outline:none;color:#1a1a2e}
    .meta-editor:focus{border-color:#1a1a2e}
    /* Toggle switches */
    .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid #f3f4f6}
    .toggle-row:last-child{border-bottom:none}
    .toggle-label{font-size:.875rem;color:#1a1a2e;flex:1}
    .toggle-label small{display:block;font-size:.75rem;color:#9ca3af;margin-top:.125rem}
    .toggle{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}
    .toggle input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;inset:0;background:#d1d5db;border-radius:24px;transition:.2s}
    .toggle-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.2s}
    input:checked + .toggle-slider{background:#1a1a2e}
    input:checked + .toggle-slider:before{transform:translateX(20px)}
    /* Filter bar */
    .filter-bar{display:flex;gap:.5rem;align-items:center;padding:.75rem 1rem;border-bottom:1px solid #f3f4f6}
    .filter-bar input{max-width:260px;flex:1}
    /* Batch bar */
    .batch-bar{display:none;align-items:center;gap:.75rem;padding:.5rem 1rem;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:.8125rem}
    .batch-bar.visible{display:flex}
    /* Row checkbox */
    .cb-col{width:36px;text-align:center}
  </style>
</head>
<body>

<!-- Login screen -->
<div id="login">
  <div class="login-card">
    <h1>🔐 awesome-node-auth</h1>
    <p>Administration panel</p>
    <div id="login-error" class="alert alert-error" style="display:none"></div>
    <div style="display:flex;flex-direction:column;gap:.75rem">
      <input type="password" id="secret-input" placeholder="Admin secret" autofocus>
      <button class="btn btn-primary" onclick="doLogin()">Sign in</button>
    </div>
  </div>
</div>

<!-- Main app -->
<div id="app" style="display:flex">
  <div id="flash"></div>
  <header>
    <h1>🔐 awesome-node-auth Admin</h1>
    <span id="header-meta"></span>
  </header>
  <nav id="nav">
    ${tabs.map(t => `<button id="tab-${t.id}" onclick="showTab('${t.id}')">${t.label}</button>`).join('\n    ')}
    <button class="btn" style="margin-left:auto;margin-top:.4rem;margin-bottom:.4rem;font-size:.75rem;padding:.25rem .75rem;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px" onclick="doLogout()">Logout</button>
  </nav>
  <main id="main"></main>
</div>

<script>
const BASE = '${baseUrl}';
let _token = '';
let _state = { tab: 'users', users: { page: 0, openId: null, rolesCache: {}, linkedAccountsCache: {}, filter: '', selected: new Set() }, sessions: { page: 0, filter: '' }, roles: { filter: '' }, tenants: { openId: null, filter: '' }, apiKeys: { page: 0, filter: '', newRaw: null }, webhooks: { page: 0 } };
const PAGE_SIZE = 20;
const FEAT_ROLES = ${features.roles ? 'true' : 'false'};
const FEAT_METADATA = ${features.metadata ? 'true' : 'false'};
const FEAT_TENANTS = ${features.tenants ? 'true' : 'false'};
const FEAT_2FA_POLICY = ${features.twoFAPolicy ? 'true' : 'false'};
const FEAT_CONTROL = ${features.control ? 'true' : 'false'};
const FEAT_LINKED_ACCOUNTS = ${features.linkedAccounts ? 'true' : 'false'};
const FEAT_API_KEYS = ${features.apiKeys ? 'true' : 'false'};
const FEAT_WEBHOOKS = ${features.webhooks ? 'true' : 'false'};

// ---- Auth ----------------------------------------------------------------
function doLogin() {
  const val = document.getElementById('secret-input').value.trim();
  if (!val) return;
  sessionStorage.setItem('admin_token', val);
  _token = val;
  document.getElementById('login-error').style.display = 'none';
  api('GET', '/api/ping').then(() => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('app').style.flexDirection = 'column';
    showTab('users');
  }).catch(() => {
    sessionStorage.removeItem('admin_token');
    _token = '';
    document.getElementById('login-error').textContent = 'Invalid admin secret';
    document.getElementById('login-error').style.display = 'block';
  });
}
function doLogout() {
  sessionStorage.removeItem('admin_token');
  location.reload();
}
document.getElementById('secret-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
// Auto-login if token stored
const stored = sessionStorage.getItem('admin_token');
if (stored) { _token = stored; api('GET', '/api/ping').then(() => {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('app').style.flexDirection = 'column';
  showTab('users');
}).catch(() => { sessionStorage.removeItem('admin_token'); _token = ''; }); }

// ---- API helper ----------------------------------------------------------
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ---- Flash ---------------------------------------------------------------
function flash(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'alert alert-' + (type === 'error' ? 'error' : 'success');
  el.textContent = msg;
  el.style.cssText = 'padding:.75rem 1rem;border-radius:6px;font-size:.8125rem;margin-bottom:.5rem;box-shadow:0 2px 8px rgba(0,0,0,.1)';
  document.getElementById('flash').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---- Tab routing ---------------------------------------------------------
function showTab(tab) {
  _state.tab = tab;
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tab-' + tab);
  if (btn) btn.classList.add('active');
  if (tab === 'users') renderUsers();
  else if (tab === 'sessions') renderSessions();
  else if (tab === 'roles') renderRoles();
  else if (tab === 'tenants') renderTenants();
  else if (tab === 'apiKeys') renderApiKeys();
  else if (tab === 'webhooks') renderWebhooks();
  else if (tab === 'control') renderControl();
}

// ---- Helpers -------------------------------------------------------------
function badge(text, cls) {
  return '<span class="badge badge-' + cls + '">' + esc(String(text)) + '</span>';
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ts(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}
function pagerHtml(page, hasMore, prev, next) {
  return '<div class="pager"><button ' + (page === 0 ? 'disabled' : '') + ' onclick="' + prev + '">← Prev</button>'
    + '<span>Page ' + (page + 1) + '</span>'
    + '<button ' + (!hasMore ? 'disabled' : '') + ' onclick="' + next + '">Next →</button></div>';
}

// ---- Users ---------------------------------------------------------------
async function renderUsers() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>Users</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  try {
    const filterParam = _state.users.filter ? '&filter=' + encodeURIComponent(_state.users.filter) : '';
    const { users, total } = await api('GET', '/api/users?limit=' + PAGE_SIZE + '&offset=' + (_state.users.page * PAGE_SIZE) + filterParam);
    const hasMore = (_state.users.page + 1) * PAGE_SIZE < total;
    const showManage = FEAT_ROLES || FEAT_METADATA || FEAT_TENANTS || FEAT_LINKED_ACCOUNTS;
    // Pre-fetch RBAC roles for all visible users in parallel
    if (FEAT_ROLES && users.length > 0) {
      await Promise.allSettled(users.map(u =>
        api('GET', '/api/users/' + encodeURIComponent(u.id) + '/roles')
          .then(d => { _state.users.rolesCache[u.id] = d.roles || []; })
          .catch(() => {})
      ));
    }
    // Pre-fetch linked accounts for all visible users in parallel
    if (FEAT_LINKED_ACCOUNTS && users.length > 0) {
      await Promise.allSettled(users.map(u =>
        api('GET', '/api/users/' + encodeURIComponent(u.id) + '/linked-accounts')
          .then(d => { _state.users.linkedAccountsCache[u.id] = d.linkedAccounts || []; })
          .catch(() => {})
      ));
    }
    const colCount = 8 + (FEAT_ROLES ? 1 : 0) + (FEAT_LINKED_ACCOUNTS ? 1 : 0);
    let rows = '';
    if (users.length === 0) {
      rows = '<tr><td colspan="' + colCount + '"><div class="empty">No users found</div></td></tr>';
    } else {
      for (const u of users) {
        const isOpen = _state.users.openId === u.id;
        const isChecked = _state.users.selected.has(u.id);
        const rbacRoles = FEAT_ROLES ? (_state.users.rolesCache[u.id] || []) : [];
        const rbacCol = FEAT_ROLES
          ? '<td>' + (rbacRoles.length === 0 ? '<span style="color:#9ca3af">—</span>' : rbacRoles.map(r => badge(r, 'indigo')).join(' ')) + '</td>'
          : '';
        const linkedAccounts = FEAT_LINKED_ACCOUNTS ? (_state.users.linkedAccountsCache[u.id] || []) : [];
        const linkedCol = FEAT_LINKED_ACCOUNTS
          ? '<td>' + (linkedAccounts.length === 0
              ? '<span style="color:#9ca3af">—</span>'
              : badge(linkedAccounts[0].provider, 'purple') + (linkedAccounts.length > 1 ? ' <span style="color:#6b7280;font-size:.75rem">+' + (linkedAccounts.length - 1) + '</span>' : ''))
            + '</td>'
          : '';
        rows += '<tr' + (isOpen ? ' class="tr-open"' : '') + '>'
          + '<td class="cb-col"><input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="toggleSelectUser(' + "'" + esc(u.id) + "'" + ')"></td>'
          + '<td style="font-family:monospace;font-size:.75rem">' + esc(u.id) + '</td>'
          + '<td>' + esc(u.email) + '</td>'
          + '<td>' + (u.role ? badge(u.role, 'blue') : badge('—', 'gray')) + '</td>'
          + rbacCol
          + linkedCol
          + '<td>' + (u.isEmailVerified ? badge('✓ verified', 'green') : badge('unverified', 'gray')) + '</td>'
          + '<td>' + (u.isTotpEnabled ? badge('on', 'green') : badge('off', 'gray')) + '</td>'
          + '<td>' + ts(u.createdAt) + '</td>'
          + '<td style="display:flex;gap:.25rem">'
          + (showManage ? '<button class="btn btn-sm" style="background:' + (isOpen ? '#1a1a2e' : '#e0e7ff') + ';color:' + (isOpen ? 'white' : '#3730a3') + '" onclick="toggleUserPanel(' + "'" + esc(u.id) + "'" + ')"> ' + (isOpen ? 'Close' : 'Manage') + '</button>' : '')
          + '<button class="btn btn-danger" onclick="deleteUser(' + "'" + esc(u.id) + "'" + ', ' + "'" + esc(u.email) + "'" + ')">Delete</button>'
          + '</td>'
          + '</tr>';
      }
    }
    const openUser = _state.users.openId ? users.find(u => u.id === _state.users.openId) : null;
    // Manage panel rendered as a separate card below the table (not inside a table row)
    const panelHtml = openUser
      ? '<div class="card" style="border-top:3px solid #1a1a2e">'
        + '<div class="card-header" style="background:#f0f4ff"><h2 style="font-size:.9375rem">⚙️&nbsp;Managing: <span style="color:#3730a3;font-weight:700">' + esc(openUser.email) + '</span></h2></div>'
        + '<div id="user-panel-' + esc(openUser.id) + '" style="padding:1.25rem 1.5rem"><span class="spinner"></span></div>'
        + '</div>'
      : '';
    const selCount = _state.users.selected.size;
    const batchBar = '<div class="batch-bar' + (selCount > 0 ? ' visible' : '') + '" id="batch-bar">'
      + '<span>' + selCount + ' user(s) selected</span>'
      + '<button class="btn btn-danger btn-sm" onclick="deleteSelected()">Delete selected</button>'
      + '<button class="btn btn-sm" style="background:#f3f4f6;border:1px solid #e5e7eb" onclick="clearSelection()">Clear</button>'
      + '</div>';
    const allChecked = users.length > 0 && users.every(u => _state.users.selected.has(u.id));
    const thead = '<thead><tr><th class="cb-col"><input type="checkbox" ' + (allChecked ? 'checked' : '') + ' onchange="toggleSelectAll(this, ' + JSON.stringify(users.map(u => u.id)) + ')"></th><th>ID</th><th>Email</th><th>Base Role</th>'
      + (FEAT_ROLES ? '<th>Assigned Roles</th>' : '')
      + (FEAT_LINKED_ACCOUNTS ? '<th>Linked Accounts</th>' : '')
      + '<th>Verified</th><th>2FA</th><th>Created</th><th></th></tr></thead>';
    // 2FA Policy card (shown when the feature is available)
    const policyCard = FEAT_2FA_POLICY
      ? '<div class="card" style="border-left:4px solid #f59e0b">'
        + '<div class="card-header" style="background:#fffbeb"><h2 style="font-size:.9375rem">🔐 2FA Enforcement Policy</h2><span class="meta">Batch operation</span></div>'
        + '<div style="padding:1rem 1.5rem;display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap">'
        + '<p style="font-size:.875rem;color:#6b7280;flex:1;min-width:180px">Force all users to activate Two-Factor Authentication. Users without 2FA configured will be blocked at login and prompted to set it up.</p>'
        + '<div style="display:flex;gap:.5rem;flex-shrink:0">'
        + '<button class="btn btn-primary" onclick="setBulk2FA(true)">Require 2FA for all</button>'
        + '<button class="btn" style="background:#f3f4f6;border:1px solid #e5e7eb" onclick="setBulk2FA(false)">Remove requirement</button>'
        + '</div>'
        + '</div></div>'
      : '';
    const filterBar = '<div class="filter-bar">'
      + '<input type="text" placeholder="Filter by email or ID…" value="' + esc(_state.users.filter) + '" oninput="_state.users.filter=this.value;_state.users.page=0;_state.users.selected=new Set();renderUsers()" style="max-width:300px">'
      + '<span style="font-size:.8125rem;color:#9ca3af">' + total + ' total</span>'
      + '</div>';
    main.innerHTML =
      policyCard
      + '<div class="card">'
      + '<div class="card-header"><h2>Users</h2></div>'
      + filterBar
      + batchBar
      + '<div class="table-wrap"><table>' + thead + '<tbody>' + rows + '</tbody></table></div>'
      + pagerHtml(_state.users.page, hasMore, '_state.users.page--;renderUsers()', '_state.users.page++;renderUsers()')
      + '</div>'
      + panelHtml;
    if (_state.users.openId) loadUserPanel(_state.users.openId);
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
function toggleSelectUser(id) {
  if (_state.users.selected.has(id)) _state.users.selected.delete(id);
  else _state.users.selected.add(id);
  const bar = document.getElementById('batch-bar');
  if (bar) {
    const n = _state.users.selected.size;
    bar.className = 'batch-bar' + (n > 0 ? ' visible' : '');
    bar.querySelector('span').textContent = n + ' user(s) selected';
  }
}
function toggleSelectAll(cb, ids) {
  if (cb.checked) ids.forEach(id => _state.users.selected.add(id));
  else ids.forEach(id => _state.users.selected.delete(id));
  renderUsers();
}
function clearSelection() {
  _state.users.selected = new Set();
  renderUsers();
}
async function deleteSelected() {
  const ids = [..._state.users.selected];
  if (ids.length === 0) return;
  if (!confirm('Delete ' + ids.length + ' user(s)? This cannot be undone.')) return;
  try {
    await Promise.all(ids.map(id => api('DELETE', '/api/users/' + encodeURIComponent(id))));
    flash(ids.length + ' user(s) deleted');
    _state.users.selected = new Set();
    renderUsers();
  } catch (e) { flash(e.message, 'error'); }
}
function toggleUserPanel(id) {
  _state.users.openId = _state.users.openId === id ? null : id;
  renderUsers();
}
async function loadUserPanel(userId) {
  const el = document.getElementById('user-panel-' + userId);
  if (!el) return;
  try {
    let sections = '';
    if (FEAT_ROLES) {
      const [allR, userR] = await Promise.all([
        api('GET', '/api/roles').catch(() => ({ roles: [] })),
        api('GET', '/api/users/' + encodeURIComponent(userId) + '/roles').catch(() => ({ roles: [] })),
      ]);
      const allRoles = allR.roles || [];
      const userRoles = userR.roles || [];
      _state.users.rolesCache[userId] = userRoles;
      const unassigned = allRoles.filter(r => !userRoles.includes(r.name));
      const chipList = userRoles.length === 0
        ? '<span style="color:#9ca3af;font-size:.8125rem">No roles assigned</span>'
        : userRoles.map(r => '<span class="badge badge-blue role-chip" title="Click to remove" onclick="removeUserRole(' + "'" + esc(userId) + "'" + ' , ' + "'" + esc(r) + "'" + ')">'+esc(r)+ ' ✕</span>').join(' ');
      const assignRow = unassigned.length > 0
        ? '<div class="form-row" style="margin-top:.625rem">'
          + '<select id="role-sel-' + esc(userId) + '" class="form-select">'
          + unassigned.map(r => '<option value="' + esc(r.name) + '">' + esc(r.name) + '</option>').join('')
          + '</select>'
          + '<button class="btn btn-primary btn-sm" onclick="addUserRole(' + "'" + esc(userId) + "'" + ')">Assign</button>'
          + '</div>'
        : '<p style="font-size:.75rem;color:#6b7280;margin-top:.5rem">'
          + (allRoles.length === 0 ? 'No roles defined yet. Create roles in the Roles & Permissions tab.' : 'All available roles are already assigned.')
          + '</p>';
      sections += '<div class="manage-section">'
        + '<div class="manage-section-title">🛡️ Roles</div>'
        + '<div class="roles-list">' + chipList + '</div>'
        + assignRow
        + '</div>';
    }
    if (FEAT_TENANTS) {
      const [allT, userTids] = await Promise.all([
        api('GET', '/api/tenants').catch(() => ({ tenants: [] })),
        api('GET', '/api/users/' + encodeURIComponent(userId) + '/tenants').catch(() => ({ tenantIds: [] })),
      ]);
      const allTenants = allT.tenants || [];
      const assignedIds = new Set(userTids.tenantIds || []);
      const chipList = allTenants.filter(t => assignedIds.has(t.id)).length === 0
        ? '<span style="color:#9ca3af;font-size:.8125rem">No tenants assigned</span>'
        : allTenants.filter(t => assignedIds.has(t.id)).map(t =>
            '<span class="badge badge-green role-chip" title="Click to remove" onclick="removeUserTenant(' + "'" + esc(userId) + "'" + ',' + "'" + esc(t.id) + "'" + ')">' + esc(t.name) + ' ✕</span>'
          ).join(' ');
      const unassignedTenants = allTenants.filter(t => !assignedIds.has(t.id));
      const assignRow = unassignedTenants.length > 0
        ? '<div class="form-row" style="margin-top:.625rem">'
          + '<select id="tenant-sel-' + esc(userId) + '" class="form-select">'
          + unassignedTenants.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('')
          + '</select>'
          + '<button class="btn btn-primary btn-sm" onclick="addUserTenant(' + "'" + esc(userId) + "'" + ')">Assign</button>'
          + '</div>'
        : '<p style="font-size:.75rem;color:#6b7280;margin-top:.5rem">All available tenants are already assigned.</p>';
      sections += '<div class="manage-section">'
        + '<div class="manage-section-title">🏢 Tenants</div>'
        + '<div class="roles-list">' + chipList + '</div>'
        + assignRow
        + '</div>';
    }
    if (FEAT_METADATA) {
      const meta = await api('GET', '/api/users/' + encodeURIComponent(userId) + '/metadata').catch(() => ({}));
      sections += '<div class="manage-section">'
        + '<div class="manage-section-title">🗂️ Metadata</div>'
        + '<textarea id="meta-' + esc(userId) + '" class="meta-editor">' + esc(JSON.stringify(meta, null, 2)) + '</textarea>'
        + '<div style="margin-top:.5rem"><button class="btn btn-primary btn-sm" onclick="saveUserMeta(' + "'" + esc(userId) + "'" + ')">Save</button></div>'
        + '</div>';
    }
    if (FEAT_LINKED_ACCOUNTS) {
      const { linkedAccounts: accts } = await api('GET', '/api/users/' + encodeURIComponent(userId) + '/linked-accounts').catch(() => ({ linkedAccounts: [] }));
      const items = (accts || []).map(a =>
        '<li style="display:flex;align-items:center;gap:.5rem;padding:.375rem 0;border-bottom:1px solid #f3f4f6">'
        + badge(esc(a.provider), 'purple')
        + '<span style="font-size:.8125rem;color:#374151;flex:1">' + esc(a.name || a.email || a.providerAccountId) + '</span>'
        + (a.email ? '<span style="font-size:.75rem;color:#9ca3af">' + esc(a.email) + '</span>' : '')
        + (a.linkedAt ? '<span style="font-size:.75rem;color:#9ca3af">' + ts(a.linkedAt) + '</span>' : '')
        + '</li>'
      ).join('');
      sections += '<div class="manage-section">'
        + '<div class="manage-section-title">🔗 Linked Accounts</div>'
        + (accts && accts.length > 0
          ? '<ul style="list-style:none;padding:0;margin:0">' + items + '</ul>'
          : '<span style="color:#9ca3af;font-size:.8125rem">No linked accounts</span>')
        + '</div>';
    }
    el.innerHTML = sections
      ? '<div class="manage-grid">' + sections + '</div>'
      : '<span style="color:#9ca3af;font-size:.8125rem">No management features available.</span>';
  } catch (e) {
    el.innerHTML = '<span style="color:#991b1b;font-size:.8125rem">' + esc(e.message) + '</span>';
  }
}
async function addUserTenant(userId) {
  const sel = document.getElementById('tenant-sel-' + userId);
  if (!sel || !sel.value) return;
  try {
    await api('POST', '/api/tenants/' + encodeURIComponent(sel.value) + '/users', { userId });
    flash('Tenant assigned');
    loadUserPanel(userId);
  } catch (e) { flash(e.message, 'error'); }
}
async function removeUserTenant(userId, tenantId) {
  try {
    await api('DELETE', '/api/tenants/' + encodeURIComponent(tenantId) + '/users/' + encodeURIComponent(userId));
    flash('Tenant removed');
    loadUserPanel(userId);
  } catch (e) { flash(e.message, 'error'); }
}
async function addUserRole(userId) {
  const sel = document.getElementById('role-sel-' + userId);
  if (!sel || !sel.value) return;
  try {
    await api('POST', '/api/users/' + encodeURIComponent(userId) + '/roles', { role: sel.value });
    flash('Role assigned');
    renderUsers();
  } catch (e) { flash(e.message, 'error'); }
}
async function removeUserRole(userId, role) {
  try {
    await api('DELETE', '/api/users/' + encodeURIComponent(userId) + '/roles/' + encodeURIComponent(role));
    flash('Role removed');
    renderUsers();
  } catch (e) { flash(e.message, 'error'); }
}
async function saveUserMeta(userId) {
  const ta = document.getElementById('meta-' + userId);
  if (!ta) return;
  let parsed;
  try { parsed = JSON.parse(ta.value); } catch { flash('Invalid JSON', 'error'); return; }
  try {
    await api('PUT', '/api/users/' + encodeURIComponent(userId) + '/metadata', parsed);
    flash('Metadata saved');
  } catch (e) { flash(e.message, 'error'); }
}
async function deleteUser(id, email) {
  if (!confirm('Delete user ' + email + '? This cannot be undone.')) return;
  try {
    await api('DELETE', '/api/users/' + encodeURIComponent(id));
    flash('User deleted');
    renderUsers();
  } catch (e) { flash(e.message, 'error'); }
}
async function setBulk2FA(required) {
  const action = required ? 'require 2FA for ALL users' : 'remove the 2FA requirement from ALL users';
  if (!confirm('Are you sure you want to ' + action + '?')) return;
  try {
    const { updated } = await api('POST', '/api/2fa-policy', { required });
    flash(updated + ' user(s) updated — 2FA ' + (required ? 'now required' : 'requirement removed'));
    renderUsers();
  } catch (e) { flash(e.message, 'error'); }
}

// ---- Sessions ------------------------------------------------------------
async function renderSessions() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>Sessions</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  try {
    const filterParam = _state.sessions.filter ? '&filter=' + encodeURIComponent(_state.sessions.filter) : '';
    const { sessions, total } = await api('GET', '/api/sessions?limit=' + PAGE_SIZE + '&offset=' + (_state.sessions.page * PAGE_SIZE) + filterParam);
    const hasMore = (_state.sessions.page + 1) * PAGE_SIZE < total;
    main.innerHTML = \`
<div class="card">
  <div class="card-header"><h2>Active Sessions</h2></div>
  <div class="filter-bar">
    <input type="text" placeholder="Filter by User ID or IP…" value="\${esc(_state.sessions.filter)}" oninput="_state.sessions.filter=this.value;_state.sessions.page=0;renderSessions()" style="max-width:300px">
    <span style="font-size:.8125rem;color:#9ca3af">\${total} total</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Handle</th><th>User ID</th><th>IP</th><th>User Agent</th><th>Created</th><th>Last Active</th><th>Expires</th><th></th></tr></thead>
      <tbody>\${sessions.length === 0 ? '<tr><td colspan="8"><div class="empty">No sessions</div></td></tr>' :
        sessions.map(s => \`<tr>
          <td style="font-family:monospace;font-size:.75rem">\${esc(s.sessionHandle.slice(0,12))}…</td>
          <td style="font-family:monospace;font-size:.75rem">\${esc(s.userId)}</td>
          <td>\${esc(s.ipAddress || '—')}</td>
          <td title="\${esc(s.userAgent || '')}" style="max-width:160px">\${esc((s.userAgent || '—').slice(0,40))}</td>
          <td>\${ts(s.createdAt)}</td>
          <td>\${ts(s.lastActiveAt)}</td>
          <td>\${ts(s.expiresAt)}</td>
          <td><button class="btn btn-danger" onclick="revokeSession('\${esc(s.sessionHandle)}')">Revoke</button></td>
        </tr>\`).join('')}
      </tbody>
    </table>
  </div>
  \${pagerHtml(_state.sessions.page, hasMore, "_state.sessions.page--;renderSessions()", "_state.sessions.page++;renderSessions()")}
</div>\`;
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
async function revokeSession(handle) {
  try {
    await api('DELETE', '/api/sessions/' + encodeURIComponent(handle));
    flash('Session revoked');
    renderSessions();
  } catch (e) { flash(e.message, 'error'); }
}

// ---- Roles ---------------------------------------------------------------
async function renderRoles() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>Roles</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  try {
    const { roles: allRoles } = await api('GET', '/api/roles');
    const roles = _state.roles.filter
      ? allRoles.filter(r => r.name.toLowerCase().includes(_state.roles.filter.toLowerCase()))
      : allRoles;
    let html = '<div class="card"><div class="card-header"><h2>Roles & Permissions</h2></div>'
      + '<div class="filter-bar"><input type="text" placeholder="Filter by role name…" value="' + esc(_state.roles.filter) + '" oninput="_state.roles.filter=this.value;renderRoles()" style="max-width:300px"><span style="font-size:.8125rem;color:#9ca3af">' + allRoles.length + ' total</span></div>';
    if (roles.length === 0) {
      html += '<div class="empty">No roles found</div>';
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>Role</th><th>Permissions</th><th></th></tr></thead><tbody>';
      for (const r of roles) {
        html += \`<tr>
          <td><strong>\${esc(r.name)}</strong></td>
          <td>\${r.permissions.length === 0 ? '<span style="color:#9ca3af">none</span>' : r.permissions.map(p => badge(p,'blue')).join(' ')}</td>
          <td><button class="btn btn-danger" onclick="deleteRole('\${esc(r.name)}')">Delete</button></td>
        </tr>\`;
      }
      html += '</tbody></table></div>';
    }
    // Create role form
    html += \`<div style="padding:1rem 1.5rem;border-top:1px solid #f3f4f6">
      <div class="form-row">
        <input type="text" id="new-role-name" placeholder="Role name" style="width:180px">
        <input type="text" id="new-role-perms" placeholder="Permissions (comma-separated)">
        <button class="btn btn-primary btn-sm" onclick="createRole()">Add Role</button>
      </div>
    </div></div>\`;
    main.innerHTML = html;
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
async function createRole() {
  const name = document.getElementById('new-role-name').value.trim();
  const perms = document.getElementById('new-role-perms').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!name) return;
  try {
    await api('POST', '/api/roles', { name, permissions: perms });
    flash('Role created');
    renderRoles();
  } catch (e) { flash(e.message, 'error'); }
}
async function deleteRole(name) {
  if (!confirm('Delete role "' + name + '"?')) return;
  try {
    await api('DELETE', '/api/roles/' + encodeURIComponent(name));
    flash('Role deleted');
    renderRoles();
  } catch (e) { flash(e.message, 'error'); }
}

// ---- Tenants -------------------------------------------------------------
async function renderTenants() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>Tenants</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  try {
    const { tenants: allTenants } = await api('GET', '/api/tenants');
    const tenants = _state.tenants.filter
      ? allTenants.filter(t => t.name.toLowerCase().includes(_state.tenants.filter.toLowerCase()) || t.id.toLowerCase().includes(_state.tenants.filter.toLowerCase()))
      : allTenants;
    let html = '<div class="card"><div class="card-header"><h2>Tenants</h2></div>'
      + '<div class="filter-bar"><input type="text" placeholder="Filter by name or ID…" value="' + esc(_state.tenants.filter) + '" oninput="_state.tenants.filter=this.value;renderTenants()" style="max-width:300px"><span style="font-size:.8125rem;color:#9ca3af">' + allTenants.length + ' total</span></div>';
    html += '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>';
    if (tenants.length === 0) {
      html += '<tr><td colspan="5"><div class="empty">No tenants found</div></td></tr>';
    } else {
      for (const t of tenants) {
        html += \`<tr>
          <td style="font-family:monospace;font-size:.75rem">\${esc(t.id)}</td>
          <td><strong>\${esc(t.name)}</strong></td>
          <td>\${t.isActive !== false ? badge('active','green') : badge('inactive','red')}</td>
          <td>\${ts(t.createdAt)}</td>
          <td style="display:flex;gap:.25rem">
            <button class="btn btn-sm" style="background:#d1fae5;color:#065f46" onclick="toggleTenantPanel('\${esc(t.id)}')">Members</button>
            <button class="btn btn-danger" onclick="deleteTenant('\${esc(t.id)}')">Delete</button>
          </td>
        </tr>
        \${_state.tenants.openId === t.id ? '<tr><td colspan="5" style="padding:0"><div id="tenant-panel-' + esc(t.id) + '" style="padding:1rem 1.5rem;background:#f0fdf4;border-top:1px solid #e5e7eb"></div></td></tr>' : ''}\`;
      }
    }
    html += '</tbody></table></div>';
    // Create tenant form
    html += \`<div style="padding:1rem 1.5rem;border-top:1px solid #f3f4f6">
      <div class="form-row">
        <input type="text" id="new-tenant-name" placeholder="Tenant name" style="width:240px">
        <button class="btn btn-primary btn-sm" onclick="createTenant()">Add Tenant</button>
      </div>
    </div></div>\`;
    main.innerHTML = html;
    if (_state.tenants.openId) loadTenantPanel(_state.tenants.openId);
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
function toggleTenantPanel(id) {
  _state.tenants.openId = _state.tenants.openId === id ? null : id;
  renderTenants();
}
async function loadTenantPanel(tenantId) {
  const el = document.getElementById('tenant-panel-' + tenantId);
  if (!el) return;
  el.innerHTML = '<span class="spinner"></span>';
  try {
    const { userIds } = await api('GET', '/api/tenants/' + encodeURIComponent(tenantId) + '/users').catch(() => ({ userIds: [] }));
    let html = '<strong style="font-size:.8125rem">Members (' + userIds.length + ')</strong>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:.25rem;margin:.5rem 0">' +
      (userIds.length === 0 ? '<span style="color:#9ca3af;font-size:.8125rem">No members</span>' :
        userIds.map(uid => '<span class="badge badge-green" style="cursor:pointer" title="Click to remove" onclick="removeTenantUser(' + "'" + esc(tenantId) + "'" + ' , ' + "'" + esc(uid) + "'" + ')">'+esc(uid)+ ' ✕</span>').join(' ')) +
      '</div>';
    html += '<div class="form-row" style="margin-top:.5rem">' +
      '<input type="text" id="tenant-uid-' + esc(tenantId) + '" placeholder="User ID" style="width:220px">' +
      '<button class="btn btn-primary btn-sm" onclick="addTenantUser(' + "'" + esc(tenantId) + "'" + ')">Add Member</button>' +
      '</div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<span style="color:#991b1b;font-size:.8125rem">' + esc(e.message) + '</span>';
  }
}
async function addTenantUser(tenantId) {
  const inp = document.getElementById('tenant-uid-' + tenantId);
  const userId = inp ? inp.value.trim() : '';
  if (!userId) return;
  try {
    await api('POST', '/api/tenants/' + encodeURIComponent(tenantId) + '/users', { userId });
    flash('User added to tenant');
    loadTenantPanel(tenantId);
  } catch (e) { flash(e.message, 'error'); }
}
async function removeTenantUser(tenantId, userId) {
  try {
    await api('DELETE', '/api/tenants/' + encodeURIComponent(tenantId) + '/users/' + encodeURIComponent(userId));
    flash('User removed from tenant');
    loadTenantPanel(tenantId);
  } catch (e) { flash(e.message, 'error'); }
}
async function createTenant() {
  const name = document.getElementById('new-tenant-name').value.trim();
  if (!name) return;
  try {
    await api('POST', '/api/tenants', { name, isActive: true });
    flash('Tenant created');
    renderTenants();
  } catch (e) { flash(e.message, 'error'); }
}
async function deleteTenant(id) {
  if (!confirm('Delete tenant ' + id + '?')) return;
  try {
    await api('DELETE', '/api/tenants/' + encodeURIComponent(id));
    flash('Tenant deleted');
    renderTenants();
  } catch (e) { flash(e.message, 'error'); }
}

// ---- Control -------------------------------------------------------------
async function renderControl() {
  if (!FEAT_CONTROL) {
    document.getElementById('main').innerHTML = '<div class="alert alert-error">Control store not configured.</div>';
    return;
  }
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>⚙️ Control</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  try {
    const [settings, actionsResp] = await Promise.all([
      api('GET', '/api/settings'),
      api('GET', '/api/actions').catch(() => ({ actions: [] })),
    ]);
    const registeredActions = actionsResp.actions || [];
    function toggleHtml(id, label, desc, checked) {
      return '<div class="toggle-row">'
        + '<div class="toggle-label">' + label + '<small>' + desc + '</small></div>'
        + '<label class="toggle"><input type="checkbox" id="ctrl-' + id + '" ' + (checked ? 'checked' : '') + ' onchange="updateSetting(' + "'" + id + "'" + ', this.checked)"><span class="toggle-slider"></span></label>'
        + '</div>';
    }
    // Determine current email verification mode
    const evMode = settings.emailVerificationMode
      || (settings.requireEmailVerification ? 'strict' : 'none');
    const graceDays = settings.lazyEmailVerificationGracePeriodDays ?? 7;
    const evModeHtml = '<div class="toggle-row" style="flex-direction:column;align-items:flex-start;gap:.5rem">'
      + '<div class="toggle-label">Email Verification Policy<small>Controls when users must verify their email address before logging in.</small></div>'
      + '<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.25rem">'
      + ['none','lazy','strict'].map(m => '<label style="display:flex;align-items:center;gap:.35rem;font-size:.875rem;cursor:pointer">'
          + '<input type="radio" name="evMode" value="' + m + '"' + (evMode === m ? ' checked' : '') + ' onchange="updateEmailVerificationMode(this.value)">'
          + (m === 'none' ? 'None — not required' : m === 'lazy' ? 'Lazy — required after grace period' : 'Strict — required immediately')
          + '</label>').join('')
      + '</div>'
      + '<div id="ev-grace-row" style="display:' + (evMode === 'lazy' ? 'flex' : 'none') + ';align-items:center;gap:.5rem;margin-top:.25rem">'
      + '<label style="font-size:.8125rem">Grace period (days):</label>'
      + '<input type="number" id="ev-grace-days" min="1" max="365" value="' + graceDays + '" style="width:80px;padding:.25rem .5rem;border:1px solid #d1d5db;border-radius:6px;font-size:.875rem">'
      + '<button class="btn btn-primary" style="padding:.25rem .75rem;font-size:.8125rem" onclick="saveGracePeriod()">Save</button>'
      + '</div>'
      + '</div>';

    // Webhook Actions section
    const enabledActions = settings.enabledWebhookActions || [];
    const actionsHtml = registeredActions.length === 0 ? '' :
      '<div class="card" style="margin-top:1.5rem">'
      + '<div class="card-header"><h2>🧩 Webhook Actions</h2><span class="meta">Globally enable or disable injectable actions for inbound webhook scripts</span></div>'
      + '<div style="padding:.75rem 1.5rem;max-width:640px">'
      + (() => {
          // Group by category
          const groups = {};
          for (const a of registeredActions) {
            if (!groups[a.category]) groups[a.category] = [];
            groups[a.category].push(a);
          }
          let html = '';
          for (const [cat, acts] of Object.entries(groups)) {
            html += '<div style="margin-bottom:1rem"><h3 style="font-size:.8125rem;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:.5rem">' + esc(cat) + '</h3>';
            for (const a of acts) {
              const checked = enabledActions.includes(a.id);
              const depsUnmet = (a.dependsOn || []).some(dep => !enabledActions.includes(dep));
              html += '<div class="toggle-row" style="' + (depsUnmet ? 'opacity:.5;' : '') + '">'
                + '<div class="toggle-label">' + esc(a.label)
                + (a.dependsOn && a.dependsOn.length ? '<small style="color:#f59e0b">Requires: ' + a.dependsOn.map(d => esc(d)).join(', ') + '</small>' : '')
                + '<small>' + esc(a.description) + '</small>'
                + '<code style="font-size:.7rem;color:#6b7280">' + esc(a.id) + '</code></div>'
                + '<label class="toggle"><input type="checkbox" ' + (checked ? 'checked' : '') + ' ' + (depsUnmet ? 'disabled' : '') + ' onchange="toggleWebhookAction(' + "'" + esc(a.id) + "'" + ',this.checked)"><span class="toggle-slider"></span></label>'
                + '</div>';
            }
            html += '</div>';
          }
          return html;
        })()
      + '</div></div>';

    const html = '<div class="card">'
      + '<div class="card-header"><h2>⚙️ Control Panel</h2><span class="meta">Global authentication settings</span></div>'
      + '<div style="padding:1rem 1.5rem;max-width:640px">'
      + evModeHtml
      + toggleHtml('require2FA', 'Mandatory Two-Factor Authentication', 'All users must have 2FA enabled. Users without 2FA configured will be blocked at login.', !!settings.require2FA)
      + '</div></div>'
      + actionsHtml;
    main.innerHTML = html;
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
async function toggleWebhookAction(id, enabled) {
  try {
    const settings = await api('GET', '/api/settings');
    const current = settings.enabledWebhookActions || [];
    const next = enabled ? [...new Set([...current, id])] : current.filter(x => x !== id);
    await api('PUT', '/api/settings', { enabledWebhookActions: next });
    flash('Webhook action ' + (enabled ? 'enabled' : 'disabled'));
    renderControl();
  } catch (e) {
    flash(e.message, 'error');
  }
}
async function updateEmailVerificationMode(mode) {
  try {
    await api('PUT', '/api/settings', { emailVerificationMode: mode });
    flash('Email verification policy updated');
    const graceRow = document.getElementById('ev-grace-row');
    if (graceRow) graceRow.style.display = mode === 'lazy' ? 'flex' : 'none';
  } catch (e) {
    flash(e.message, 'error');
  }
}
async function saveGracePeriod() {
  const inp = document.getElementById('ev-grace-days');
  const days = parseInt(inp ? inp.value : '7', 10);
  if (isNaN(days) || days < 1) { flash('Enter a valid number of days', 'error'); return; }
  try {
    await api('PUT', '/api/settings', { lazyEmailVerificationGracePeriodDays: days });
    flash('Grace period saved');
  } catch (e) {
    flash(e.message, 'error');
  }
}
async function updateSetting(key, value) {
  try {
    await api('PUT', '/api/settings', { [key]: value });
    flash('Setting updated');
    // If 2FA requirement changed, also apply via bulk policy endpoint when available
    if (key === 'require2FA' && FEAT_2FA_POLICY) {
      await api('POST', '/api/2fa-policy', { required: value }).catch(() => {});
    }
  } catch (e) {
    flash(e.message, 'error');
    renderControl();
  }
}

// ---- API Keys ------------------------------------------------------------
async function renderApiKeys() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>🔑 API Keys</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  try {
    const filterParam = _state.apiKeys.filter ? '&filter=' + encodeURIComponent(_state.apiKeys.filter) : '';
    const { keys, total } = await api('GET', '/api/api-keys?limit=' + PAGE_SIZE + '&offset=' + (_state.apiKeys.page * PAGE_SIZE) + filterParam);
    const hasMore = (_state.apiKeys.page + 1) * PAGE_SIZE < total;
    let rawKeyBanner = '';
    if (_state.apiKeys.newRaw) {
      rawKeyBanner = '<div class="alert alert-success" style="font-family:monospace;word-break:break-all;display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">'
        + '<span>⚠️ Copy this key now — it will not be shown again:<br><strong>' + esc(_state.apiKeys.newRaw) + '</strong></span>'
        + '<button class="btn btn-sm" style="flex-shrink:0;background:#f3f4f6;border:1px solid #e5e7eb" onclick="_state.apiKeys.newRaw=null;renderApiKeys()">Dismiss</button>'
        + '</div>';
    }
    let rows = '';
    if (keys.length === 0) {
      rows = '<tr><td colspan="7"><div class="empty">No API keys found</div></td></tr>';
    } else {
      for (const k of keys) {
  rows += \`<tr>
    <td style="font-family:monospace;font-size:.75rem">\${esc(k.keyPrefix)}…</td>
    <td><strong>\${esc(k.name)}</strong></td>
    <td>\${k.serviceId ? badge(k.serviceId,'blue') : '<span style="color:#9ca3af">—</span>'}</td>
    <td>\${(k.scopes || []).length === 0 ? '<span style="color:#9ca3af">none</span>' : (k.scopes||[]).map(s => badge(s,'indigo')).join(' ')}</td>
    <td>\${k.isActive ? badge('active','green') : badge('revoked','red')}</td>
    <td>\${ts(k.expiresAt)}</td>
    <td style="display:flex;gap:.25rem;flex-wrap:wrap">
      \${k.isActive ? '<button class="btn btn-sm" style="background:#fef3c7;color:#92400e" onclick="revokeApiKey(' + "'" + esc(k.id) + "'" + ')">Revoke</button>' : ''}
      <button class="btn btn-danger" onclick="deleteApiKey('\${esc(k.id)}')">Delete</button>
    </td>
  </tr>\`;
}
    }
    const createForm = \`<div style="padding:1rem 1.5rem;border-top:1px solid #f3f4f6">
      <strong style="font-size:.8125rem;display:block;margin-bottom:.625rem">Create new API key</strong>
      <div class="form-row" style="flex-wrap:wrap;gap:.5rem">
        <input type="text" id="ak-name" placeholder="Name (e.g. stripe-webhook)" style="width:200px">
        <input type="text" id="ak-service" placeholder="Service ID (optional)" style="width:160px">
        <input type="text" id="ak-scopes" placeholder="Scopes (comma-separated)" style="width:220px">
        <input type="text" id="ak-ips" placeholder="Allowed IPs / CIDRs (optional)" style="width:220px">
        <input type="date" id="ak-expires" style="width:150px" title="Expiry date (optional)">
        <button class="btn btn-primary btn-sm" onclick="createApiKey()">Create Key</button>
      </div>
    </div>\`;
    main.innerHTML = rawKeyBanner
      + '<div class="card"><div class="card-header"><h2>🔑 API Keys</h2><span class="meta">' + total + ' total</span></div>'
      + '<div class="filter-bar"><input type="text" placeholder="Filter by name or service…" value="' + esc(_state.apiKeys.filter) + '" oninput="_state.apiKeys.filter=this.value;_state.apiKeys.page=0;renderApiKeys()" style="max-width:300px"></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Prefix</th><th>Name</th><th>Service ID</th><th>Scopes</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + pagerHtml(_state.apiKeys.page, hasMore, '_state.apiKeys.page--;renderApiKeys()', '_state.apiKeys.page++;renderApiKeys()')
      + createForm + '</div>';
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
async function revokeApiKey(id) {
  if (!confirm('Revoke this API key? It will no longer be usable.')) return;
  try {
    await api('DELETE', '/api/api-keys/' + encodeURIComponent(id) + '/revoke');
    flash('API key revoked');
    renderApiKeys();
  } catch (e) { flash(e.message, 'error'); }
}
async function deleteApiKey(id) {
  if (!confirm('Permanently delete this API key record?')) return;
  try {
    await api('DELETE', '/api/api-keys/' + encodeURIComponent(id));
    flash('API key deleted');
    renderApiKeys();
  } catch (e) { flash(e.message, 'error'); }
}
async function createApiKey() {
  const name = document.getElementById('ak-name').value.trim();
  if (!name) { flash('Name is required', 'error'); return; }
  const serviceId = document.getElementById('ak-service').value.trim() || undefined;
  const scopes = document.getElementById('ak-scopes').value.split(',').map(s => s.trim()).filter(Boolean);
  const ips = document.getElementById('ak-ips').value.split(',').map(s => s.trim()).filter(Boolean);
  const expInput = document.getElementById('ak-expires').value;
  const expiresAt = expInput ? new Date(expInput).toISOString() : undefined;
  try {
    const { rawKey } = await api('POST', '/api/api-keys', { name, serviceId, scopes: scopes.length ? scopes : undefined, allowedIps: ips.length ? ips : undefined, expiresAt });
    _state.apiKeys.newRaw = rawKey;
    flash('API key created — copy it now!');
    renderApiKeys();
  } catch (e) { flash(e.message, 'error'); }
}

// ---- Webhooks ------------------------------------------------------------
async function renderWebhooks() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card"><div class="card-header"><h2>🔗 Webhooks</h2><span class="meta"><span class="spinner"></span></span></div></div>';
  // Format the first-column cell: inbound shows provider badge + name,
  // outgoing shows the truncated URL.
  function fmtEndpoint(w) {
    if (w.provider) return badge('inbound','purple') + ' <code style="font-size:.75rem">' + esc(w.provider) + '</code>';
    const url = w.url || '';
    return esc(url.length > 40 ? url.slice(0, 40) + '…' : url);
  }
  try {
    const [{ webhooks, total }, settingsResp, actionsResp] = await Promise.all([
      api('GET', '/api/webhooks?limit=' + PAGE_SIZE + '&offset=' + (_state.webhooks.page * PAGE_SIZE)),
      api('GET', '/api/settings').catch(() => ({ enabledWebhookActions: [] })),
      api('GET', '/api/actions').catch(() => ({ actions: [] })),
    ]);
    const hasMore = (_state.webhooks.page + 1) * PAGE_SIZE < total;
    const enabledActions = settingsResp.enabledWebhookActions || [];
    const allActions = actionsResp.actions || [];
    let rows = '';
    if (webhooks.length === 0) {
      rows = '<tr><td colspan="7"><div class="empty">No webhooks registered</div></td></tr>';
    } else {
      for (const w of webhooks) {
        const scriptIcon   = w.jsScript ? badge('⚙ script','purple') : '';
        const actionsCount = (w.allowedActions || []).length;
        const scriptCell   = scriptIcon + (actionsCount > 0 ? badge(actionsCount + ' actions','orange') : '')
                           + (!w.jsScript && actionsCount === 0 ? '<span style="color:#9ca3af">—</span>' : '');
        rows += \`<tr>
          <td style="font-family:monospace;font-size:.75rem;max-width:220px" title="\${esc(w.url || '')}">\${fmtEndpoint(w)}</td>
          <td>\${(w.events||[]).map(e => badge(e,'blue')).join(' ')}</td>
          <td>\${w.tenantId ? badge(w.tenantId,'indigo') : '<span style="color:#9ca3af">global</span>'}</td>
          <td>\${w.isActive !== false ? badge('active','green') : badge('inactive','gray')}</td>
          <td>\${scriptCell}</td>
          <td>\${w.secret ? badge('✓ signed','green') : '<span style="color:#9ca3af">unsigned</span>'}</td>
          <td style="display:flex;gap:.25rem">
            <button class="btn btn-sm" onclick="openWebhookDrawer(\${JSON.stringify(esc(w.id))})">Edit</button>
            <button class="btn btn-sm" style="background:\${w.isActive !== false ? '#fee2e2' : '#dcfce7'};color:\${w.isActive !== false ? '#991b1b' : '#166534'}" onclick="toggleWebhook('\${esc(w.id)}',\${!(w.isActive !== false)})">\${w.isActive !== false ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-danger" onclick="deleteWebhook('\${esc(w.id)}')">Delete</button>
          </td>
        </tr>\`;
      }
    }
    // Webhook drawer (hidden by default)
    const actionCheckboxes = enabledActions.length === 0 ? '<p style="font-size:.8125rem;color:#9ca3af">No actions are globally enabled. Enable them in the Control tab first.</p>'
      : enabledActions.map(id => {
          const meta = allActions.find(a => a.id === id);
          const label = meta ? esc(meta.label) : esc(id);
          return '<label style="display:flex;align-items:center;gap:.5rem;font-size:.8125rem;padding:.25rem 0;cursor:pointer">'
            + '<input type="checkbox" class="wh-action-cb" value="' + esc(id) + '">'
            + label + ' <code style="font-size:.7rem;color:#6b7280">(' + esc(id) + ')</code>'
            + '</label>';
        }).join('');
    const drawer = '<div id="wh-drawer" style="display:none;position:fixed;right:0;top:0;height:100%;width:480px;background:white;box-shadow:-4px 0 24px rgba(0,0,0,.15);z-index:100;overflow-y:auto;padding:1.5rem">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
      + '<h2 style="font-size:1rem;font-weight:700" id="wh-drawer-title">Webhook</h2>'
      + '<button onclick="closeWebhookDrawer()" style="background:none;border:none;font-size:1.25rem;cursor:pointer">✕</button>'
      + '</div>'
      + '<input type="hidden" id="wh-edit-id">'
      + '<div style="display:flex;flex-direction:column;gap:.75rem">'
      + '<label style="font-size:.8125rem;font-weight:500">Type</label>'
      + '<div style="display:flex;gap:1rem">'
      + '<label style="display:flex;align-items:center;gap:.35rem;font-size:.875rem;cursor:pointer"><input type="radio" name="wh-type" value="outgoing" checked onchange="toggleWebhookType(this.value)"> Outgoing</label>'
      + '<label style="display:flex;align-items:center;gap:.35rem;font-size:.875rem;cursor:pointer"><input type="radio" name="wh-type" value="inbound" onchange="toggleWebhookType(this.value)"> Inbound (dynamic)</label>'
      + '</div>'
      + '<div id="wh-url-row"><label style="font-size:.8125rem;font-weight:500">Endpoint URL</label><input type="text" id="wh-url" placeholder="https://example.com/webhook" style="width:100%;margin-top:.25rem"></div>'
      + '<div id="wh-provider-row" style="display:none"><label style="font-size:.8125rem;font-weight:500">Provider name</label><input type="text" id="wh-provider" placeholder="stripe" style="width:100%;margin-top:.25rem"></div>'
      + '<div><label style="font-size:.8125rem;font-weight:500">Events</label><input type="text" id="wh-events" placeholder="* or identity.auth.login.success,…" style="width:100%;margin-top:.25rem"></div>'
      + '<div><label style="font-size:.8125rem;font-weight:500">HMAC secret <span style="font-weight:400;color:#9ca3af">(optional)</span></label><input type="text" id="wh-secret" placeholder="shared-secret" style="width:100%;margin-top:.25rem"></div>'
      + '<div><label style="font-size:.8125rem;font-weight:500">Tenant ID <span style="font-weight:400;color:#9ca3af">(optional)</span></label><input type="text" id="wh-tenant" placeholder="tenant-id" style="width:100%;margin-top:.25rem"></div>'
      + '<div id="wh-actions-row" style="display:none"><label style="font-size:.8125rem;font-weight:500">Allowed actions <span style="font-weight:400;color:#9ca3af">(from globally enabled)</span></label><div style="margin-top:.25rem;padding:.75rem;border:1px solid #e5e7eb;border-radius:8px;max-height:160px;overflow-y:auto">' + actionCheckboxes + '</div></div>'
      + '<div id="wh-script-row" style="display:none">'
      + '<label style="font-size:.8125rem;font-weight:500">JavaScript (vm sandbox)</label>'
      + '<textarea id="wh-script" rows="10" style="width:100%;margin-top:.25rem;font-family:monospace;font-size:.8125rem;padding:.5rem;border:1px solid #e5e7eb;border-radius:8px;resize:vertical" placeholder="// body: inbound request payload&#10;// actions: enabled action functions&#10;// set result = { event, data } to emit an event&#10;&#10;if (body.type === &apos;invoice.payment_failed&apos;) {&#10;  result = { event: &apos;identity.tenant.user.removed&apos;, data: body.data };&#10;}"></textarea>'
      + '<div style="display:flex;gap:.5rem;margin-top:.25rem"><button class="btn btn-sm" onclick="validateWebhookScript()">Validate syntax</button><span id="wh-script-msg" style="font-size:.8125rem;align-self:center"></span></div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:.75rem;margin-top:1.5rem">'
      + '<button class="btn btn-primary" onclick="saveWebhook()">Save</button>'
      + '<button class="btn" onclick="closeWebhookDrawer()">Cancel</button>'
      + '</div></div>';

    const createForm = \`<div style="padding:1rem 1.5rem;border-top:1px solid #f3f4f6">
      <button class="btn btn-primary btn-sm" onclick="openWebhookDrawer(null)">+ Register webhook</button>
    </div>\`;
    main.innerHTML = drawer + '<div class="card"><div class="card-header"><h2>🔗 Webhooks</h2><span class="meta">' + total + ' total</span></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Endpoint / Provider</th><th>Events</th><th>Scope</th><th>Status</th><th>Script</th><th>Signing</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + pagerHtml(_state.webhooks.page, hasMore, '_state.webhooks.page--;renderWebhooks()', '_state.webhooks.page++;renderWebhooks()')
      + createForm + '</div>';
  } catch (e) {
    main.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}
function toggleWebhookType(type) {
  const isInbound = type === 'inbound';
  document.getElementById('wh-url-row').style.display = isInbound ? 'none' : 'block';
  document.getElementById('wh-provider-row').style.display = isInbound ? 'block' : 'none';
  document.getElementById('wh-actions-row').style.display = isInbound ? 'block' : 'none';
  document.getElementById('wh-script-row').style.display = isInbound ? 'block' : 'none';
}
function openWebhookDrawer(id) {
  document.getElementById('wh-edit-id').value = id || '';
  document.getElementById('wh-url').value = '';
  document.getElementById('wh-provider').value = '';
  document.getElementById('wh-events').value = '*';
  document.getElementById('wh-secret').value = '';
  document.getElementById('wh-tenant').value = '';
  document.getElementById('wh-script').value = '';
  document.getElementById('wh-script-msg').textContent = '';
  document.querySelectorAll('.wh-action-cb').forEach(cb => { cb.checked = false; });
  // Select "outgoing" radio
  document.querySelectorAll('input[name="wh-type"]').forEach(r => { r.checked = r.value === 'outgoing'; });
  toggleWebhookType('outgoing');
  document.getElementById('wh-drawer-title').textContent = id ? 'Edit webhook' : 'Register webhook';
  document.getElementById('wh-drawer').style.display = 'block';
}
function closeWebhookDrawer() { document.getElementById('wh-drawer').style.display = 'none'; }
function validateWebhookScript() {
  const script = document.getElementById('wh-script').value;
  const msg = document.getElementById('wh-script-msg');
  try {
    // new Function() constructs but NEVER calls the script — this is the
    // standard browser-side syntax-check idiom (no eval, no execution).
    new Function(script);
    msg.textContent = '✓ Syntax OK';
    msg.style.color = '#16a34a';
  } catch (e) {
    msg.textContent = '✗ ' + e.message;
    msg.style.color = '#dc2626';
  }
}
async function saveWebhook() {
  const editId = document.getElementById('wh-edit-id').value;
  const isInbound = document.querySelector('input[name="wh-type"]:checked').value === 'inbound';
  const eventsRaw = document.getElementById('wh-events').value.trim();
  const events = eventsRaw ? eventsRaw.split(',').map(s => s.trim()).filter(Boolean) : ['*'];
  const secret = document.getElementById('wh-secret').value.trim() || undefined;
  const tenantId = document.getElementById('wh-tenant').value.trim() || undefined;
  const body = { events, secret, tenantId, isActive: true };
  if (isInbound) {
    body.provider = document.getElementById('wh-provider').value.trim() || undefined;
    body.jsScript = document.getElementById('wh-script').value.trim() || undefined;
    body.allowedActions = [...document.querySelectorAll('.wh-action-cb:checked')].map(cb => cb.value);
    body.url = '';
  } else {
    body.url = document.getElementById('wh-url').value.trim();
    if (!body.url) { flash('URL is required', 'error'); return; }
  }
  try {
    if (editId) {
      await api('PATCH', '/api/webhooks/' + encodeURIComponent(editId), body);
      flash('Webhook updated');
    } else {
      await api('POST', '/api/webhooks', body);
      flash('Webhook registered');
    }
    closeWebhookDrawer();
    renderWebhooks();
  } catch (e) { flash(e.message, 'error'); }
}
async function createWebhook() { await saveWebhook(); }
async function toggleWebhook(id, active) {
  try {
    await api('PATCH', '/api/webhooks/' + encodeURIComponent(id), { isActive: active });
    flash('Webhook ' + (active ? 'enabled' : 'disabled'));
    renderWebhooks();
  } catch (e) { flash(e.message, 'error'); }
}
async function deleteWebhook(id) {
  if (!confirm('Delete this webhook registration?')) return;
  try {
    await api('DELETE', '/api/webhooks/' + encodeURIComponent(id));
    flash('Webhook deleted');
    renderWebhooks();
  } catch (e) { flash(e.message, 'error'); }
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Admin REST API + UI router
// ---------------------------------------------------------------------------

export function createAdminRouter(
  userStore: IUserStore,
  options: AdminOptions,
): Router {
  const router = Router();
  const guard = adminAuth(options.adminSecret);

  const featSessions = !!options.sessionStore;
  const featRoles = !!options.rbacStore;
  const featTenants = !!options.tenantStore;
  const featMetadata = !!options.userMetadataStore;
  const featTwoFAPolicy = typeof (userStore as unknown as Record<string, unknown>)['updateRequire2FA'] === 'function'
    && typeof userStore.listUsers === 'function';
  const featControl = !!options.settingsStore;
  const featLinkedAccounts = !!options.linkedAccountsStore;
  const featApiKeys = !!options.apiKeyStore;
  const featWebhooks = !!options.webhookStore;

  // GET /admin — serve the HTML UI
  router.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildAdminHtml(_req.baseUrl, { sessions: featSessions, roles: featRoles, tenants: featTenants, metadata: featMetadata, twoFAPolicy: featTwoFAPolicy, control: featControl, linkedAccounts: featLinkedAccounts, apiKeys: featApiKeys, webhooks: featWebhooks }));
  });

  // GET /admin/api/ping — health / auth check
  router.get('/api/ping', guard, (_req: Request, res: Response) => {
    res.json({ ok: true, features: { sessions: featSessions, roles: featRoles, tenants: featTenants, metadata: featMetadata, twoFAPolicy: featTwoFAPolicy, control: featControl, linkedAccounts: featLinkedAccounts, apiKeys: featApiKeys, webhooks: featWebhooks } });
  });

  // ---- Users ----------------------------------------------------------------

  // GET /admin/api/users?limit=&offset=
  router.get('/api/users', guard, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);
      const offset = parseInt((req.query['offset'] as string) || '0', 10);
      const filter = (req.query['filter'] as string || '').toLowerCase().trim();
      if (!userStore.listUsers) {
        res.status(501).json({ error: 'IUserStore.listUsers is not implemented', users: [], total: 0 });
        return;
      }
      // When a filter is provided, fetch up to 500 users to apply in-memory filtering.
      // This is a best-effort approach for stores that don't implement native filtering.
      // For large deployments, implement server-side filtering directly in IUserStore.listUsers.
      const batchLimit = filter ? 500 : limit;
      const batchOffset = filter ? 0 : offset;
      const users = await userStore.listUsers(batchLimit, batchOffset);
      // Strip sensitive fields before sending to admin
      let safe = users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isEmailVerified: u.isEmailVerified,
        isTotpEnabled: u.isTotpEnabled,
        require2FA: u.require2FA,
        phoneNumber: u.phoneNumber,
        createdAt: (u as unknown as Record<string, unknown>)['createdAt'],
      }));
      if (filter) {
        safe = safe.filter(u => u.email.toLowerCase().includes(filter) || u.id.toLowerCase().includes(filter));
        const total = safe.length;
        safe = safe.slice(offset, offset + limit);
        res.json({ users: safe, total });
        return;
      }
      // Return total as the count of users returned (best-effort — stores may not expose total)
      res.json({ users: safe, total: safe.length + offset + (safe.length === limit ? 1 : 0) });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /admin/api/users/:id
  router.get('/api/users/:id', guard, async (req: Request, res: Response) => {
    try {
      const user = await userStore.findById(req.params['id'] as string);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      res.json({
        id: user.id, email: user.email, role: user.role,
        isEmailVerified: user.isEmailVerified, isTotpEnabled: user.isTotpEnabled,
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/users/:id — delete user (requires userStore to have a delete method if available)
  router.delete('/api/users/:id', guard, async (req: Request, res: Response) => {
    try {
      const store = userStore as unknown as Record<string, unknown>;
      if (typeof store['deleteUser'] === 'function') {
        await (store['deleteUser'] as (id: string) => Promise<void>)(req.params['id'] as string);
        res.json({ success: true });
      } else {
        res.status(501).json({ error: 'IUserStore.deleteUser is not implemented' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- User Metadata --------------------------------------------------------

  // POST /admin/api/2fa-policy — bulk set / clear the require-2FA flag on all users
  router.post('/api/2fa-policy', guard, async (req: Request, res: Response) => {
    try {
      const { required } = req.body as { required: boolean };
      if (typeof required !== 'boolean') {
        res.status(400).json({ error: '"required" must be a boolean' });
        return;
      }
      if (typeof (userStore as unknown as Record<string, unknown>)['updateRequire2FA'] !== 'function') {
        res.status(501).json({ error: 'IUserStore.updateRequire2FA is not implemented' });
        return;
      }
      if (!userStore.listUsers) {
        res.status(501).json({ error: 'IUserStore.listUsers is not implemented' });
        return;
      }
      const updateFn = (userStore as unknown as { updateRequire2FA(id: string, required: boolean): Promise<void> }).updateRequire2FA.bind(userStore);
      let offset = 0;
      const batchSize = 100;
      let updated = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await userStore.listUsers(batchSize, offset);
        if (batch.length === 0) break;
        await Promise.all(batch.map(u => updateFn(u.id, required)));
        updated += batch.length;
        if (batch.length < batchSize) break;
        offset += batchSize;
      }
      res.json({ success: true, updated });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /admin/api/users/:id/metadata
  router.get('/api/users/:id/metadata', guard, async (req: Request, res: Response) => {
    if (!options.userMetadataStore) { res.status(404).json({ error: 'User metadata store not configured' }); return; }
    try {
      const metadata = await options.userMetadataStore.getMetadata(req.params['id'] as string);
      res.json(metadata);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /admin/api/users/:id/metadata
  router.put('/api/users/:id/metadata', guard, async (req: Request, res: Response) => {
    if (!options.userMetadataStore) { res.status(404).json({ error: 'User metadata store not configured' }); return; }
    try {
      const metadata = req.body as Record<string, unknown>;
      await options.userMetadataStore.updateMetadata(req.params['id'] as string, metadata);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Linked Accounts (read-only view in admin panel) ----------------------

  // GET /admin/api/users/:id/linked-accounts
  router.get('/api/users/:id/linked-accounts', guard, async (req: Request, res: Response) => {
    if (!options.linkedAccountsStore) { res.status(404).json({ error: 'Linked accounts store not configured' }); return; }
    try {
      const linkedAccounts = await options.linkedAccountsStore.getLinkedAccounts(req.params['id'] as string);
      res.json({ linkedAccounts });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- User ↔ Role assignment -----------------------------------------------

  // GET /admin/api/users/:id/roles
  router.get('/api/users/:id/roles', guard, async (req: Request, res: Response) => {
    if (!options.rbacStore) { res.status(404).json({ error: 'RBAC store not configured' }); return; }
    try {
      const roles = await options.rbacStore.getRolesForUser(req.params['id'] as string);
      res.json({ roles });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/api/users/:id/roles — assign a role to a user
  router.post('/api/users/:id/roles', guard, async (req: Request, res: Response) => {
    if (!options.rbacStore) { res.status(404).json({ error: 'RBAC store not configured' }); return; }
    try {
      const { role, tenantId } = req.body as { role: string; tenantId?: string };
      if (!role) { res.status(400).json({ error: 'role is required' }); return; }
      await options.rbacStore.addRoleToUser(req.params['id'] as string, role, tenantId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/users/:id/roles/:role — remove a role from a user
  router.delete('/api/users/:id/roles/:role', guard, async (req: Request, res: Response) => {
    if (!options.rbacStore) { res.status(404).json({ error: 'RBAC store not configured' }); return; }
    try {
      await options.rbacStore.removeRoleFromUser(
        req.params['id'] as string,
        decodeURIComponent(req.params['role'] as string),
      );
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- User ↔ Tenant assignment (from user panel) --------------------------

  // GET /admin/api/users/:id/tenants
  router.get('/api/users/:id/tenants', guard, async (req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      const tenants = await options.tenantStore.getTenantsForUser(req.params['id'] as string);
      res.json({ tenantIds: tenants.map(t => t.id) });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Control settings -----------------------------------------------------

  // GET /admin/api/actions — return registered webhook action metadata
  router.get('/api/actions', guard, (_req: Request, res: Response) => {
    res.json({ actions: ActionRegistry.getAllMeta() });
  });

  // GET /admin/api/settings
  router.get('/api/settings', guard, async (_req: Request, res: Response) => {
    if (!options.settingsStore) { res.status(404).json({ error: 'Settings store not configured' }); return; }
    try {
      const settings = await options.settingsStore.getSettings();
      res.json(settings);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /admin/api/settings
  router.put('/api/settings', guard, async (req: Request, res: Response) => {
    if (!options.settingsStore) { res.status(404).json({ error: 'Settings store not configured' }); return; }
    try {
      const updates = req.body as Record<string, unknown>;
      await options.settingsStore.updateSettings(updates);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Sessions -------------------------------------------------------------

  // GET /admin/api/sessions?limit=&offset=&filter=
  router.get('/api/sessions', guard, async (req: Request, res: Response) => {
    if (!options.sessionStore) { res.status(404).json({ error: 'Session store not configured' }); return; }
    try {
      const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);
      const offset = parseInt((req.query['offset'] as string) || '0', 10);
      const filter = (req.query['filter'] as string || '').toLowerCase().trim();
      if (!options.sessionStore.getAllSessions) {
        res.status(501).json({ error: 'ISessionStore.getAllSessions is not implemented', sessions: [], total: 0 });
        return;
      }
      if (filter) {
        // Best-effort in-memory filter (up to 500 records). For large deployments,
        // implement native filtering in ISessionStore.getAllSessions.
        const all = await options.sessionStore.getAllSessions(500, 0);
        const filtered = all.filter(s =>
          s.userId.toLowerCase().includes(filter) ||
          (s.ipAddress ?? '').toLowerCase().includes(filter)
        );
        const total = filtered.length;
        res.json({ sessions: filtered.slice(offset, offset + limit), total });
        return;
      }
      const sessions = await options.sessionStore.getAllSessions(limit, offset);
      res.json({ sessions, total: sessions.length + offset + (sessions.length === limit ? 1 : 0) });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/sessions/:handle
  router.delete('/api/sessions/:handle', guard, async (req: Request, res: Response) => {
    if (!options.sessionStore) { res.status(404).json({ error: 'Session store not configured' }); return; }
    try {
      await options.sessionStore.revokeSession(decodeURIComponent(req.params['handle'] as string));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Roles & Permissions --------------------------------------------------

  // GET /admin/api/roles
  router.get('/api/roles', guard, async (_req: Request, res: Response) => {
    if (!options.rbacStore) { res.status(404).json({ error: 'RBAC store not configured' }); return; }
    try {
      if (!options.rbacStore.getAllRoles) {
        res.status(501).json({ error: 'IRolesPermissionsStore.getAllRoles is not implemented', roles: [] });
        return;
      }
      const roleNames = await options.rbacStore.getAllRoles();
      const roles = await Promise.all(
        roleNames.map(async name => ({
          name,
          permissions: await options.rbacStore!.getPermissionsForRole(name),
        }))
      );
      res.json({ roles });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/api/roles
  router.post('/api/roles', guard, async (req: Request, res: Response) => {
    if (!options.rbacStore) { res.status(404).json({ error: 'RBAC store not configured' }); return; }
    try {
      const { name, permissions } = req.body as { name: string; permissions?: string[] };
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      await options.rbacStore.createRole(name, permissions);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/roles/:name
  router.delete('/api/roles/:name', guard, async (req: Request, res: Response) => {
    if (!options.rbacStore) { res.status(404).json({ error: 'RBAC store not configured' }); return; }
    try {
      await options.rbacStore.deleteRole(decodeURIComponent(req.params['name'] as string));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Tenants --------------------------------------------------------------

  // GET /admin/api/tenants
  router.get('/api/tenants', guard, async (_req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      const tenants = await options.tenantStore.getAllTenants();
      res.json({ tenants });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/api/tenants
  router.post('/api/tenants', guard, async (req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      const { name, isActive } = req.body as { name: string; isActive?: boolean };
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const tenant = await options.tenantStore.createTenant({ name, isActive: isActive ?? true });
      res.json({ tenant });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/tenants/:id
  router.delete('/api/tenants/:id', guard, async (req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      await options.tenantStore.deleteTenant(decodeURIComponent(req.params['id'] as string));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Tenant ↔ User membership ---------------------------------------------

  // GET /admin/api/tenants/:id/users
  router.get('/api/tenants/:id/users', guard, async (req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      const userIds = await options.tenantStore.getUsersForTenant(decodeURIComponent(req.params['id'] as string));
      res.json({ userIds });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/api/tenants/:id/users — add a user to a tenant
  router.post('/api/tenants/:id/users', guard, async (req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      const { userId } = req.body as { userId: string };
      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
      await options.tenantStore.associateUserWithTenant(userId, decodeURIComponent(req.params['id'] as string));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/tenants/:id/users/:userId — remove a user from a tenant
  router.delete('/api/tenants/:id/users/:userId', guard, async (req: Request, res: Response) => {
    if (!options.tenantStore) { res.status(404).json({ error: 'Tenant store not configured' }); return; }
    try {
      await options.tenantStore.disassociateUserFromTenant(
        decodeURIComponent(req.params['userId'] as string),
        decodeURIComponent(req.params['id'] as string),
      );
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── API Keys ───────────────────────────────────────────────────────────────

  // GET /admin/api/api-keys?limit=&offset=&filter=
  router.get('/api/api-keys', guard, async (req: Request, res: Response) => {
    if (!options.apiKeyStore) { res.status(404).json({ error: 'API key store not configured' }); return; }
    try {
      const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);
      const offset = parseInt((req.query['offset'] as string) || '0', 10);
      const filter = (req.query['filter'] as string || '').toLowerCase().trim();
      if (!options.apiKeyStore.listAll) {
        res.status(501).json({ error: 'IApiKeyStore.listAll is not implemented', keys: [], total: 0 });
        return;
      }
      const batchLimit = filter ? 500 : limit;
      const batchOffset = filter ? 0 : offset;
      const keys = await options.apiKeyStore.listAll(batchLimit, batchOffset);
      const safe = (arr: typeof keys) => arr.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        serviceId: k.serviceId,
        scopes: k.scopes,
        allowedIps: k.allowedIps,
        isActive: k.isActive,
        expiresAt: k.expiresAt,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));
      if (filter) {
        const filtered = safe(keys).filter(k =>
          k.name.toLowerCase().includes(filter) ||
          (k.serviceId ?? '').toLowerCase().includes(filter) ||
          k.keyPrefix.toLowerCase().includes(filter)
        );
        const total = filtered.length;
        res.json({ keys: filtered.slice(offset, offset + limit), total });
        return;
      }
      res.json({ keys: safe(keys), total: keys.length + offset + (keys.length === limit ? 1 : 0) });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/api/api-keys — create a new key (returns rawKey once)
  router.post('/api/api-keys', guard, async (req: Request, res: Response) => {
    if (!options.apiKeyStore) { res.status(404).json({ error: 'API key store not configured' }); return; }
    try {
      const { name, serviceId, scopes, allowedIps, expiresAt } = req.body as {
        name: string;
        serviceId?: string;
        scopes?: string[];
        allowedIps?: string[];
        expiresAt?: string;
      };
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const service = new ApiKeyService();
      const { rawKey, record } = await service.createKey(options.apiKeyStore, {
        name,
        serviceId,
        scopes,
        allowedIps,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      res.json({
        rawKey,
        record: {
          id: record.id,
          name: record.name,
          keyPrefix: record.keyPrefix,
          serviceId: record.serviceId,
          scopes: record.scopes,
          allowedIps: record.allowedIps,
          isActive: record.isActive,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
        },
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/api-keys/:id/revoke — mark inactive (soft revoke)
  router.delete('/api/api-keys/:id/revoke', guard, async (req: Request, res: Response) => {
    if (!options.apiKeyStore) { res.status(404).json({ error: 'API key store not configured' }); return; }
    try {
      await options.apiKeyStore.revoke(req.params['id'] as string);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/api-keys/:id — hard delete (falls back to revoke if .delete not implemented)
  router.delete('/api/api-keys/:id', guard, async (req: Request, res: Response) => {
    if (!options.apiKeyStore) { res.status(404).json({ error: 'API key store not configured' }); return; }
    try {
      if (typeof options.apiKeyStore.delete === 'function') {
        await options.apiKeyStore.delete(req.params['id'] as string);
        res.json({ success: true });
      } else {
        await options.apiKeyStore.revoke(req.params['id'] as string);
        res.json({ success: true, note: 'IApiKeyStore.delete not implemented; key was revoked instead' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Webhooks ───────────────────────────────────────────────────────────────

  // GET /admin/api/webhooks?limit=&offset=
  router.get('/api/webhooks', guard, async (req: Request, res: Response) => {
    if (!options.webhookStore) { res.status(404).json({ error: 'Webhook store not configured' }); return; }
    try {
      const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);
      const offset = parseInt((req.query['offset'] as string) || '0', 10);
      if (!options.webhookStore.listAll) {
        res.status(501).json({ error: 'IWebhookStore.listAll is not implemented', webhooks: [], total: 0 });
        return;
      }
      const webhooks = await options.webhookStore.listAll(limit, offset);
      const safe = webhooks.map(w => ({
        id: w.id,
        url: w.url,
        events: w.events,
        isActive: w.isActive,
        tenantId: w.tenantId,
        maxRetries: w.maxRetries,
        retryDelayMs: w.retryDelayMs,
        secret: w.secret ? '***' : undefined,
      }));
      res.json({ webhooks: safe, total: safe.length + offset + (safe.length === limit ? 1 : 0) });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/api/webhooks — register a new webhook
  router.post('/api/webhooks', guard, async (req: Request, res: Response) => {
    if (!options.webhookStore) { res.status(404).json({ error: 'Webhook store not configured' }); return; }
    try {
      const { url, events, secret, tenantId, isActive, maxRetries, retryDelayMs } = req.body as {
        url: string; events?: string[]; secret?: string; tenantId?: string;
        isActive?: boolean; maxRetries?: number; retryDelayMs?: number;
      };
      if (!url) { res.status(400).json({ error: 'url is required' }); return; }
      if (!options.webhookStore.add) {
        res.status(501).json({ error: 'IWebhookStore.add is not implemented' });
        return;
      }
      const webhook = await options.webhookStore.add({
        url, events: events ?? ['*'], secret, tenantId,
        isActive: isActive ?? true, maxRetries, retryDelayMs,
      });
      res.json({ webhook: { ...webhook, secret: webhook.secret ? '***' : undefined } });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /admin/api/webhooks/:id — partial update (e.g. toggle isActive)
  router.patch('/api/webhooks/:id', guard, async (req: Request, res: Response) => {
    if (!options.webhookStore) { res.status(404).json({ error: 'Webhook store not configured' }); return; }
    try {
      if (!options.webhookStore.update) {
        res.status(501).json({ error: 'IWebhookStore.update is not implemented' });
        return;
      }
      await options.webhookStore.update(req.params['id'] as string, req.body as Record<string, unknown>);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /admin/api/webhooks/:id
  router.delete('/api/webhooks/:id', guard, async (req: Request, res: Response) => {
    if (!options.webhookStore) { res.status(404).json({ error: 'Webhook store not configured' }); return; }
    try {
      if (!options.webhookStore.remove) {
        res.status(501).json({ error: 'IWebhookStore.remove is not implemented' });
        return;
      }
      await options.webhookStore.remove(req.params['id'] as string);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Swagger / OpenAPI (optional) ───────────────────────────────────────────
  const swaggerEnabled =
    options.swagger === true ||
    (options.swagger !== false && process.env['NODE_ENV'] !== 'production');

  if (swaggerEnabled) {
    const specBasePath = options.swaggerBasePath ?? '/admin';
    router.get('/api/openapi.json', (_req: Request, res: Response) => {
      const spec = buildAdminOpenApiSpec(
        {
          hasSessions: !!options.sessionStore,
          hasRoles: !!options.rbacStore,
          hasTenants: !!options.tenantStore,
          hasMetadata: !!options.userMetadataStore,
          hasSettings: !!options.settingsStore,
          hasLinkedAccounts: !!options.linkedAccountsStore,
          hasApiKeys: !!options.apiKeyStore,
          hasWebhooks: !!options.webhookStore,
        },
        specBasePath,
      );
      res.setHeader('Content-Type', 'application/json');
      res.json(spec);
    });

    router.get('/api/docs', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildSwaggerUiHtml(`${specBasePath}/api/openapi.json`));
    });
  }

  return router;
}
