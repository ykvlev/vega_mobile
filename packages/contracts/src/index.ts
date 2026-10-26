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

// Bounded RU formatting only; password content is deliberately never trimmed.
export const AuthPhoneSchema = z
  .string()
  .max(32)
  .trim()
  .regex(
    /^(?:\+7|8)[ -]?(?:\([0-9]{3}\)|[0-9]{3})[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}$/,
  )
  .transform((phone) => phone.replace(/[ ()-]/g, '').replace(/^8/, '+7'));
export const AuthPasswordSchema = z
  .string()
  .max(256)
  .refine((password) => {
    const points = Array.from(password);
    if (points.length < 15 || points.length > 128) return false;
    let bytes = 0;
    for (const point of points) {
      const code = point.codePointAt(0)!;
      if (code >= 0xd800 && code <= 0xdfff) return false;
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    return bytes <= 512;
  });
export const AuthCredentialsSchema = z.strictObject({
  phone: AuthPhoneSchema,
  password: AuthPasswordSchema,
});
export const CommercialAccessStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'revoked',
]);
export const AuthUserSchema = z.strictObject({
  id: z.uuid(),
  phone: z.string().regex(/^\+7[0-9]{10}$/),
  role: z.enum(['customer', 'manager']),
  commercialAccessStatus: CommercialAccessStatusSchema,
  phoneVerified: z.literal(false),
});
export const AuthResponseSchema = z.strictObject({
  user: AuthUserSchema,
  session: z.strictObject({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.iso.datetime(),
  }),
});
export const AuthMeResponseSchema = z.strictObject({ user: AuthUserSchema });
export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;

const CatalogText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => !value.includes('\0'));
const CatalogName = CatalogText(160).trim().min(1);
const EditableMillimeters = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/)
  .refine(
    (value) =>
      Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647,
  );
const PublicCharacteristicKey = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (key) =>
      key.trim().length > 0 &&
      !key.includes('\0') &&
      ![
        '__proto__',
        'constructor',
        'prototype',
        'price',
        'stock',
        'availability',
        'metadata',
      ].includes(key.toLowerCase()),
  );
export const EditableCharacteristicsSchema = z
  .preprocess(
    (value) => {
      // z.record deliberately skips __proto__; reject rather than silently accept it.
      if (
        typeof value === 'object' &&
        value !== null &&
        Object.hasOwn(value, '__proto__')
      )
        return null;
      return value;
    },
    z.record(PublicCharacteristicKey, CatalogText(256)),
  )
  .refine((value) => Object.keys(value).length <= 20);
export const AdminCategoryCreateSchema = z.strictObject({
  name: CatalogName,
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
const ProductWriteFields = {
  article: CatalogText(64).trim().min(1),
  name: CatalogName,
  description: CatalogText(4000),
  categoryId: z.uuid(),
  rollLengthMm: EditableMillimeters,
  widthMm: EditableMillimeters,
  characteristics: EditableCharacteristicsSchema,
  isPublished: z.boolean(),
};
export const AdminProductCreateSchema = z.strictObject({
  ...ProductWriteFields,
  description: ProductWriteFields.description.default(''),
  characteristics: ProductWriteFields.characteristics.default({}),
  isPublished: ProductWriteFields.isPublished.default(false),
});
export const AdminProductPatchSchema = z
  .strictObject(ProductWriteFields)
  .partial()
  .extend({ version: z.number().int().min(1).max(2147483646) })
  .refine((value) => Object.keys(value).some((key) => key !== 'version'));
export const AdminProductListQuerySchema = ProductListQuerySchema.extend({
  status: z.enum(['published', 'draft']).optional(),
});
const ImageVersion = z.number().int().min(1).max(2147483646);
export const ProductImageSchema = z.strictObject({
  id: z.uuid(),
  url: z.url(),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
  sizeBytes: z.number().int().min(1).max(1048576),
  position: z.number().int().min(0).max(7),
});
export const ImageUploadFieldsSchema = z.strictObject({
  version: z
    .string()
    .regex(/^[1-9][0-9]{0,9}$/)
    .transform(Number)
    .pipe(ImageVersion),
});
export const ImageDeleteSchema = z.strictObject({ version: ImageVersion });
export const ImageOrderSchema = z.strictObject({
  version: ImageVersion,
  imageIds: z
    .array(z.uuid())
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const ProductImageParamsSchema = z.strictObject({
  id: z.uuid(),
  imageId: z.uuid(),
});
export const MediaIdParamsSchema = z.strictObject({ id: z.uuid() });
export const AdminProductSchema = PublicProductSchema.extend({
  isPublished: z.boolean(),
  version: z.number().int().positive(),
  images: z.array(ProductImageSchema).max(8).default([]),
});
export const AdminProductListSchema = z.strictObject({
  items: z.array(AdminProductSchema),
  nextCursor: z.uuid().nullable(),
});
export const AdminCategoryListSchema = PublicCategoryListSchema;
export type AdminProduct = z.infer<typeof AdminProductSchema>;
export type AdminProductCreate = z.infer<typeof AdminProductCreateSchema>;
export type AdminProductPatch = z.infer<typeof AdminProductPatchSchema>;

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

export * from './sale-rules';
