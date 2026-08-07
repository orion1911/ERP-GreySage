import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Send the httpOnly refresh-token cookie on every request to the API origin.
  // Without this the browser strips third-party cookies even with SameSite=None.
  withCredentials: true,
  // Fail instead of hanging forever. On a restored browser tab (stale sockets) or a
  // cold serverless/M0 backend a request could otherwise stay pending indefinitely,
  // leaving the UI stuck on skeletons with no error to trigger logout/redirect.
  // Generous so heavy reports/exports still complete; bump if an export needs longer.
  timeout: 30000,
});

// Centralized, deterministic logout. Used when the session is genuinely dead (refresh
// failed) so recovery never depends on a component catching the error or on a delayed
// snackbar. Clears credentials and hard-redirects to /login exactly once (guarded
// against redirect loops on the login page itself).
let loggingOut = false;
const forceLogout = () => {
  if (loggingOut) return;
  loggingOut = true;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

// ─── Request: attach access token ──────────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response: silent refresh on 401, then retry original request ──────────
//
// Single in-flight refresh promise so a burst of concurrent 401s (common on
// page load when many widgets call the API at once) doesn't fire N parallel
// refreshes. The first 401 starts the refresh; the rest await the same
// promise and then retry with the new token.
//
// Endpoints excluded from the refresh dance (would cause infinite loops or
// incorrect UX):
//   - /api/login   → password failure, never retry
//   - /api/refresh → if refresh itself returns 401, the session really is dead
//   - /api/logout  → no point retrying a logout
let refreshPromise = null;

// NB: requests are issued with a relative url (e.g. 'api/refresh' — baseURL supplies the origin),
// so match WITHOUT a leading slash. Matching '/api/refresh' here silently failed, which broke the
// "refresh itself 401'd → session is dead → forceLogout" path (stale token, no redirect on F5).
const isAuthEndpoint = (url = '') =>
  url.includes('api/login') || url.includes('api/refresh') || url.includes('api/logout');

// Distinguishes "the server told us the session is over" from "we couldn't reach the
// server". Only the former justifies destroying the user's session.
const isSessionDead = (err) => {
  const status = err?.response?.status;
  return status === 401 || status === 403;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry the refresh call itself on transient failures. A serverless/M0 backend that
// has scaled to zero routinely takes several seconds on the first hit, and that first
// hit is very often the refresh (the user came back to a sleeping tab). One retry with
// a short backoff turns a spurious logout into an invisible half-second pause.
const refreshWithRetry = async (attempts = 3) => {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await axiosInstance.post('api/refresh', null, { timeout: 20000 });
    } catch (err) {
      lastErr = err;
      if (isSessionDead(err)) throw err;      // definitive — don't retry, don't mask it
      // eslint-disable-next-line no-await-in-loop
      if (i < attempts - 1) await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
};

const performRefresh = () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshWithRetry()
    .then((res) => {
      const { token, user } = res.data || {};
      if (token) localStorage.setItem('token', token);
      if (user) localStorage.setItem('user', JSON.stringify(user));
      return token;
    })
    .finally(() => {
      // Clear AFTER the promise settles so all queued callers get the same result,
      // but the NEXT 401 (e.g. after another 15 min) starts a fresh refresh.
      refreshPromise = null;
    });
  return refreshPromise;
};

// Turn a transport failure (no HTTP response — request timed out, or the server
// was unreachable) into a human-readable message. Rewriting error.message here
// means every surface that shows it (the app-wide snackbar, dashboards, etc.)
// stops leaking raw axios strings like "timeout of 30000ms exceeded".
const friendlyTransportMessage = (error) => {
  if (error.response) return null; // there IS a response → let normal handling show the server error
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return 'The server took too long to respond. Please try again in a moment.';
  }
  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
    return 'Unable to reach the server. Please check your connection and try again.';
  }
  return null;
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const friendly = friendlyTransportMessage(error);
    if (friendly) error.message = friendly;

    const { response, config } = error;
    if (!response || response.status !== 401 || !config) return Promise.reject(error);
    if (isAuthEndpoint(config.url)) return Promise.reject(error);
    if (config._retried) {
      // A retry with a freshly-refreshed token still 401'd → the session is dead.
      forceLogout();
      return Promise.reject(error);
    }

    try {
      const newToken = await performRefresh();
      if (!newToken) { forceLogout(); return Promise.reject(error); }
      config._retried = true;
      config.headers = { ...config.headers, Authorization: `Bearer ${newToken}` };
      return axiosInstance(config);
    } catch (refreshErr) {
      // Refresh failed — but WHY it failed decides whether the session is dead.
      //
      //   401/403 from /api/refresh  → the refresh token really is gone/expired/revoked.
      //                                Session is dead, log out.
      //   no response (timeout, ERR_NETWORK, tab offline, cold serverless start)
      //   or 5xx / 429              → transient infrastructure failure. The refresh
      //                                token is still perfectly valid. Logging out here
      //                                was the main cause of "random" logouts: one slow
      //                                cold start on the API and the user is at /login,
      //                                mid-form, with unsaved work gone.
      if (isSessionDead(refreshErr)) forceLogout();
      return Promise.reject(error);
    }
  }
);

export default axiosInstance;
