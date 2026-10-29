import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { finalize } from 'rxjs';
import type { CallHandler } from '@nestjs/common';
import {
  EmptyQuerySchema,
  ImageDeleteSchema,
  ImageOrderSchema,
  ImageUploadFieldsSchema,
  MediaIdParamsSchema,
  ProductIdParamsSchema,
  ProductImageParamsSchema,
} from '@vega/contracts';
import { AuthService } from './auth-service';
import { bearer, type AuthRequest } from './auth-controller';
import { AuthError } from './auth-errors';
import { ImageService } from './image-service';
import { MAX_UPLOAD_BYTES, imageFormat } from './image-transform';

interface ImageRequest extends AuthRequest {
  aborted?: boolean;
  destroyed?: boolean;
  res?: {
    destroyed?: boolean;
    once(event: string, callback: () => void): unknown;
  };
  setTimeout?(milliseconds: number, callback: () => void): unknown;
  destroy?(): unknown;
  mediaRelease?: () => void;
  mediaActorId?: string;
  mediaProcessingStarted?: boolean;
  mediaProcessingFinished?: boolean;
}
function invalid(): never {
  throw new AuthError(400, 'VALIDATION_FAILED');
}
function checkQuery(query: unknown) {
  if (!EmptyQuerySchema.safeParse(query).success) invalid();
}

@Injectable()
export class ImageUploadGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly images: ImageService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ImageRequest>();
    this.auth.requireEnabled();
    const token = bearer(request);
    await this.auth.requireManager(token);
    const release = await this.images.queue.acquire();
    try {
      let closed = false;
      // Install before the DB recheck: close can happen while that await is pending.
      request.res?.once('close', () => {
        closed = true;
        if (!request.mediaProcessingStarted) release();
      });
      if (
        request.aborted ||
        request.destroyed ||
        request.res?.destroyed ||
        closed
      )
        throw new AuthError(400, 'VALIDATION_FAILED');
      // Permission may have changed while this request was queued.
      const actor = await this.auth.requireManager(token);
      if (
        request.aborted ||
        request.destroyed ||
        request.res?.destroyed ||
        closed
      )
        throw new AuthError(400, 'VALIDATION_FAILED');
      request.mediaActorId = actor.id;
      request.mediaRelease = release;
      request.setTimeout?.(30000, () => request.destroy?.());
      return true;
    } catch (error) {
      release();
      throw error;
    }
  }
}

@Injectable()
export class ImageReleaseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<ImageRequest>();
    return next.handle().pipe(
      finalize(() => {
        if (!request.mediaProcessingStarted || request.mediaProcessingFinished)
          request.mediaRelease?.();
      }),
    );
  }
}

@Controller('api/v1/admin/products')
export class ProductImagesController {
  constructor(
    private readonly auth: AuthService,
    private readonly images: ImageService,
  ) {}
  private async manager(request: AuthRequest) {
    this.auth.requireEnabled();
    return this.auth.requireManager(bearer(request));
  }

  @Post(':id/images')
  @UseGuards(ImageUploadGuard)
  @UseInterceptors(
    ImageReleaseInterceptor,
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 64,
        fieldNameSize: 100,
        parts: 2,
      },
    }),
  )
  async add(
    @Param() params: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @Req() request: ImageRequest,
  ) {
    checkQuery(query);
    const id = ProductIdParamsSchema.safeParse(params);
    const fields = ImageUploadFieldsSchema.safeParse(body);
    if (
      !id.success ||
      !fields.success ||
      !file ||
      !Buffer.isBuffer(file.buffer) ||
      !request.mediaActorId
    )
      invalid();
    const actual = imageFormat(file.buffer);
    if (file.mimetype !== `image/${actual}`)
      throw new AuthError(400, 'INVALID_IMAGE');
    request.mediaProcessingStarted = true;
    try {
      if (request.aborted || request.res?.destroyed) invalid();
      return await this.images.add(
        id.data.id,
        fields.data.version,
        request.mediaActorId,
        file.buffer,
      );
    } finally {
      request.mediaProcessingFinished = true;
      request.mediaRelease?.();
    }
  }

  @Delete(':id/images/:imageId')
  async remove(
    @Param() params: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    const manager = await this.manager(request);
    checkQuery(query);
    const ids = ProductImageParamsSchema.safeParse(params);
    const parsed = ImageDeleteSchema.safeParse(body);
    if (!ids.success || !parsed.success) invalid();
    return this.images.remove(
      ids.data.id,
      ids.data.imageId,
      parsed.data.version,
      manager.id,
    );
  }

  @Patch(':id/images/order')
  async order(
    @Param() params: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    const manager = await this.manager(request);
    checkQuery(query);
    const id = ProductIdParamsSchema.safeParse(params);
    const parsed = ImageOrderSchema.safeParse(body);
    if (!id.success || !parsed.success) invalid();
    return this.images.order(
      id.data.id,
      parsed.data.version,
      parsed.data.imageIds,
      manager.id,
    );
  }
}

@Controller('api/v1/media')
export class MediaController {
  constructor(
    private readonly auth: AuthService,
    private readonly images: ImageService,
  ) {}
  @Get(':id')
  async read(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    checkQuery(query);
    const parsed = MediaIdParamsSchema.safeParse(params);
    if (!parsed.success) invalid();
    const image = await this.images.read(parsed.data.id);
    if (!image) throw new AuthError(404, 'NOT_FOUND');
    if (!image.product.isPublished) {
      try {
        await this.auth.requireManager(bearer(request));
      } catch (error) {
        if (
          error instanceof AuthError &&
          [401, 403, 404].includes(error.getStatus())
        )
          throw new AuthError(404, 'NOT_FOUND');
        throw new AuthError(503, 'MEDIA_UNAVAILABLE');
      }
    }
    return new StreamableFile(Buffer.from(image.data), {
      type: 'image/webp',
      disposition: 'inline',
      length: image.data.length,
    });
  }
}
