/**
 * Universal Authentication Service & Utility Wrapper for Vanilla JS UI
 * Combines global fetch interception with the internal AuthService API used by the UI.
 * Extensible for single-page applications via AwesomeNodeAuth.init(options).
 */
(function () {
    // --- STATE ---
    let refreshInProgress = null;
    let isAuthenticated = false;
    let isInitialized = false;
    let currentUser = null;

    // --- DEFAULT CONFIG ---
    // apiPrefix derivato automaticamente dal pathname se incluso nelle pagine UI
    let defaultPrefix = window.location.pathname.includes('/ui/')
        ? window.location.pathname.split('/ui/')[0]
        : '/auth';

    let UI_CONFIG = {
        apiPrefix: defaultPrefix,
        loginUrl: defaultPrefix + '/ui/login',
        homeUrl: '/',
        siteName: 'Awesome Node Auth',
        features: {}
    };

    // --- OVERRIDES ---
    // Metodi overridabili tramite AwesomeNodeAuth.init()
    let _overrides = {
        login: null,
        logout: null,
        register: null,
        forgotPassword: null,
        resetPassword: null,
        changePassword: null,
        setPassword: null,
        sendMagicLink: null,
        verifyMagicLink: null,
        setup2fa: null,
        verify2faSetup: null,
        validate2fa: null,
        sendSmsLogin: null,
        verifySmsLogin: null,
        validateSms: null,
        resendVerificationEmail: null,
        verifyEmail: null,
        requestEmailChange: null,
        confirmEmailChange: null,
        requestLinkingEmail: null,
        verifyLinkingToken: null,
        verifyConflictLinkingToken: null,
        getLinkedAccounts: null,
        unlinkAccount: null,
        deleteAccount: null,
        // hooks lifecycle
        onLogout: null,
        onSessionExpired: null,
        onRefreshSuccess: null,
        onRefreshFail: null,
    };

    // --- CSRF ---
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function addCsrfHeader(headers = {}) {
        const token = getCookie('__Host-csrf-token') || getCookie('__Secure-csrf-token') || getCookie('csrf-token');
        if (token) headers['X-CSRF-Token'] = token;
        return headers;
    }

    // --- UTIL ---
    function isAuthEndpoint(url) {
        if (typeof url !== 'string') return false;
        return [
            `${UI_CONFIG.apiPrefix}/login`,
            `${UI_CONFIG.apiPrefix}/logout`,
            `${UI_CONFIG.apiPrefix}/refresh`,
            `${UI_CONFIG.apiPrefix}/me`
        ].some(e => url.includes(e));
    }

    function getLoginUrl() {
        return UI_CONFIG.loginUrl || `${UI_CONFIG.apiPrefix}/ui/login`;
    }

    // --- REFRESH ---
    function refreshToken() {
        if (refreshInProgress) return refreshInProgress;
        refreshInProgress = originalFetch(`${UI_CONFIG.apiPrefix}/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: addCsrfHeader({ 'Content-Type': 'application/json' })
        })
            .then(r => r.json())
            .finally(() => { refreshInProgress = null; });
        return refreshInProgress;
    }

    // --- FETCH INTERCEPTOR ---
    const originalFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;

        // Derive the auth backend origin so that every request to the same
        // domain as the auth server gets credentials/CSRF headers — not just
        // requests whose path starts with apiPrefix.  This covers routes like
        // /mcp on the same host as /auth (cross-domain headless deployments).
        //
        // We use window.location.href as the base for resolving relative URLs.
        // Try/catch guards against malformed URLs; on failure both origins stay
        // null and only the isAuthEndpoint() path-based fallback is used.
        let backendOrigin = null;
        let requestOrigin = null;
        try {
            const pageBase = window.location?.href || '';
            backendOrigin = UI_CONFIG.apiPrefix.startsWith('http')
                ? new URL(UI_CONFIG.apiPrefix).origin
                : new URL(pageBase).origin;
            requestOrigin = new URL(url, pageBase).origin;
        } catch (_) { /* malformed URL — isAuthEndpoint() below handles known endpoints */ }

        const isBackendRequest = backendOrigin !== null && backendOrigin === requestOrigin;
        const isAuthRequest = isBackendRequest || isAuthEndpoint(url);

        if (isAuthRequest) {
            if (!init.headers) init.headers = {};
            if (init.headers instanceof Headers) {
                const token = getCookie('__Host-csrf-token') || getCookie('__Secure-csrf-token') || getCookie('csrf-token');
                if (token) init.headers.set('X-CSRF-Token', token);
            } else {
                init.headers = addCsrfHeader(init.headers);
            }
            init.credentials = init.credentials || 'include';
        }

        let response = await originalFetch(input, init);

        if ((response.status === 401 || response.status === 403) && !isAuthEndpoint(url)) {
            // Peek at the response body to detect a permanent SESSION_REVOKED error.
            // We must clone() before reading so the original response stays consumable.
            let errBody = null;
            try { errBody = await response.clone().json(); } catch (_) {}

            // If the server already told us the session is permanently revoked,
            // skip the refresh entirely — retrying would only loop forever.
            const isRevoked = errBody && errBody.code === 'SESSION_REVOKED';

            if (!isRevoked) {
                try {
                    const refreshResult = await refreshToken();
                    // Guard against SESSION_REVOKED coming back from the refresh
                    // endpoint (e.g. when checkOn:'refresh') — it has no `success`
                    // field, so the old `!== false` check would incorrectly treat
                    // it as a success and re-issue the original request, looping.
                    const refreshRevoked = refreshResult && refreshResult.code === 'SESSION_REVOKED';
                    if (!refreshRevoked && refreshResult && refreshResult.success !== false) {
                        if (_overrides.onRefreshSuccess) _overrides.onRefreshSuccess(refreshResult);
                        if (!(init.headers instanceof Headers)) {
                            init.headers = addCsrfHeader(init.headers);
                        }
                        return originalFetch(input, init);
                    }
                } catch (e) {
                    console.error('[AwesomeNodeAuth] Auto-refresh failed', e);
                }
            }

            // Refresh fallito
            if (_overrides.onRefreshFail) {
                _overrides.onRefreshFail();
            } else {
                try {
                    await originalFetch(`${UI_CONFIG.apiPrefix}/logout`, {
                        method: 'POST',
                        credentials: 'include'
                    });
                } catch (e) { }
            }

            isAuthenticated = false;
            currentUser = null;
            if (window.AuthService) window.AuthService.user = null;

            if (_overrides.onSessionExpired) {
                _overrides.onSessionExpired();
            } else if (!window.location.pathname.includes('/login')) {
                window.location.href = getLoginUrl();
            }
        }

        return response;
    };

    // --- HEADLESS MODE HELPER ---
    /**
     * Auto-installs no-op lifecycle handlers when the server is running in
     * headless UI mode (authConfig.ui.headless === true).
     *
     * In headless mode the backend does not serve login/register HTML pages — a
     * remote SPA (e.g. a Docusaurus wiki) loads auth.js via a <script> tag and
     * handles authentication in its own UI.  Without this guard, auth.js would
     * redirect window.location to its own (missing) login page whenever the session
     * expires or a refresh fails, breaking the SPA navigation entirely.
     *
     * The function is idempotent: if the caller has already registered a custom
     * handler it is left untouched (explicit beats implicit).
     */
    function _applyHeadlessIfNeeded() {
        if (!UI_CONFIG.headless) return;
        if (!_overrides.onSessionExpired) _overrides.onSessionExpired = function () { };
        if (!_overrides.onRefreshFail)    _overrides.onRefreshFail    = function () { };
        if (!_overrides.onLogout)         _overrides.onLogout         = function () { };
    }

    // --- INTERNAL AUTH SERVICE (pagine statiche della libreria) ---
    window.AuthService = {
        config: UI_CONFIG,
        user: null,

        async init() {
            try {
                // SERVER-SIDE RENDERING (SSR) Fast-Path
                // If __AUTH_CONFIG__ was injected into the HTML (e.g. via ui.router.ts),
                // skip fetching so the UI initialization is purely synchronous and FOUC-free.
                if (window.__AUTH_CONFIG__) {
                    UI_CONFIG = { ...UI_CONFIG, ...window.__AUTH_CONFIG__ };
                } else {
                    const res = await fetch(`${UI_CONFIG.apiPrefix}/ui/config`);
                    if (res.ok) {
                        const dynamicConfig = await res.json();
                        UI_CONFIG = { ...UI_CONFIG, ...dynamicConfig };
                    }
                }

                this.config = UI_CONFIG;
                window.AwesomeNodeAuth.config = UI_CONFIG;

                // Headless mode: the server reported that HTML pages are not served
                // (a remote SPA is hosting the login UI).  Auto-install no-op lifecycle
                // handlers so auth.js never redirects window.location away from the SPA.
                _applyHeadlessIfNeeded();
            } catch (e) { console.warn('[AwesomeNodeAuth] Failed to load UI config', e); }

            // Theme is mostly handled via SSR HTML injection now, but we keep this 
            // as an absolute fallback or if manual API loading occurred.
            if (UI_CONFIG.ui && !window.__AUTH_CONFIG__) {
                const root = document.documentElement;
                if (UI_CONFIG.ui.primaryColor) {
                    root.style.setProperty('--primary-color', UI_CONFIG.ui.primaryColor);
                    root.style.setProperty('--input-focus', UI_CONFIG.ui.primaryColor);
                }
                if (UI_CONFIG.ui.secondaryColor) root.style.setProperty('--secondary-color', UI_CONFIG.ui.secondaryColor);
                if (UI_CONFIG.ui.bgColor) root.style.setProperty('--bg-color', UI_CONFIG.ui.bgColor);
                if (UI_CONFIG.ui.cardBg) root.style.setProperty('--card-bg', UI_CONFIG.ui.cardBg);
                if (UI_CONFIG.ui.bgImage) {
                    const safeUrl = UI_CONFIG.ui.bgImage.replace(/['"\\]/g, m => encodeURIComponent(m));
                    root.style.setProperty('--bg-image', 'url("' + safeUrl + '")');
                }
                if (UI_CONFIG.ui.logoUrl) {
                    document.querySelectorAll('.logo').forEach(el => {
                        el.src = UI_CONFIG.ui.logoUrl;
                        el.classList.remove('hidden');
                    });
                }
                if (UI_CONFIG.ui.siteName) {
                    document.title = UI_CONFIG.ui.siteName;
                    document.querySelectorAll('.site-name').forEach(el => {
                        el.textContent = UI_CONFIG.ui.siteName;
                    });
                }
                if (UI_CONFIG.ui.customCss) {
                    const style = document.createElement('style');
                    style.textContent = UI_CONFIG.ui.customCss;
                    document.head.appendChild(style);
                }
            }

            await window.AwesomeNodeAuth.checkSession();
            this.user = currentUser;
        },

        async apiCall(endpoint, method = 'POST', body = null) {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
            };
            if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
                options.body = JSON.stringify(body);
            }
            const res = await fetch(`${UI_CONFIG.apiPrefix}${endpoint}`, options);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                data.success = false;
                if (!data.error) data.error = 'Request failed (' + res.status + ')';
            }
            return data;
        }
    };

    // --- HELPERS INTERNI ---
    async function _checkSessionInternal() {
        try {
            const res = await originalFetch(`${UI_CONFIG.apiPrefix}/me`, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });
            isAuthenticated = res.ok;
            currentUser = res.ok ? await res.json() : null;
        } catch (e) {
            isAuthenticated = false;
            currentUser = null;
        }
        if (window.AuthService) window.AuthService.user = currentUser;
        isInitialized = true;
        return isAuthenticated;
    }

    async function _logoutInternal() {
        await window.AuthService.apiCall('/logout', 'POST');
        isAuthenticated = false;
        currentUser = null;
        if (window.AuthService) window.AuthService.user = null;
        if (_overrides.onLogout) {
            _overrides.onLogout();
        } else {
            window.location.href = getLoginUrl();
        }
    }

    // --- PUBLIC API ---
    window.AwesomeNodeAuth = {
        config: UI_CONFIG,

        /**
         * Configurazione opzionale. Se non chiamato, funziona con i default.
         * 
         * @param {object} options
         * @param {string} [options.apiPrefix]        - Base path del backend. Default: derivato dal pathname
         * @param {string} [options.loginUrl]         - URL pagina login. Default: {apiPrefix}/ui/login
         * @param {string} [options.homeUrl]          - URL home dopo login. Default: '/'
         * @param {boolean} [options.headless]        - Headless mode: installs no-op onSessionExpired /
         *                                              onLogout / onRefreshFail handlers immediately so
         *                                              auth.js never redirects window.location. Useful
         *                                              when loading auth.js from a remote SPA (e.g.
         *                                              Docusaurus) that manages its own navigation.
         * @param {Function} [options.login]          - Override metodo login
         * @param {Function} [options.logout]         - Override metodo logout
         * @param {Function} [options.register]       - Override metodo register
         * @param {Function} [options.onLogout]       - Callback post-logout (sostituisce redirect automatico)
         * @param {Function} [options.onSessionExpired] - Callback sessione scaduta (sostituisce redirect automatico)
         * @param {Function} [options.onRefreshSuccess] - Callback refresh riuscito
         * @param {Function} [options.onRefreshFail]  - Callback refresh fallito
         * 
         * @example
         * // Zero config
         * // <script src="/auth/ui/assets/auth.js"></script>
         *
         * // Con config base
         * AwesomeNodeAuth.init({ apiPrefix: '/api/auth', loginUrl: '/login' });
         *
         * // Con override metodo
         * AwesomeNodeAuth.init({
         *   apiPrefix: '/api/auth',
         *   login: async (email, password) => {
         *     console.log('custom login');
         *     return window.AuthService.apiCall('/login', 'POST', { email, password });
         *   },
         *   onSessionExpired: () => myRouter.navigate('/login')
         * });
         */
        init(options = {}) {
            const {
                apiPrefix, loginUrl, homeUrl, siteName, headless,
                onLogout, onSessionExpired, onRefreshSuccess, onRefreshFail,
                ...methodOverrides
            } = options;

            // Aggiorna config
            if (apiPrefix) UI_CONFIG.apiPrefix = apiPrefix;
            if (loginUrl) UI_CONFIG.loginUrl = loginUrl;
            if (homeUrl) UI_CONFIG.homeUrl = homeUrl;
            if (siteName) UI_CONFIG.siteName = siteName;
            // headless: true → mark config immediately so _applyHeadlessIfNeeded() fires
            if (headless) UI_CONFIG.headless = true;
            this.config = UI_CONFIG;
            if (window.AuthService) window.AuthService.config = UI_CONFIG;

            // Registra hooks lifecycle
            if (onLogout) _overrides.onLogout = onLogout;
            if (onSessionExpired) _overrides.onSessionExpired = onSessionExpired;
            if (onRefreshSuccess) _overrides.onRefreshSuccess = onRefreshSuccess;
            if (onRefreshFail) _overrides.onRefreshFail = onRefreshFail;

            // Registra override metodi
            const overridableMetods = [
                'login', 'logout', 'register', 'forgotPassword', 'resetPassword',
                'changePassword', 'setPassword', 'sendMagicLink', 'verifyMagicLink',
                'setup2fa', 'verify2faSetup', 'validate2fa', 'sendSmsLogin',
                'verifySmsLogin', 'validateSms', 'resendVerificationEmail',
                'verifyEmail', 'requestEmailChange', 'confirmEmailChange',
                'requestLinkingEmail', 'verifyLinkingToken', 'verifyConflictLinkingToken',
                'getLinkedAccounts', 'unlinkAccount', 'deleteAccount'
            ];
            overridableMetods.forEach(method => {
                if (typeof methodOverrides[method] === 'function') {
                    _overrides[method] = methodOverrides[method];
                }
            });

            // Apply headless no-op handlers if the config reports headless mode.
            // This covers the case where init() is called from a Docusaurus <head>
            // before AuthService.init() has had a chance to fetch /ui/config.
            _applyHeadlessIfNeeded();
        },

        // --- STATE ---
        isAuthenticated: () => isAuthenticated,
        isInitialized: () => isInitialized,
        getUser: () => currentUser,

        // --- REFRESH ---

        /**
         * Trigger a token refresh using the shared in-flight singleton.
         * Safe to call concurrently — multiple callers receive the same Promise.
         * Exposed so that external scripts (e.g. Docusaurus wiki components) can
         * delegate their own refresh calls here instead of duplicating the logic,
         * ensuring a single HTTP request is made even across module boundaries.
         *
         * @returns {Promise<boolean>} true if the refresh succeeded, false otherwise
         */
        async refresh() {
            const result = await refreshToken().catch(() => null);
            // SESSION_REVOKED is a permanent failure — never treat it as success
            if (result && result.code === 'SESSION_REVOKED') return false;
            // Succeeds if result.success is explicitly true OR if result is simply an object (e.g. {accessToken: "..."})
            return !!(result && (result.success !== false));
        },

        // --- SESSION ---

        async checkSession() {
            return _checkSessionInternal();
        },

        /**
         * Fetch all active sessions for the currently authenticated user.
         * Requires ISessionStore on the server with getSessionsForUser implemented.
         * @returns {Promise<{sessions: Array, error?: string}>}
         */
        async getActiveSessions() {
            const data = await window.AuthService.apiCall('/sessions', 'GET');
            return { sessions: data.sessions || [], error: data.error };
        },

        /**
         * Revoke a specific session by its handle.
         * @param {string} sessionHandle
         * @returns {Promise<{success: boolean, error?: string}>}
         */
        async revokeSession(sessionHandle) {
            const data = await window.AuthService.apiCall('/sessions/' + encodeURIComponent(sessionHandle), 'DELETE');
            return { success: !!data.success, error: data.error };
        },

        async guardPage(customLoginUrl) {
            const ok = await _checkSessionInternal();
            if (!ok && !window.location.pathname.includes('/login')) {
                window.location.href = customLoginUrl || getLoginUrl();
            }
        },

        async guardRole(role, customLoginUrl) {
            const ok = await _checkSessionInternal();
            const hasRole = currentUser && (
                currentUser.role === role ||
                (Array.isArray(currentUser.roles) && currentUser.roles.includes(role))
            );
            if (!ok || !hasRole) {
                window.location.href = customLoginUrl || getLoginUrl();
            }
        },

        // --- AUTH ---

        async login(email, password) {
            if (_overrides.login) return _overrides.login(email, password);
            const data = await window.AuthService.apiCall('/login', 'POST', { email, password });
            if (data.requiresTwoFactor) {
                return {
                    success: true,
                    requires2fa: true,
                    tempToken: data.tempToken,
                    availableMethods: data.available2faMethods || []
                };
            }
            if (data.requires2FASetup) {
                return {
                    success: false,
                    requires2FASetup: true,
                    tempToken: data.tempToken,
                    error: data.error || '2FA setup required'
                };
            }
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        async logout() {
            if (_overrides.logout) return _overrides.logout();
            return _logoutInternal();
        },

        async register(email, password, firstName, lastName) {
            if (_overrides.register) return _overrides.register(email, password, firstName, lastName);
            const data = await window.AuthService.apiCall('/register', 'POST', {
                email, password, firstName, lastName
            });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        // --- PASSWORD ---

        async forgotPassword(email) {
            if (_overrides.forgotPassword) return _overrides.forgotPassword(email);
            return window.AuthService.apiCall('/forgot-password', 'POST', { email });
        },

        async resetPassword(token, password) {
            if (_overrides.resetPassword) return _overrides.resetPassword(token, password);
            return window.AuthService.apiCall('/reset-password', 'POST', { token, password });
        },

        async changePassword(currentPassword, newPassword) {
            if (_overrides.changePassword) return _overrides.changePassword(currentPassword, newPassword);
            return window.AuthService.apiCall('/change-password', 'POST', {
                currentPassword, newPassword
            });
        },

        /**
         * Imposta la password per la prima volta su un account OAuth senza password.
         * Equivale a changePassword con currentPassword vuota — gestito lato backend.
         */
        async setPassword(newPassword) {
            if (_overrides.setPassword) return _overrides.setPassword(newPassword);
            return this.changePassword('', newPassword);
        },

        // --- MAGIC LINK ---

        async sendMagicLink(email) {
            if (_overrides.sendMagicLink) return _overrides.sendMagicLink(email);
            return window.AuthService.apiCall('/magic-link/send', 'POST', {
                email, mode: 'login'
            });
        },

        async verifyMagicLink(token) {
            if (_overrides.verifyMagicLink) return _overrides.verifyMagicLink(token);
            const data = await window.AuthService.apiCall('/magic-link/verify', 'POST', {
                token, mode: 'login'
            });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        // --- 2FA ---

        async setup2fa() {
            if (_overrides.setup2fa) return _overrides.setup2fa();
            return window.AuthService.apiCall('/2fa/setup', 'POST');
        },

        async verify2faSetup(code, secret) {
            if (_overrides.verify2faSetup) return _overrides.verify2faSetup(code, secret);
            return window.AuthService.apiCall('/2fa/verify-setup', 'POST', {
                token: code, secret
            });
        },

        async validate2fa(tempToken, code) {
            if (_overrides.validate2fa) return _overrides.validate2fa(tempToken, code);
            const data = await window.AuthService.apiCall('/2fa/verify', 'POST', {
                tempToken, totpCode: code
            });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        // --- SMS ---

        async sendSmsLogin(email) {
            if (_overrides.sendSmsLogin) return _overrides.sendSmsLogin(email);
            return window.AuthService.apiCall('/sms/send', 'POST', {
                email, mode: 'login'
            });
        },

        async verifySmsLogin(userId, code) {
            if (_overrides.verifySmsLogin) return _overrides.verifySmsLogin(userId, code);
            const data = await window.AuthService.apiCall('/sms/verify', 'POST', {
                userId, code, mode: 'login'
            });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        async validateSms(tempToken, code) {
            if (_overrides.validateSms) return _overrides.validateSms(tempToken, code);
            const data = await window.AuthService.apiCall('/sms/verify', 'POST', {
                tempToken, code, mode: '2fa'
            });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        // --- EMAIL VERIFICATION ---

        async resendVerificationEmail() {
            if (_overrides.resendVerificationEmail) return _overrides.resendVerificationEmail();
            return window.AuthService.apiCall('/send-verification-email', 'POST');
        },

        async verifyEmail(token) {
            if (_overrides.verifyEmail) return _overrides.verifyEmail(token);
            const data = await window.AuthService.apiCall(
                `/verify-email?token=${token}`, 'GET'
            );
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        // --- EMAIL CHANGE ---

        async requestEmailChange(newEmail) {
            if (_overrides.requestEmailChange) return _overrides.requestEmailChange(newEmail);
            return window.AuthService.apiCall('/change-email/request', 'POST', { newEmail });
        },

        async confirmEmailChange(token) {
            if (_overrides.confirmEmailChange) return _overrides.confirmEmailChange(token);
            const data = await window.AuthService.apiCall('/change-email/confirm', 'POST', { token });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        // --- ACCOUNT LINKING ---

        async requestLinkingEmail(email, provider) {
            if (_overrides.requestLinkingEmail) return _overrides.requestLinkingEmail(email, provider);
            return window.AuthService.apiCall('/link-request', 'POST', { email, provider });
        },

        async verifyLinkingToken(token, provider) {
            if (_overrides.verifyLinkingToken) return _overrides.verifyLinkingToken(token, provider);
            const data = await window.AuthService.apiCall('/link-verify', 'POST', { token, provider });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        async verifyConflictLinkingToken(token) {
            if (_overrides.verifyConflictLinkingToken) return _overrides.verifyConflictLinkingToken(token);
            const data = await window.AuthService.apiCall('/link-verify', 'POST', {
                token, loginAfterLinking: true
            });
            if (data.success) await _checkSessionInternal();
            return { success: !!data.success, error: data.error };
        },

        async getLinkedAccounts() {
            if (_overrides.getLinkedAccounts) return _overrides.getLinkedAccounts();
            const data = await window.AuthService.apiCall('/linked-accounts', 'GET');
            return data.linkedAccounts || [];
        },

        async unlinkAccount(provider, providerAccountId) {
            if (_overrides.unlinkAccount) return _overrides.unlinkAccount(provider, providerAccountId);
            return window.AuthService.apiCall(
                `/linked-accounts/${provider}/${providerAccountId}`, 'DELETE'
            );
        },

        // --- ACCOUNT ---

        async deleteAccount() {
            if (_overrides.deleteAccount) return _overrides.deleteAccount();
            const data = await window.AuthService.apiCall('/account', 'DELETE');
            if (data.success) {
                isAuthenticated = false;
                currentUser = null;
                if (window.AuthService) window.AuthService.user = null;
                if (_overrides.onLogout) {
                    _overrides.onLogout();
                } else {
                    window.location.href = getLoginUrl();
                }
            }
            return { success: !!data.success, error: data.error };
        },
    };

})();
