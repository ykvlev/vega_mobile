import {
  Controller,
  Get,
  Query,
  Param,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import {
  ProductListQuerySchema,
  CategoryListQuerySchema,
  ProductIdParamsSchema,
  EmptyQuerySchema,
  PublicProductListSchema,
  PublicCategoryListSchema,
} from '@vega/contracts';
import { DatabaseService } from './database';
import { publicProduct, publicProductSelect } from './catalog-projection';

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

function invalidQuery(): BadRequestException {
  return new BadRequestException({
    error: { code: 'VALIDATION_FAILED', message: 'Invalid catalog parameters' },
  });
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    error: { code: 'CATALOG_UNAVAILABLE', message: 'Catalog unavailable' },
  });
}

// Prisma contains uses PostgreSQL LIKE patterns: escape user wildcard characters.
export function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = CategoryListQuerySchema.safeParse(query);
    if (!parsed.success) throw invalidQuery();
    const { limit, cursor } = parsed.data;
    try {
      const rows = await this.database.prisma.category.findMany({
        select: { id: true, slug: true, name: true },
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return PublicCategoryListSchema.parse({
        items: page,
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      });
    } catch {
      throw unavailable();
    }
  }
}

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ProductListQuerySchema.safeParse(query);
    if (!parsed.success) throw invalidQuery();
    const { limit, cursor, q, categoryId } = parsed.data;
    const escaped = q === undefined ? undefined : escapeLikeLiteral(q);
    try {
      const rows = await this.database.prisma.product.findMany({
        select: publicProductSelect,
        where: {
          isPublished: true,
          ...(cursor ? { id: { gt: cursor } } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(escaped === undefined
            ? {}
            : {
                OR: [
                  { name: { contains: escaped, mode: 'insensitive' as const } },
                  {
                    article: {
                      contains: escaped,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              }),
        },
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return PublicProductListSchema.parse({
        items: page.map((row) =>
          publicProduct(row, this.database.publicMediaOrigin),
        ),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      });
    } catch {
      throw unavailable();
    }
  }

  @Get(':id')
  async detail(@Param() params: unknown, @Query() query: unknown) {
    const parsed = ProductIdParamsSchema.safeParse(params);
    if (!parsed.success || !EmptyQuerySchema.safeParse(query).success)
      throw invalidQuery();
    let row;
    try {
      row = await this.database.prisma.product.findUnique({
        where: { id: parsed.data.id, isPublished: true },
        select: publicProductSelect,
      });
    } catch {
      throw unavailable();
    }
    if (row === null)
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Product not found' },
      });
    try {
      return publicProduct(row, this.database.publicMediaOrigin);
    } catch {
      throw unavailable();
    }
  }
}
