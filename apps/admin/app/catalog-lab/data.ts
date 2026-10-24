import 'server-only';

import {
  ProductIdParamsSchema,
  ProductListQuerySchema,
  PublicCategoryListSchema,
  PublicProductListSchema,
  PublicProductSchema,
} from '@vega/contracts';

type RawParams = Record<string, string | string[] | undefined>;
export type CatalogQuery = {
  q?: string;
  categoryId?: string;
  cursor?: string;
  limit: number;
  selected?: string;
};

export function parseCatalogQuery(raw: RawParams): CatalogQuery | null {
  const allowed = new Set(['q', 'categoryId', 'cursor', 'limit', 'selected']);
  if (
    Object.entries(raw).some(
      ([key, value]) => !allowed.has(key) || Array.isArray(value),
    )
  ) {
    return null;
  }
  const scalar = raw as Record<string, string | undefined>;
  if (
    (scalar.q?.length ?? 0) > 128 ||
    Object.values(scalar).some((value) => (value?.length ?? 0) > 2048)
  ) {
    return null;
  }
  const parsed = ProductListQuerySchema.safeParse({
    ...(scalar.q?.trim() ? { q: scalar.q } : {}),
    ...(scalar.categoryId ? { categoryId: scalar.categoryId } : {}),
    ...(scalar.cursor ? { cursor: scalar.cursor } : {}),
    limit: scalar.limit ?? '12',
  });
  if (!parsed.success) return null;
  if (scalar.selected !== undefined) {
    const selected = ProductIdParamsSchema.safeParse({ id: scalar.selected });
    if (!selected.success) return null;
  }
  return {
    ...parsed.data,
    ...(scalar.selected ? { selected: scalar.selected } : {}),
  };
}

export function catalogHref(
  query: CatalogQuery,
  changes: Partial<CatalogQuery> = {},
): string {
  const values = { ...query, ...changes };
  const params = new URLSearchParams();
  for (const key of [
    'q',
    'categoryId',
    'cursor',
    'limit',
    'selected',
  ] as const) {
    const value = values[key];
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return `/catalog-lab?${params.toString()}`;
}

export class CatalogReadError extends Error {
  constructor(
    public readonly reason: 'configuration' | 'not_found' | 'unavailable',
  ) {
    super('Catalog data is unavailable');
  }
}

function configuredOrigin(): string {
  const raw = process.env.CATALOG_API_URL;
  if (!raw || raw.length > 2048) throw new CatalogReadError('configuration');
  try {
    const url = new URL(raw);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['/', '/api/v1', '/api/v1/'].includes(url.pathname)
    )
      throw new CatalogReadError('configuration');
    return url.origin;
  } catch {
    throw new CatalogReadError('configuration');
  }
}

async function readPublicJson(
  path: string,
  params?: URLSearchParams,
): Promise<unknown> {
  const origin = configuredOrigin();
  const url = new URL(`/api/v1/${path}`, origin);
  if (params) url.search = params.toString();
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) throw new CatalogReadError('not_found');
    if (!response.ok) throw new CatalogReadError('unavailable');
    return await response.json();
  } catch (error) {
    if (error instanceof CatalogReadError) throw error;
    throw new CatalogReadError('unavailable');
  }
}

export async function getCategories() {
  const parsed = PublicCategoryListSchema.safeParse(
    await readPublicJson('categories', new URLSearchParams({ limit: '100' })),
  );
  if (!parsed.success) throw new CatalogReadError('unavailable');
  return parsed.data;
}

export async function getProducts(query: CatalogQuery) {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.q) params.set('q', query.q);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.cursor) params.set('cursor', query.cursor);
  const parsed = PublicProductListSchema.safeParse(
    await readPublicJson('products', params),
  );
  if (!parsed.success) throw new CatalogReadError('unavailable');
  return parsed.data;
}

export async function getProduct(id: string) {
  const parsedId = ProductIdParamsSchema.safeParse({ id });
  if (!parsedId.success) throw new CatalogReadError('not_found');
  const parsed = PublicProductSchema.safeParse(
    await readPublicJson(`products/${encodeURIComponent(parsedId.data.id)}`),
  );
  if (!parsed.success) throw new CatalogReadError('unavailable');
  return parsed.data;
}
