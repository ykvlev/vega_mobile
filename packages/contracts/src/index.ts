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
