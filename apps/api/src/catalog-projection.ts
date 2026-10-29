import { AdminProductSchema, toPublicProduct } from '@vega/contracts';

export type ImageMetadata = {
  id: string;
  width: number;
  height: number;
  sizeBytes: number;
  position: number;
};
export const imageMetadataSelect = {
  id: true,
  width: true,
  height: true,
  sizeBytes: true,
  position: true,
} as const;
export const publicProductSelect = {
  id: true,
  skuId: true,
  article: true,
  name: true,
  description: true,
  categoryId: true,
  rollLengthMm: true,
  widthMm: true,
  characteristics: true,
  images: {
    select: imageMetadataSelect,
    orderBy: { position: 'asc' as const },
  },
} as const;
export const adminProductSelect = {
  ...publicProductSelect,
  isPublished: true,
  version: true,
} as const;
export type ProductRow = {
  id: string;
  skuId: string;
  article: string;
  name: string;
  description: string | null;
  categoryId: string;
  rollLengthMm: number;
  widthMm: number;
  characteristics: unknown;
  images: ImageMetadata[];
};
export type AdminRow = ProductRow & { isPublished: boolean; version: number };
export function mediaUrl(id: string, origin: string): string {
  return new URL(`/api/v1/media/${id}`, origin).href;
}
export function publicProduct(row: ProductRow, origin: string) {
  return toPublicProduct({
    id: row.id,
    skuId: row.skuId,
    article: row.article,
    name: row.name,
    description: row.description ?? '',
    categoryId: row.categoryId,
    media: row.images.map((image) => mediaUrl(image.id, origin)),
    characteristics: row.characteristics,
    rollLengthMm: String(row.rollLengthMm),
    widthMm: String(row.widthMm),
  });
}
export function adminProduct(row: AdminRow, origin: string) {
  return AdminProductSchema.parse({
    ...publicProduct(row, origin),
    isPublished: row.isPublished,
    version: row.version,
    images: row.images.map((image) => ({
      ...image,
      url: mediaUrl(image.id, origin),
    })),
  });
}
