import 'server-only';

import {
  AdminCategoryCreateSchema,
  AdminCategoryListSchema,
  AdminProductCreateSchema,
  AdminProductListQuerySchema,
  AdminProductListSchema,
  AdminProductPatchSchema,
  AdminProductSchema,
  AuthMeResponseSchema,
  ProductIdParamsSchema,
  PublicCategorySchema,
  ImageDeleteSchema,
  ImageOrderSchema,
  ImageUploadFieldsSchema,
  ProductImageParamsSchema,
  type AdminProduct,
  type PublicCategory,
} from '@vega/contracts';
import { sessionToken } from '../account/session';
import { productMediaPath } from '../media-url';

export class AdminApiError extends Error {
  constructor(
    readonly kind:
      | 'guest'
      | 'forbidden'
      | 'unavailable'
      | 'not_found'
      | 'version'
      | 'conflict'
      | 'validation'
      | 'category_limit'
      | 'image_limit'
      | 'image_invalid'
      | 'too_large'
      | 'processing_busy',
  ) {
    super('Admin operation unavailable');
  }
}

export type WorkspaceQuery = {
  view: 'products' | 'categories';
  q?: string;
  categoryId?: string;
  status?: 'published' | 'draft';
  cursor?: string;
  limit: number;
  newProduct: boolean;
  edit?: string;
};

export function parseWorkspaceQuery(
  raw: Record<string, string | string[] | undefined>,
): WorkspaceQuery | null {
  const allowed = new Set([
    'view',
    'q',
    'categoryId',
    'status',
    'cursor',
    'limit',
    'new',
    'edit',
  ]);
  if (
    Object.entries(raw).some(
      ([key, value]) =>
        !allowed.has(key) ||
        Array.isArray(value) ||
        (value?.length ?? 0) > 2048,
    )
  )
    return null;
  const values = raw as Record<string, string | undefined>;
  if (
    (values.q?.length ?? 0) > 128 ||
    (values.view && !['products', 'categories'].includes(values.view)) ||
    (values.new && values.new !== 'product') ||
    (values.edit !== undefined &&
      !ProductIdParamsSchema.safeParse({ id: values.edit }).success) ||
    (values.edit && values.new)
  )
    return null;
  const parsed = AdminProductListQuerySchema.safeParse({
    ...(values.q?.trim() ? { q: values.q } : {}),
    ...(values.categoryId ? { categoryId: values.categoryId } : {}),
    ...(values.status ? { status: values.status } : {}),
    ...(values.cursor ? { cursor: values.cursor } : {}),
    limit: values.limit ?? '20',
  });
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    view: values.view === 'categories' ? 'categories' : 'products',
    newProduct: values.new === 'product',
    ...(values.edit ? { edit: values.edit } : {}),
  };
}

export function workspaceHref(
  query: WorkspaceQuery,
  changes: Partial<WorkspaceQuery> = {},
): string {
  const values = { ...query, ...changes };
  const params = new URLSearchParams();
  if (values.view === 'categories') params.set('view', 'categories');
  for (const key of [
    'q',
    'categoryId',
    'status',
    'cursor',
    'limit',
    'edit',
  ] as const) {
    const value = values[key];
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  if (values.newProduct) params.set('new', 'product');
  return `/admin?${params.toString()}`;
}

export function adminApiOrigin(): string {
  const raw = process.env.AUTH_API_URL;
  if (!raw || raw.length > 2048) throw new AdminApiError('unavailable');
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
      throw new AdminApiError('unavailable');
    return url.origin;
  } catch {
    throw new AdminApiError('unavailable');
  }
}

