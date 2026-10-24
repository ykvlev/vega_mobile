import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { toPublicProduct } from '@vega/contracts';
import { DatabaseService } from './database';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live() {
    return { status: 'ok', mode: 'demo', commerceEnabled: false };
  }

  @Get('ready')
  async ready() {
    try {
      await this.database.checkReadiness();
      return { status: 'ready', mode: 'demo', commerceEnabled: false };
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database unavailable',
        },
      });
    }
  }
}

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(
    @Query('limit') rawLimit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (
      (rawLimit !== undefined && !/^\d+$/.test(rawLimit)) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid page limit' },
      });
    }
    if (
      cursor !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cursor,
      )
    ) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid cursor' },
      });
    }
    try {
      const rows = await this.database.prisma.product.findMany({
        select: {
          id: true,
          skuId: true,
          article: true,
          name: true,
          description: true,
          categoryId: true,
          rollLengthMm: true,
          widthMm: true,
        },
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((row) =>
          toPublicProduct({
            id: row.id,
            skuId: row.skuId,
            article: row.article,
            name: row.name,
            description: row.description ?? '',
            categoryId: row.categoryId,
            media: [],
            characteristics: {},
            rollLengthMm: String(row.rollLengthMm),
            widthMm: String(row.widthMm),
          }),
        ),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    } catch {
      throw new ServiceUnavailableException({
        error: { code: 'CATALOG_UNAVAILABLE', message: 'Catalog unavailable' },
      });
    }
  }
}
