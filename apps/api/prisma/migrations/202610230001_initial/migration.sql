CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

CREATE TABLE "Product" (
  "id" UUID NOT NULL,
  "skuId" UUID NOT NULL,
  "article" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "categoryId" UUID NOT NULL,
  "rollLengthMm" INTEGER NOT NULL,
  "widthMm" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_rollLength_positive" CHECK ("rollLengthMm" > 0),
  CONSTRAINT "Product_width_positive" CHECK ("widthMm" > 0),
  CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Product_skuId_key" ON "Product"("skuId");
CREATE UNIQUE INDEX "Product_article_key" ON "Product"("article");
CREATE INDEX "Product_categoryId_id_idx" ON "Product"("categoryId", "id");
