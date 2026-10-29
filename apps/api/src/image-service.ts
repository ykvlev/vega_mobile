import { DatabaseService } from './database';
import { AuthError } from './auth-errors';
import { adminProduct, adminProductSelect } from './catalog-projection';
import type { Prisma } from './generated/prisma/client';
import type { AppConfig } from './config';
import { ImageWorkQueue, sanitizeImage } from './image-transform';

export class ImageService {
  readonly queue = new ImageWorkQueue();
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
  ) {}

  private async cas(tx: Prisma.TransactionClient, id: string, version: number) {
    if (!(await tx.product.findUnique({ where: { id }, select: { id: true } })))
      throw new AuthError(404, 'NOT_FOUND');
    const result = await tx.product.updateMany({
      where: { id, version },
      data: { version: { increment: 1 } },
    });
    if (result.count !== 1) throw new AuthError(409, 'VERSION_CONFLICT');
  }
  private async result(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    action: string,
  ) {
    const row = await tx.product.findUniqueOrThrow({
      where: { id },
      select: adminProductSelect,
    });
    await tx.catalogAudit.create({
      data: {
        actorId,
        entityType: 'product',
        entityId: id,
        action,
        version: row.version,
      },
    });
    return adminProduct(row, this.database.publicMediaOrigin);
  }
  private async deferOrder(tx: Prisma.TransactionClient) {
    await tx.$executeRawUnsafe(
      `SET CONSTRAINTS "${this.config.databaseSchema}"."ProductImage_productId_position_key" DEFERRED`,
    );
  }
  private failure(error: unknown): never {
    if (error instanceof AuthError) throw error;
    throw new AuthError(503, 'MEDIA_UNAVAILABLE');
  }

  async add(id: string, version: number, actorId: string, buffer: Buffer) {
    // Cheap stale/cap check avoids decoding unusable requests; rechecked in CAS tx.
    const current = await this.database.prisma.product
      .findUnique({
        where: { id },
        select: { version: true, _count: { select: { images: true } } },
      })
      .catch(() => {
        throw new AuthError(503, 'MEDIA_UNAVAILABLE');
      });
    if (!current) throw new AuthError(404, 'NOT_FOUND');
    if (current.version !== version)
      throw new AuthError(409, 'VERSION_CONFLICT');
    if (current._count.images >= 8)
      throw new AuthError(409, 'IMAGE_LIMIT_REACHED');
    const image = await sanitizeImage(buffer);
    try {
      return await this.database.prisma.$transaction(async (tx) => {
        await this.cas(tx, id, version);
        const count = await tx.productImage.count({ where: { productId: id } });
        if (count >= 8) throw new AuthError(409, 'IMAGE_LIMIT_REACHED');
        await tx.productImage.create({
          data: {
            productId: id,
            ...image,
            data: new Uint8Array(image.data),
            position: count,
            contentType: 'image/webp',
          },
        });
        return this.result(tx, id, actorId, 'image_add');
      });
    } catch (error) {
      this.failure(error);
    }
  }

  async remove(id: string, imageId: string, version: number, actorId: string) {
    try {
      return await this.database.prisma.$transaction(async (tx) => {
        await this.cas(tx, id, version);
        const image = await tx.productImage.findFirst({
          where: { id: imageId, productId: id },
          select: { position: true },
        });
        if (!image) throw new AuthError(404, 'NOT_FOUND');
        await this.deferOrder(tx);
        await tx.productImage.delete({ where: { id: imageId } });
        await tx.productImage.updateMany({
          where: { productId: id, position: { gt: image.position } },
          data: { position: { decrement: 1 } },
        });
        return this.result(tx, id, actorId, 'image_delete');
      });
    } catch (error) {
      this.failure(error);
    }
  }

  async order(
    id: string,
    version: number,
    imageIds: string[],
    actorId: string,
  ) {
    try {
      return await this.database.prisma.$transaction(async (tx) => {
        await this.cas(tx, id, version);
        const images = await tx.productImage.findMany({
          where: { productId: id },
          select: { id: true },
        });
        if (
          images.length !== imageIds.length ||
          images.some((image) => !imageIds.includes(image.id))
        )
          throw new AuthError(400, 'VALIDATION_FAILED');
        await this.deferOrder(tx);
        for (const [position, imageId] of imageIds.entries())
          await tx.productImage.update({
            where: { id: imageId },
            data: { position },
          });
        return this.result(tx, id, actorId, 'image_reorder');
      });
    } catch (error) {
      this.failure(error);
    }
  }

  async read(id: string) {
    try {
      return await this.database.prisma.productImage.findUnique({
        where: { id },
        select: { data: true, product: { select: { isPublished: true } } },
      });
    } catch {
      throw new AuthError(503, 'MEDIA_UNAVAILABLE');
    }
  }
}
