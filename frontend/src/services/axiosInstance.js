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

const isAuthEndpoint = (url = '') =>
  url.includes('/api/login') || url.includes('/api/refresh') || url.includes('/api/logout');

const performRefresh = () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axiosInstance
    .post('api/refresh')
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

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
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
      // Refresh failed → genuine session expiry. Clear credentials and redirect now,
      // deterministically, instead of relying on a component's catch + a delayed snackbar.
      forceLogout();
      return Promise.reject(error);
    }
  }
);

export default axiosInstance;
