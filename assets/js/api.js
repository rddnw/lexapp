(function () {
    const config = window.LEX_CONFIG || {};
    const apiBaseUrl = (config.apiBaseUrl || '').replace(/\/$/, '');
    const accessTokenKey = 'lexAccessToken';
    const refreshTokenKey = 'lexRefreshToken';

    function hasSession() {
        return Boolean(sessionStorage.getItem(accessTokenKey));
    }

    function setSession(result) {
        if (!result.access_token || !result.refresh_token || !result.user) {
            throw new Error('The authentication service returned an incomplete session.');
        }
        sessionStorage.setItem(accessTokenKey, result.access_token);
        sessionStorage.setItem(refreshTokenKey, result.refresh_token);
        localStorage.setItem('lexUser', JSON.stringify({
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            isPremium: false
        }));
    }

    function clearSession() {
        sessionStorage.removeItem(accessTokenKey);
        sessionStorage.removeItem(refreshTokenKey);
        localStorage.removeItem('lexUser');
    }

    async function signOut() {
        try {
            if (hasSession()) {
                await request('/api/v1/auth/me');
                const refreshToken = sessionStorage.getItem(refreshTokenKey);
                await request('/api/v1/auth/logout', {
                    method: 'POST',
                    body: JSON.stringify({ refresh_token: refreshToken })
                });
            }
        } finally {
            clearSession();
        }
    }

    async function refreshSession() {
        const refreshToken = sessionStorage.getItem(refreshTokenKey);
        if (!refreshToken) return false;

        const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!response.ok) {
            clearSession();
            return false;
        }
        setSession(await response.json());
        return true;
    }

    async function request(path, options) {
        const settings = options || {};
        const headers = new Headers(settings.headers || {});
        const token = sessionStorage.getItem(accessTokenKey);
        if (token && !settings.skipAuth) headers.set('Authorization', `Bearer ${token}`);
        if (settings.body && !(settings.body instanceof FormData) && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }

        let response = await fetch(`${apiBaseUrl}${path}`, {
            ...settings,
            headers,
            credentials: 'omit'
        });
        if (response.status === 401 && token && !settings.skipAuth && await refreshSession()) {
            headers.set('Authorization', `Bearer ${sessionStorage.getItem(accessTokenKey)}`);
            response = await fetch(`${apiBaseUrl}${path}`, {
                ...settings,
                headers,
                credentials: 'omit'
            });
        }

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.detail || `Request failed (${response.status}).`);
        }
        return body;
    }

    async function requireUser(requiredRole) {
        if (!hasSession()) {
            clearSession();
            window.location.replace('index.html');
            return null;
        }

        try {
            const user = await request('/api/v1/auth/me');
            if (requiredRole && user.role !== requiredRole) {
                window.location.replace(user.role === 'lawyer' ? 'lawyer-dashboard.html' : 'dashboard.html');
                return null;
            }
            localStorage.setItem('lexUser', JSON.stringify({
                ...user,
                isPremium: false
            }));
            return user;
        } catch (error) {
            if (!hasSession()) {
                window.location.replace('index.html');
                return null;
            }
            window.alert(`Unable to validate your session: ${error.message}`);
            return null;
        }
    }

    window.lexApi = Object.freeze({
        hasSession,
        setSession,
        clearSession,
        signOut,
        request,
        requireUser
    });
}());
