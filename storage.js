/*
 * Storage & Auth Adapter.
 * Bridges local storage and remote backend server sync.
 */
const Storage = (() => {
  const KEY = 'carnivoreJournal.v1';
  const TOKEN_KEY = 'carnivore_jwt_token';
  const USER_KEY = 'carnivore_user_info';
  
  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]'
  );

  // Dynamic API URL: points to local server in development, or live Render backend on GitHub Pages
  const API_URL = window.CARNIVORE_API_URL || (
    isLocalhost ? 'http://localhost:4000/api' : 'https://carnivore-backend-fy84.onrender.com/api'
  );

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeLocal(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    return clone(data);
  }

  function currentLocal() {
    return readLocal() || clone(SEED_JOURNAL);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }

  function setAuth(user, token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // Helper to make authenticated API requests
  async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server request failed');
      return data;
    } catch (err) {
      console.warn(`API call ${endpoint} failed:`, err.message);
      throw err;
    }
  }

  return {
    // ───────── Auth Methods ─────────
    getUser,
    isLoggedIn() {
      return !!getToken();
    },

    async signupManual(username, password, email) {
      const res = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username, password, email }),
      });
      setAuth(res.user, res.token);
      // Sync local data up to user account immediately
      await this.syncRemote(currentLocal());
      return res.user;
    },

    async loginManual(username, password) {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuth(res.user, res.token);
      // Pull user's saved cloud journal if it exists
      await this.pullRemote();
      return res.user;
    },

    async authGoogle(credential, customUsername = null) {
      const res = await apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential, customUsername }),
      });
      if (res.token && res.user) {
        setAuth(res.user, res.token);
      }
      if (!res.isNewUser) {
        await this.pullRemote();
      } else if (res.token) {
        await this.syncRemote(currentLocal());
      }
      return res;
    },

    async checkSession() {
      if (!getToken()) return null;
      try {
        const res = await apiFetch('/auth/me');
        setAuth(res.user, getToken());
        return res.user;
      } catch {
        clearAuth();
        return null;
      }
    },

    logout() {
      clearAuth();
      // Reset local journal to blank template on logout so user data is not left behind
      writeLocal(clone(SEED_JOURNAL));
    },

    // ───────── Cloud Journal Sync ─────────
    async syncRemote(journal) {
      if (!getToken()) return;
      try {
        await apiFetch('/journal', {
          method: 'PUT',
          body: JSON.stringify(journal),
        });
      } catch (e) {
        console.warn('Background sync failed:', e.message);
      }
    },

    async pullRemote() {
      if (!getToken()) return null;
      try {
        const res = await apiFetch('/journal');
        if (res && res.journal && Array.isArray(res.journal.days)) {
          writeLocal(res.journal);
          return res.journal;
        }
      } catch (e) {
        console.warn('Pull remote failed:', e.message);
      }
      return null;
    },

    // ───────── Journal Methods ─────────
    async load() {
      if (getToken()) {
        const remote = await this.pullRemote();
        if (remote) return remote;
      }
      const data = readLocal();
      return data ? data : writeLocal(clone(SEED_JOURNAL));
    },

    async saveDay(day) {
      const data = currentLocal();
      const i = data.days.findIndex((d) => d.id === day.id);
      if (i >= 0) data.days[i] = day;
      else data.days.push(day);
      const saved = writeLocal(data);
      await this.syncRemote(saved);
      return saved;
    },

    async deleteDay(id) {
      const data = currentLocal();
      data.days = data.days.filter((d) => d.id !== id);
      const saved = writeLocal(data);
      await this.syncRemote(saved);
      return saved;
    },

    async saveMeta(meta) {
      const data = currentLocal();
      data.meta = { ...data.meta, ...meta };
      const saved = writeLocal(data);
      await this.syncRemote(saved);
      return saved;
    },

    async replaceAll(journal) {
      const saved = writeLocal(journal);
      await this.syncRemote(saved);
      return saved;
    },

    async reset() {
      const saved = writeLocal(clone(SEED_JOURNAL));
      await this.syncRemote(saved);
      return saved;
    },
  };
})();
