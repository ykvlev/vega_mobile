import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import {
  AuthCredentialsSchema,
  AuthMeResponseSchema,
  AuthResponseSchema,
  ProductIdParamsSchema,
  ProductListQuerySchema,
  PublicCategoryListSchema,
  PublicProductListSchema,
  PublicProductSchema,
  type AuthCredentials,
  type AuthUser,
  type PublicCategory,
  type PublicProduct,
  type PublicProductList,
} from '@vega/contracts';

declare const __DEV__: boolean;

export type AuthResponse = ReturnType<typeof AuthResponseSchema.parse>;
export type ApiErrorKind =
  | 'configuration'
  | 'network'
  | 'credentials'
  | 'conflict'
  | 'validation'
  | 'expired'
  | 'unavailable'
  | 'rate_limit'
  | 'not_found';

const messages: Record<ApiErrorKind, string> = {
  configuration: 'Сервис временно недоступен. Попробуйте позже.',
  network: 'Не удалось связаться с сервисом. Проверьте соединение и повторите.',
  credentials: 'Неверный телефон или пароль.',
  conflict: 'Аккаунт с этим телефоном уже существует. Попробуйте войти.',
  validation: 'Проверьте введённые данные.',
  expired: 'Сеанс завершён. Войдите снова.',
  unavailable: 'Сервис временно недоступен. Попробуйте позже.',
  rate_limit: 'Слишком много попыток. Попробуйте позже.',
  not_found: 'Товар не найден или больше не доступен.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(kind: ApiErrorKind) {
    super(messages[kind]);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

function origin(): string {
  // Expo only inlines statically accessed EXPO_PUBLIC variables.
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (!configured || configured.length > 2048)
    throw new ApiError('configuration');
  try {
    const url = new URL(configured);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new ApiError('configuration');
    if (url.protocol === 'https:') return url.origin;
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    const parts = url.hostname.split('.').map(Number);
    const privateIpv4 =
      parts.length === 4 &&
      parts.every(
        (part) => Number.isInteger(part) && part >= 0 && part <= 255,
      ) &&
      (parts[0] === 10 ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
    const explicitlyAllowedDevelopmentNetwork =
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      process.env.EXPO_PUBLIC_ALLOW_HTTP_DEMO === 'true' &&
      privateIpv4;
    if (
      url.protocol === 'http:' &&
      ((loopback &&
        (Platform.OS === 'web' ||
          (typeof __DEV__ !== 'undefined' && __DEV__))) ||
        explicitlyAllowedDevelopmentNetwork)
    )
      return url.origin;
  } catch {
    // Never include configuration values, URL credentials or parser details.
  }
  throw new ApiError('configuration');
}

const maximumJsonBytes = 512 * 1024;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

type Schema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

function utf8Size(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > maximumJsonBytes) break;
  }
  return bytes;
}

async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (
    (length &&
      (!/^[0-9]+$/.test(length) || Number(length) > maximumJsonBytes)) ||
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    await response.body?.cancel();
    throw new ApiError('unavailable');
  }
  let text: string;
  // React Native fetch may not expose a stream. The API's own bounded page/DTO
  // limits apply there; validate the decoded size too, rather than trust headers.
  if (response.body?.getReader && typeof TextDecoder !== 'undefined') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks: string[] = [];
    let count = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        count += next.value.byteLength;
        if (count > maximumJsonBytes) {
          await reader.cancel();
          throw new ApiError('unavailable');
        }
        chunks.push(decoder.decode(next.value, { stream: true }));
      }
      chunks.push(decoder.decode());
      text = chunks.join('');
    } finally {
      reader.releaseLock();
    }
  } else {
    text = await response.text();
    if (text.length > maximumJsonBytes || utf8Size(text) > maximumJsonBytes)
      throw new ApiError('unavailable');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('unavailable');
  }
}

