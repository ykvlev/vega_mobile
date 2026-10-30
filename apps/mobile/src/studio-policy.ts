export type StudioPhase = 'loading' | 'ready' | 'failed' | 'paused';

// Public scene status only. No credentials, model URLs or commands cross this boundary.
export function studioPhase(message: unknown): StudioPhase | null {
  try {
    const encoded =
      typeof message === 'string' ? message : JSON.stringify(message);
    if (!encoded || encoded.length > 256) return null;
    const value: unknown = JSON.parse(encoded);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const data = value as Record<string, unknown>;
    if (
      Object.keys(data).length !== 3 ||
      data.version !== 1 ||
      data.type !== 'vega-studio' ||
      typeof data.phase !== 'string' ||
      !['loading', 'ready', 'failed', 'paused'].includes(data.phase)
    )
      return null;
    return data.phase as StudioPhase;
  } catch {
    return null;
  }
}

export function studioUrl({
  configured,
  platform,
  development,
  appOrigin,
  apiOrigin,
}: {
  configured: string | undefined;
  platform: string;
  development: boolean;
  appOrigin?: string;
  apiOrigin?: string;
}): string | null {
  try {
    if (!configured || configured.length > 2048) return null;
    const url = new URL(configured);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        loopback &&
        (platform === 'web' || development)
      )
    )
      return null;
    // The scene never shares the app/API origin or their authentication context.
    for (const other of [appOrigin, apiOrigin]) {
      if (other && new URL(other).origin === url.origin) return null;
    }
    return `${url.origin}/configurator3d/embed`;
  } catch {
    return null;
  }
}

export function allowsStudioNavigation(target: string, entry: string): boolean {
  // Deliberately reject fragments, queries, redirects and every other route/scheme.
  return target === entry;
}
