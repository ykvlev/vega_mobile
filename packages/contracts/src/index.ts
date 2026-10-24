import { z } from 'zod';

const PositiveMillimeters = z.string().regex(/^[1-9][0-9]*$/);

export const PublicProductSchema = z.strictObject({
  id: z.uuid(),
  skuId: z.uuid(),
  article: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.uuid(),
  media: z.array(z.url()),
  description: z.string(),
  characteristics: z.record(z.string(), z.string()),
  rollLengthMm: PositiveMillimeters,
  widthMm: PositiveMillimeters,
});

export type PublicProduct = z.infer<typeof PublicProductSchema>;

export const PublicCategorySchema = z.strictObject({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
});
export type PublicCategory = z.infer<typeof PublicCategorySchema>;

const PageLimit = z
  .string()
  .regex(/^[1-9][0-9]{0,2}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100))
  .default(20);
const PageFields = { limit: PageLimit, cursor: z.uuid().optional() };

// HTTP query values must be scalar strings; repeated arrays/coercion are rejected.
export const ProductListQuerySchema = z.strictObject({
  ...PageFields,
  q: z.string().max(128).trim().min(1).optional(),
  categoryId: z.uuid().optional(),
});
export const CategoryListQuerySchema = z.strictObject(PageFields);
export const ProductIdParamsSchema = z.strictObject({ id: z.uuid() });
export const EmptyQuerySchema = z.strictObject({});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;
export type CategoryListQuery = z.infer<typeof CategoryListQuerySchema>;

export const PublicProductListSchema = z.strictObject({
  items: z.array(PublicProductSchema),
  nextCursor: z.uuid().nullable(),
});
export const PublicCategoryListSchema = z.strictObject({
  items: z.array(PublicCategorySchema),
  nextCursor: z.uuid().nullable(),
});
export type PublicProductList = z.infer<typeof PublicProductListSchema>;
export type PublicCategoryList = z.infer<typeof PublicCategoryListSchema>;

// Explicit allowlist: even a future ORM model with commercial fields stays private.
export function toPublicProduct(source: unknown): PublicProduct {
  if (typeof source !== 'object' || source === null) {
    throw new TypeError('Product must be an object');
  }
  const product = source as Record<string, unknown>;
  return PublicProductSchema.parse({
    id: product.id,
    skuId: product.skuId,
    article: product.article,
    name: product.name,
    categoryId: product.categoryId,
    media: product.media,
    description: product.description,
    characteristics: product.characteristics,
    rollLengthMm: product.rollLengthMm,
    widthMm: product.widthMm,
  });
}
