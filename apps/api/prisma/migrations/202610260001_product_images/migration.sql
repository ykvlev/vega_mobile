CREATE TABLE "ProductImage" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "data" BYTEA NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'image/webp',
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductImage_productId_position_key" UNIQUE ("productId", "position") DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT "ProductImage_position_bound" CHECK ("position" BETWEEN 0 AND 7),
  CONSTRAINT "ProductImage_dimensions_bound" CHECK ("width" BETWEEN 1 AND 2048 AND "height" BETWEEN 1 AND 2048),
  CONSTRAINT "ProductImage_size_bound" CHECK ("sizeBytes" BETWEEN 1 AND 1048576 AND octet_length("data") = "sizeBytes"),
  CONSTRAINT "ProductImage_webp_only" CHECK ("contentType" = 'image/webp')
);
ALTER TABLE "CatalogAudit" DROP CONSTRAINT "CatalogAudit_action";
ALTER TABLE "CatalogAudit" ADD CONSTRAINT "CatalogAudit_action" CHECK ("action" IN ('create','update','publish','unpublish','image_add','image_delete','image_reorder'));
