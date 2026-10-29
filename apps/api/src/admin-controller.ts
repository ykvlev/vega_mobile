import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  AdminCategoryCreateSchema,
  AdminCategoryListSchema,
  AdminProductCreateSchema,
  AdminProductPatchSchema,
  AdminProductSchema,
  AdminProductListSchema,
  AdminProductListQuerySchema,
  CategoryListQuerySchema,
  EmptyQuerySchema,
  ProductIdParamsSchema,
  PublicCategorySchema,
  type AdminProductCreate,
  type AdminProductPatch,
} from '@vega/contracts';
import { AuthService } from './auth-service';
import { bearer, type AuthRequest } from './auth-controller';
import { AuthError } from './auth-errors';
import { DatabaseService } from './database';
import {
  escapeLikeLiteral,
  publicProduct,
  publicProductSelect,
  type ProductRow,
} from './controllers';

const adminSelect = {
  ...publicProductSelect,
  isPublished: true,
  version: true,
} as const;
type AdminRow = ProductRow & { isPublished: boolean; version: number };
function response(row: AdminRow) {
  return AdminProductSchema.parse({
    ...publicProduct(row),
    isPublished: row.isPublished,
    version: row.version,
  });
}
function invalid(): never {
  throw new AuthError(400, 'VALIDATION_FAILED');
}
function emptyQuery(query: unknown): void {
  if (!EmptyQuerySchema.safeParse(query).success) invalid();
}
function writeData(
  input: AdminProductCreate | Omit<AdminProductPatch, 'version'>,
) {
  const { rollLengthMm, widthMm, ...rest } = input;
  return {
    ...rest,
    ...(rollLengthMm === undefined
      ? {}
      : { rollLengthMm: Number(rollLengthMm) }),
    ...(widthMm === undefined ? {} : { widthMm: Number(widthMm) }),
  };
}
function safeFailure(error: unknown): never {
  if (error instanceof AuthError) throw error;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === 'P2002') throw new AuthError(409, 'CONFLICT');
    if (error.code === 'P2003') invalid();
  }
  throw new AuthError(503, 'ADMIN_UNAVAILABLE');
}

@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
  ) {}
  private manager(request: AuthRequest) {
    this.auth.requireEnabled();
    return this.auth.requireManager(bearer(request));
  }

  @Get('categories')
  async categories(@Query() query: unknown, @Req() request: AuthRequest) {
    await this.manager(request);
    const parsed = CategoryListQuerySchema.safeParse(query);
    if (!parsed.success) invalid();
    const { limit, cursor } = parsed.data;
    try {
      const rows = await this.database.prisma.category.findMany({
        select: { id: true, slug: true, name: true },
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return AdminCategoryListSchema.parse({
        items: page,
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      });
    } catch (error) {
      safeFailure(error);
    }
  }

  @Post('categories')
  async createCategory(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    const manager = await this.manager(request);
    emptyQuery(query);
    const parsed = AdminCategoryCreateSchema.safeParse(body);
    if (!parsed.success) invalid();
    try {
      return await this.database.prisma.$transaction(async (tx) => {
        const category = await tx.category.create({
          data: parsed.data,
          select: { id: true, name: true, slug: true },
        });
        await tx.catalogAudit.create({
          data: {
            actorId: manager.id,
            entityType: 'category',
            entityId: category.id,
            action: 'create',
            version: 1,
          },
        });
        return PublicCategorySchema.parse(category);
      });
    } catch (error) {
      safeFailure(error);
    }
  }

  @Get('products')
  async products(@Query() query: unknown, @Req() request: AuthRequest) {
    await this.manager(request);
    const parsed = AdminProductListQuerySchema.safeParse(query);
    if (!parsed.success) invalid();
    const { limit, cursor, q, categoryId, status } = parsed.data;
    const escaped = q === undefined ? undefined : escapeLikeLiteral(q);
    try {
      const rows = await this.database.prisma.product.findMany({
        select: adminSelect,
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(status ? { isPublished: status === 'published' } : {}),
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
      return AdminProductListSchema.parse({
        items: page.map(response),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      });
    } catch (error) {
      safeFailure(error);
    }
  }

  @Get('products/:id')
  async product(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    await this.manager(request);
    emptyQuery(query);
    const parsed = ProductIdParamsSchema.safeParse(params);
    if (!parsed.success) invalid();
    try {
      const product = await this.database.prisma.product.findUnique({
        where: { id: parsed.data.id },
        select: adminSelect,
      });
      if (!product) throw new AuthError(404, 'NOT_FOUND');
      return response(product);
    } catch (error) {
      safeFailure(error);
    }
  }

  @Post('products')
  async createProduct(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    const manager = await this.manager(request);
    emptyQuery(query);
    const parsed = AdminProductCreateSchema.safeParse(body);
    if (!parsed.success) invalid();
    try {
      return await this.database.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            ...parsed.data,
            rollLengthMm: Number(parsed.data.rollLengthMm),
            widthMm: Number(parsed.data.widthMm),
          },
          select: adminSelect,
        });
        await tx.catalogAudit.create({
          data: {
            actorId: manager.id,
            entityType: 'product',
            entityId: product.id,
            action: 'create',
            version: product.version,
          },
        });
        return response(product);
      });
    } catch (error) {
      safeFailure(error);
    }
  }

  @Patch('products/:id')
  async patchProduct(
    @Param() params: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    const manager = await this.manager(request);
    emptyQuery(query);
    const id = ProductIdParamsSchema.safeParse(params);
    const parsed = AdminProductPatchSchema.safeParse(body);
    if (!id.success || !parsed.success) invalid();
    const { version, ...patch } = parsed.data;
    try {
      return await this.database.prisma.$transaction(async (tx) => {
        const previous = await tx.product.findUnique({
          where: { id: id.data.id },
          select: { isPublished: true },
        });
        if (!previous) throw new AuthError(404, 'NOT_FOUND');
        const result = await tx.product.updateMany({
          where: { id: id.data.id, version },
          data: { ...writeData(patch), version: { increment: 1 } },
        });
        if (result.count !== 1) throw new AuthError(409, 'VERSION_CONFLICT');
        const product = await tx.product.findUniqueOrThrow({
          where: { id: id.data.id },
          select: adminSelect,
        });
        const publicationChanged =
          patch.isPublished !== undefined &&
          patch.isPublished !== previous.isPublished;
        await tx.catalogAudit.create({
          data: {
            actorId: manager.id,
            entityType: 'product',
            entityId: product.id,
            action: publicationChanged
              ? product.isPublished
                ? 'publish'
                : 'unpublish'
              : 'update',
            version: product.version,
          },
        });
        return response(product);
      });
    } catch (error) {
      safeFailure(error);
    }
  }
}
