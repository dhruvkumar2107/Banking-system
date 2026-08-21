import type { LoginResponse } from './types';

/**
 * Typed fetch client for the Digital Pigmee API.
 *
 * - Tokens live in localStorage (this is a same-origin admin console, not a
 *   public site). The access token is attached as a Bearer header.
 * - On a 401 we attempt a single refresh against /auth/refresh and replay the
 *   original request. Concurrent 401s share one in-flight refresh promise so we
 *   never fire the refresh endpoint more than once at a time.
 * - On refresh failure we clear tokens and bounce to /login.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:4000/api';

const ACCESS_KEY = 'pigmee.admin.access';
const REFRESH_KEY = 'pigmee.admin.refresh';
const USER_KEY = 'pigmee.admin.user';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ---- token storage ---------------------------------------------------------

export const tokens = {
  access(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_KEY);
  },
  refresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_KEY, access);
    if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
  },
  storedUser<T = unknown>(): T | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setUser(user: unknown) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
};

// ---- refresh (single-flight) -----------------------------------------------

let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as Partial<LoginResponse>;
    if (!data.accessToken) return false;
    tokens.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function forceLogout() {
  tokens.clear();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// ---- core request ----------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean; // default true
  retry?: boolean; // internal — prevents infinite refresh loops
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE_URL + (path.startsWith('/') ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, retry = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = tokens.access();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retry) {
    const ok = await refreshOnce();
    if (ok) return request<T>(path, { ...opts, retry: false });
    forceLogout();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? safeJson(text) : null;

  if (!res.ok) {
    const message = extractMessage(parsed) || res.statusText || 'Request failed';
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as { message?: unknown }).message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  return null;
}

// ---- public surface --------------------------------------------------------

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Unauthenticated POST (login). */
  postPublic: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body, auth: false }),

  /** Fetch a binary blob (e.g. receipt PDF) with auth + refresh handling. */
  async blob(path: string, query?: RequestOptions['query']): Promise<Blob> {
    const attempt = async (): Promise<Response> => {
      const token = tokens.access();
      return fetch(buildUrl(path, query), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    };
    let res = await attempt();
    if (res.status === 401) {
      const ok = await refreshOnce();
      if (!ok) {
        forceLogout();
        throw new ApiError(401, 'Session expired.');
      }
      res = await attempt();
    }
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    return res.blob();
  },
};
