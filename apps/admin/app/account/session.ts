import 'server-only';

import { cookies, headers } from 'next/headers';
import {
  AuthMeResponseSchema,
  AuthResponseSchema,
  type AuthCredentials,
  type AuthUser,
} from '@vega/contracts';

const SESSION_COOKIE = '__Host-vega_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class AccountServiceError extends Error {
  constructor(
    readonly reason:
      | 'credentials'
      | 'registration'
      | 'limited'
      | 'unavailable'
      | 'expired'
      | 'origin',
  ) {
    super('Account operation unavailable');
  }
}

function apiOrigin(): string {
  const raw = process.env.AUTH_API_URL;
  if (!raw || raw.length > 2048) throw new AccountServiceError('unavailable');
  try {
    const url = new URL(raw);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['/', '/api/v1', '/api/v1/'].includes(url.pathname)
    )
      throw new AccountServiceError('unavailable');
    return url.origin;
  } catch {
    throw new AccountServiceError('unavailable');
  }
}

export async function requireActionOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  const host = requestHeaders.get('host');
  // Next also checks Origin/Host. Require Origin explicitly: Next allows a missing
  // header with a warning. No forwarded header may weaken cookie or CSRF policy.
  if (
    !origin ||
    !host ||
    requestHeaders.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new AccountServiceError('origin');
  }
  try {
    const parsed = new URL(origin);
    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      parsed.host !== host ||
      parsed.origin !== origin
    )
      throw new AccountServiceError('origin');
  } catch {
    throw new AccountServiceError('origin');
  }
}

export async function sessionToken(): Promise<string | null> {
  const values = (await cookies()).getAll(SESSION_COOKIE);
  if (values.length !== 1 || !TOKEN_PATTERN.test(values[0]!.value)) return null;
  return values[0]!.value;
}

async function requestAccount(
  endpoint: 'login' | 'register' | 'logout' | 'me',
  options: { credentials?: AuthCredentials; token?: string } = {},
): Promise<Response> {
  const origin = apiOrigin();
  const url = new URL(
    endpoint === 'me' ? '/api/v1/me' : `/api/v1/auth/${endpoint}`,
    origin,
  );
  try {
    return await fetch(url, {
      method: endpoint === 'me' ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: 'application/json',
        ...(endpoint !== 'me' ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(endpoint !== 'me'
        ? { body: JSON.stringify(options.credentials ?? {}) }
        : {}),
    });
  } catch {
    throw new AccountServiceError('unavailable');
  }
}

export async function beginSession(
  mode: 'login' | 'register',
  credentials: AuthCredentials,
): Promise<void> {
  const response = await requestAccount(mode, { credentials });
  if (response.status === 429) throw new AccountServiceError('limited');
  if (response.status === 401 && mode === 'login')
    throw new AccountServiceError('credentials');
  if (response.status === 409 && mode === 'register')
    throw new AccountServiceError('registration');
  if (!response.ok) throw new AccountServiceError('unavailable');
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AccountServiceError('unavailable');
  }
  const parsed = AuthResponseSchema.safeParse(body);
  if (!parsed.success) throw new AccountServiceError('unavailable');
  const expires = new Date(parsed.data.session.expiresAt);
  if (expires.getTime() <= Date.now())
    throw new AccountServiceError('unavailable');
  (await cookies()).set(SESSION_COOKIE, parsed.data.session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export type AccountView =
  | { kind: 'guest' }
  | { kind: 'expired' }
  | { kind: 'unavailable' }
  | { kind: 'authenticated'; user: AuthUser };

export async function accountView(): Promise<AccountView> {
  const token = await sessionToken();
  if (!token) return { kind: 'guest' };
  try {
    const response = await requestAccount('me', { token });
    if (response.status === 401) return { kind: 'expired' };
    if (!response.ok) return { kind: 'unavailable' };
    const parsed = AuthMeResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { kind: 'unavailable' };
    return { kind: 'authenticated', user: parsed.data.user };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function endSession(): Promise<void> {
  const token = await sessionToken();
  if (token) {
    const response = await requestAccount('logout', { token });
    // A trusted 401 confirms this credential cannot authorize an active session.
    // Network/module failures do not confirm revocation: retain cookie for retry.
    if (response.status !== 204 && response.status !== 401) {
      throw new AccountServiceError('unavailable');
    }
  }
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}
