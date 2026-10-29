import { ProductIdParamsSchema } from '@vega/contracts';

// Extract an opaque ID only; the browser never contacts the supplied host.
export function productMediaPath(value: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^\/api\/v1\/media\/([^/]+)$/.exec(url.pathname);
    const parsed = ProductIdParamsSchema.safeParse({ id: match?.[1] });
    return parsed.success ? `/media/${parsed.data.id}` : null;
  } catch {
    return null;
  }
}

export function productMediaPaths(values: string[]): string[] {
  const paths = values
    .map(productMediaPath)
    .filter((value): value is string => value !== null);
  return [...new Set(paths)].slice(0, 8);
}