async function request<T>(
  path: string,
  schema: Schema<T> | null,
  options: {
    method?: 'GET' | 'POST';
    body?: AuthCredentials;
    token?: string;
    signal?: AbortSignal;
    credentialsFailure?: boolean;
  } = {},
): Promise<T> {
  const apiOrigin = origin();
  if (options.token !== undefined && !tokenPattern.test(options.token))
    throw new ApiError('expired');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch(`${apiOrigin}${path}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    // Expo fetch disables redirect following in its native Android/iOS transport.
    // Keep an additional origin/redirect check before accepting any response.
    if (
      response.redirected ||
      (response.url && new URL(response.url).origin !== apiOrigin)
    )
      throw new ApiError('unavailable');
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401)
        throw new ApiError(
          options.credentialsFailure ? 'credentials' : 'expired',
        );
      if (response.status === 409) throw new ApiError('conflict');
      if ([400, 413, 422].includes(response.status))
        throw new ApiError('validation');
      if (response.status === 404) throw new ApiError('not_found');
      if (response.status === 429) throw new ApiError('rate_limit');
      throw new ApiError('unavailable');
    }
    if (schema === null) {
      if (response.status !== 204) throw new ApiError('unavailable');
      return undefined as T;
    }
    const parsed = schema.safeParse(await boundedJson(response));
    if (!parsed.success) throw new ApiError('unavailable');
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function listCategories(
  signal?: AbortSignal,
): Promise<PublicCategory[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 10000);
  try {
    const items: PublicCategory[] = [];
    const cursors = new Set<string>();
    const ids = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const result = await request(
        `/api/v1/categories?${query}`,
        PublicCategoryListSchema,
        {
          signal: controller.signal,
        },
      );
      if (result.items.length > 100) throw new ApiError('unavailable');
      for (const category of result.items) {
        if (ids.has(category.id)) throw new ApiError('unavailable');
        ids.add(category.id);
        items.push(category);
      }
      if (!result.nextCursor) return items;
      if (cursors.has(result.nextCursor)) throw new ApiError('unavailable');
      cursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    throw new ApiError('unavailable');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function listProducts(
  query: { q?: string; categoryId?: string; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<PublicProductList> {
  const parsed = ProductListQuerySchema.safeParse({ ...query, limit: '20' });
  if (!parsed.success) throw new ApiError('validation');
  const parameters = new URLSearchParams({ limit: '20' });
  if (parsed.data.q) parameters.set('q', parsed.data.q);
  if (parsed.data.categoryId)
    parameters.set('categoryId', parsed.data.categoryId);
  if (parsed.data.cursor) parameters.set('cursor', parsed.data.cursor);
  const result = await request(
    `/api/v1/products?${parameters}`,
    PublicProductListSchema,
    { signal },
  );
  if (result.items.length > 20) throw new ApiError('unavailable');
  return result;
}

export async function getProduct(
  id: string,
  signal?: AbortSignal,
): Promise<PublicProduct> {
  const parsed = ProductIdParamsSchema.safeParse({ id });
  if (!parsed.success) throw new ApiError('not_found');
  return request(`/api/v1/products/${parsed.data.id}`, PublicProductSchema, {
    signal,
  });
}

export function productImageUrl(media: string): string | null {
  try {
    if (media.length > 2048) return null;
    const url = new URL(media);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^\/api\/v1\/media\/([0-9a-f-]+)$/i.exec(url.pathname);
    if (!match || !ProductIdParamsSchema.safeParse({ id: match[1] }).success)
      return null;
    return `${origin()}/api/v1/media/${match[1]}`;
  } catch {
    return null;
  }
}

function credentials(value: AuthCredentials): AuthCredentials {
  const parsed = AuthCredentialsSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation');
  return parsed.data;
}

export function register(
  value: AuthCredentials,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return request('/api/v1/auth/register', AuthResponseSchema, {
    method: 'POST',
    body: credentials(value),
    signal,
    credentialsFailure: true,
  });
}

export function login(
  value: AuthCredentials,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return request('/api/v1/auth/login', AuthResponseSchema, {
    method: 'POST',
    body: credentials(value),
    signal,
    credentialsFailure: true,
  });
}

export async function getMe(
  token: string,
  signal?: AbortSignal,
): Promise<AuthUser> {
  const result = await request('/api/v1/me', AuthMeResponseSchema, {
    token,
    signal,
  });
  return result.user;
}

export function logout(token: string, signal?: AbortSignal): Promise<void> {
  return request<void>('/api/v1/auth/logout', null, {
    method: 'POST',
    token,
    signal,
  });
}