async function request(
  path: string,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  deadline?: AbortSignal,
): Promise<Response> {
  const url = new URL(`/api/v1/${path}`, adminApiOrigin());
  try {
    return await fetch(url, {
      method,
      cache: 'no-store',
      redirect: 'error',
      signal: deadline
        ? AbortSignal.any([deadline, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AdminApiError('unavailable');
  }
}

async function successfulJson(response: Response): Promise<unknown> {
  if (response.status === 401) throw new AdminApiError('guest');
  if (response.status === 403) throw new AdminApiError('forbidden');
  if (response.status === 404) throw new AdminApiError('not_found');
  if (response.status === 413) throw new AdminApiError('too_large');
  if (response.status === 400) {
    let code: unknown;
    try {
      const body = await response.json();
      code = body?.error?.code;
    } catch {
      /* Safe generic validation below. */
    }
    throw new AdminApiError(
      code === 'INVALID_IMAGE' ? 'image_invalid' : 'validation',
    );
  }
  if (response.status === 409) {
    let code: unknown;
    try {
      const error = await response.json();
      code = error?.error?.code;
    } catch {
      /* Never forward upstream errors. */
    }
    throw new AdminApiError(
      code === 'VERSION_CONFLICT'
        ? 'version'
        : code === 'IMAGE_LIMIT_REACHED'
          ? 'image_limit'
          : 'conflict',
    );
  }
  if (!response.ok) throw new AdminApiError('unavailable');
  try {
    return await response.json();
  } catch {
    throw new AdminApiError('unavailable');
  }
}

export async function managerSession() {
  const token = await sessionToken();
  if (!token) throw new AdminApiError('guest');
  const parsed = AuthMeResponseSchema.safeParse(
    await successfulJson(await request('me', token)),
  );
  if (!parsed.success) throw new AdminApiError('unavailable');
  if (parsed.data.user.role !== 'manager') throw new AdminApiError('forbidden');
  return { token, user: parsed.data.user };
}

function browserProduct(product: AdminProduct): AdminProduct {
  const images = product.images.map((image) => {
    const url = productMediaPath(image.url);
    if (url !== `/media/${image.id}`) throw new AdminApiError('unavailable');
    return { ...image, url };
  });
  return { ...product, images, media: images.map((image) => image.url) };
}

async function completeCategories(token: string) {
  const items: PublicCategory[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  const deadline = AbortSignal.timeout(10000);
  let cursor: string | null = null;
  // Demo resource cap: at most 1,000 categories and ten 100-row requests.
  // Never return a partial category set to an editor or filter.
  for (let page = 0; page < 10; page += 1) {
    if (deadline.aborted) throw new AdminApiError('unavailable');
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const parsed = AdminCategoryListSchema.safeParse(
      await successfulJson(
        await request(
          `admin/categories?${params.toString()}`,
          token,
          'GET',
          undefined,
          deadline,
        ),
      ),
    );
    if (!parsed.success || parsed.data.items.length > 100 || deadline.aborted) {
      throw new AdminApiError('unavailable');
    }
    for (const category of parsed.data.items) {
      if (seenIds.has(category.id)) throw new AdminApiError('unavailable');
      seenIds.add(category.id);
      items.push(category);
    }
    if (parsed.data.nextCursor === null) return { items, nextCursor: null };
    if (!parsed.data.items.length || seenCursors.has(parsed.data.nextCursor)) {
      throw new AdminApiError('unavailable');
    }
    seenCursors.add(parsed.data.nextCursor);
    cursor = parsed.data.nextCursor;
  }
  throw new AdminApiError(
    items.length >= 1000 ? 'category_limit' : 'unavailable',
  );
}

export async function loadWorkspace(query: WorkspaceQuery) {
  const { token, user } = await managerSession();
  const params = new URLSearchParams({ limit: String(query.limit) });
  for (const key of ['q', 'categoryId', 'status', 'cursor'] as const)
    if (query[key]) params.set(key, query[key]);
  const [categories, productBody, detailBody] = await Promise.all([
    completeCategories(token),
    request(`admin/products?${params.toString()}`, token).then(successfulJson),
    query.edit
      ? request(`admin/products/${encodeURIComponent(query.edit)}`, token).then(
          successfulJson,
        )
      : Promise.resolve(null),
  ]);
  const products = AdminProductListSchema.safeParse(productBody);
  const editing =
    detailBody === null ? null : AdminProductSchema.safeParse(detailBody);
  if (!products.success || (editing && !editing.success))
    throw new AdminApiError('unavailable');
  return {
    user,
    categories,
    products: {
      ...products.data,
      items: products.data.items.map(browserProduct),
    },
    editing: editing?.success ? browserProduct(editing.data) : null,
  };
}

export async function createCategory(input: unknown) {
  const parsed = AdminCategoryCreateSchema.safeParse(input);
  if (!parsed.success) throw new AdminApiError('validation');
  const { token } = await managerSession();
  const result = PublicCategorySchema.safeParse(
    await successfulJson(
      await request('admin/categories', token, 'POST', parsed.data),
    ),
  );
  if (!result.success) throw new AdminApiError('unavailable');
  return result.data;
}

export async function createProduct(input: unknown) {
  const parsed = AdminProductCreateSchema.safeParse(input);
  if (!parsed.success) throw new AdminApiError('validation');
  const { token } = await managerSession();
  const result = AdminProductSchema.safeParse(
    await successfulJson(
      await request('admin/products', token, 'POST', parsed.data),
    ),
  );
  if (!result.success) throw new AdminApiError('unavailable');
  return browserProduct(result.data);
}

export async function updateProduct(id: string, input: unknown) {
  const parsedId = ProductIdParamsSchema.safeParse({ id });
  const parsed = AdminProductPatchSchema.safeParse(input);
  if (!parsedId.success || !parsed.success)
    throw new AdminApiError('validation');
  const { token } = await managerSession();
  const result = AdminProductSchema.safeParse(
    await successfulJson(
      await request(
        `admin/products/${encodeURIComponent(parsedId.data.id)}`,
        token,
        'PATCH',
        parsed.data,
      ),
    ),
  );
  if (!result.success) throw new AdminApiError('unavailable');
  return browserProduct(result.data);
}

export async function uploadProductImage(
  token: string,
  id: string,
  version: string,
  file: File,
) {
  const parsedId = ProductIdParamsSchema.safeParse({ id });
  const parsedFields = ImageUploadFieldsSchema.safeParse({ version });
  if (!parsedId.success || !parsedFields.success)
    throw new AdminApiError('validation');
  const form = new FormData();
  form.append('version', String(parsedFields.data.version));
  const extension =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/png'
        ? 'png'
        : 'webp';
  form.append('file', file, `upload.${extension}`);
  let response: Response;
  try {
    response = await fetch(
      new URL(
        `/api/v1/admin/products/${parsedId.data.id}/images`,
        adminApiOrigin(),
      ),
      {
        method: 'POST',
        body: form,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    throw new AdminApiError('unavailable');
  }
  const parsed = AdminProductSchema.safeParse(await successfulJson(response));
  if (!parsed.success) throw new AdminApiError('unavailable');
  return browserProduct(parsed.data);
}

export async function removeProductImage(
  id: string,
  imageId: string,
  input: unknown,
) {
  const params = ProductImageParamsSchema.safeParse({ id, imageId });
  const payload = ImageDeleteSchema.safeParse(input);
  if (!params.success || !payload.success)
    throw new AdminApiError('validation');
  const { token } = await managerSession();
  const parsed = AdminProductSchema.safeParse(
    await successfulJson(
      await request(
        `admin/products/${params.data.id}/images/${params.data.imageId}`,
        token,
        'DELETE',
        payload.data,
      ),
    ),
  );
  if (!parsed.success) throw new AdminApiError('unavailable');
  return browserProduct(parsed.data);
}

export async function reorderProductImages(id: string, input: unknown) {
  const params = ProductIdParamsSchema.safeParse({ id });
  const payload = ImageOrderSchema.safeParse(input);
  if (!params.success || !payload.success)
    throw new AdminApiError('validation');
  const { token } = await managerSession();
  const parsed = AdminProductSchema.safeParse(
    await successfulJson(
      await request(
        `admin/products/${params.data.id}/images/order`,
        token,
        'PATCH',
        payload.data,
      ),
    ),
  );
  if (!parsed.success) throw new AdminApiError('unavailable');
  return browserProduct(parsed.data);
}
