ALTER TABLE "User" DROP CONSTRAINT "User_customer_only";
ALTER TABLE "User" ADD CONSTRAINT "User_role_allowed" CHECK ("role" IN ('customer', 'manager'));
ALTER TABLE "Product" ADD COLUMN "characteristics" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD CONSTRAINT "Product_characteristics_object" CHECK (jsonb_typeof("characteristics") = 'object');
ALTER TABLE "Product" ADD CONSTRAINT "Product_version_positive" CHECK ("version" > 0);
CREATE INDEX "Product_isPublished_id_idx" ON "Product"("isPublished", "id");
CREATE TABLE "CatalogAudit" (
  "id" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogAudit_entity_type" CHECK ("entityType" IN ('category', 'product')),
  CONSTRAINT "CatalogAudit_action" CHECK ("action" IN ('create', 'update', 'publish', 'unpublish')),
  CONSTRAINT "CatalogAudit_version_positive" CHECK ("version" > 0)
);
CREATE INDEX "CatalogAudit_entityType_entityId_createdAt_idx" ON "CatalogAudit"("entityType", "entityId", "createdAt");
