export interface AppConfig {
  readonly mode: 'demo';
  readonly commerceEnabled: false;
  readonly databaseUrl: string;
  readonly databaseSchema: string;
  readonly port: number;
  readonly databaseTimeoutMs: number;
  readonly publicMediaOrigin: string;
  readonly auth:
    | { readonly enabled: false }
    | { readonly enabled: true; readonly rateLimitSecret: string };
}

function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error('Invalid integer configuration');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error('Configuration integer out of range');
  }
  return number;
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  if (
    environment.APP_MODE !== 'demo' ||
    environment.COMMERCE_ENABLED !== 'false'
  ) {
    throw new Error(
      'Only explicitly configured demo mode with commerce disabled is supported',
    );
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('Production is unavailable at bootstrap stage');
  }
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error('Invalid database configuration');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    url.pathname === '/'
  ) {
    throw new Error('Invalid database configuration');
  }
  const databaseSchema = url.searchParams.get('schema') ?? 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseSchema)) {
    throw new Error('Invalid database schema');
  }
  if (![undefined, 'false', 'true'].includes(environment.AUTH_DEMO_ENABLED)) {
    throw new Error('Invalid demo authentication configuration');
  }
  const authEnabled = environment.AUTH_DEMO_ENABLED === 'true';
  let publicMediaOrigin: string;
  try {
    const origin = new URL(
      environment.PUBLIC_MEDIA_ORIGIN ?? 'http://127.0.0.1:3001',
    );
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('Invalid origin');
    publicMediaOrigin = origin.origin;
  } catch {
    throw new Error('Invalid public media origin configuration');
  }
  const rateLimitSecret = environment.AUTH_RATE_LIMIT_SECRET;
  if (authEnabled) {
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (!/_(?:test|demo)$/.test(databaseName))
      throw new Error('Demo authentication requires an isolated database');
    if (
      !rateLimitSecret ||
      !rateLimitSecret.trim() ||
      Buffer.byteLength(rateLimitSecret, 'utf8') < 32 ||
      Buffer.byteLength(rateLimitSecret, 'utf8') > 1024
    ) {
      throw new Error(
        'Demo authentication requires a strong rate-limit secret',
      );
    }
  }
  return Object.freeze({
    mode: 'demo',
    commerceEnabled: false,
    databaseUrl: environment.DATABASE_URL,
    databaseSchema,
    port: integer(environment.PORT, 3001, 0, 65535),
    databaseTimeoutMs: integer(environment.DB_TIMEOUT_MS, 2000, 100, 10000),
    publicMediaOrigin,
    auth: authEnabled
      ? { enabled: true as const, rateLimitSecret: rateLimitSecret! }
      : { enabled: false as const },
  });
}
