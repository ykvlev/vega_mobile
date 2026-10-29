import { revalidatePath } from 'next/cache';
import {
  ImageUploadFieldsSchema,
  ProductIdParamsSchema,
} from '@vega/contracts';
import {
  AccountServiceError,
  requireActionOrigin,
} from '../../../account/session';
import { AdminApiError, managerSession, uploadProductImage } from '../../data';
import { boundedMediaBody, MediaBodyError } from '../../media-io';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    await requireActionOrigin();
    const { token } = await managerSession();
    if (new URL(request.url).search)
      return failure(400, 'VALIDATION_FAILED', 'Проверьте данные загрузки.');
    const type = request.headers.get('content-type') ?? '';
    if (type.length > 256 || !/^multipart\/form-data\s*;/i.test(type))
      return failure(
        400,
        'VALIDATION_FAILED',
        'Выберите фотографию для загрузки.',
      );
    const declaredLength = request.headers.get('content-length');
    if (
      declaredLength &&
      (!/^[0-9]+$/.test(declaredLength) ||
        Number(declaredLength) > 6 * 1024 * 1024)
    )
      return failure(
        413,
        'PAYLOAD_TOO_LARGE',
        'Файл слишком большой. Максимум — 5 МБ.',
      );
    const bytes = await boundedMediaBody(request.body, 6 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Request('http://form.invalid', {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: bytes,
      }).formData();
    } catch {
      return failure(400, 'VALIDATION_FAILED', 'Проверьте данные загрузки.');
    }
    const seen = new Set<string>();
    for (const [key] of form.entries()) {
      if (!['file', 'productId', 'version'].includes(key) || seen.has(key))
        return failure(400, 'VALIDATION_FAILED', 'Проверьте данные загрузки.');
      seen.add(key);
    }
    const id = ProductIdParamsSchema.safeParse({ id: form.get('productId') });
    const fields = ImageUploadFieldsSchema.safeParse({
      version: form.get('version'),
    });
    const file = form.get('file');
    if (
      !id.success ||
      !fields.success ||
      !(file instanceof File) ||
      file.size === 0
    )
      return failure(
        400,
        'VALIDATION_FAILED',
        'Выберите фотографию и повторите загрузку.',
      );
    if (file.size > 5 * 1024 * 1024)
      return failure(
        413,
        'PAYLOAD_TOO_LARGE',
        'Файл слишком большой. Максимум — 5 МБ.',
      );
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return failure(
        400,
        'INVALID_IMAGE',
        'Подойдут только JPEG, PNG или WebP.',
      );
    const product = await uploadProductImage(
      token,
      id.data.id,
      String(fields.data.version),
      file,
    );
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
    return Response.json(
      { ok: true, version: product.version },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (error) {
    if (error instanceof AccountServiceError && error.reason === 'origin')
      return failure(
        403,
        'FORBIDDEN',
        'Не удалось проверить источник запроса. Откройте страницу заново.',
      );
    if (error instanceof MediaBodyError && error.kind === 'size')
      return failure(
        413,
        'PAYLOAD_TOO_LARGE',
        'Файл слишком большой. Максимум — 5 МБ.',
      );
    if (error instanceof AdminApiError) {
      if (error.kind === 'guest')
        return failure(401, 'AUTH_REQUIRED', 'Сеанс завершён. Войдите снова.');
      if (error.kind === 'forbidden')
        return failure(403, 'FORBIDDEN', 'Недостаточно прав для загрузки.');
      if (error.kind === 'version')
        return failure(
          409,
          'VERSION_CONFLICT',
          'Товар изменился. Обновите страницу перед загрузкой.',
        );
      if (error.kind === 'image_limit')
        return failure(
          409,
          'IMAGE_LIMIT_REACHED',
          'Можно добавить не больше 8 фотографий.',
        );
      if (error.kind === 'too_large')
        return failure(
          413,
          'PAYLOAD_TOO_LARGE',
          'Файл слишком большой. Максимум — 5 МБ.',
        );
      if (error.kind === 'image_invalid' || error.kind === 'validation')
        return failure(
          400,
          'INVALID_IMAGE',
          'Не удалось прочитать изображение. Выберите JPEG, PNG или WebP.',
        );
      if (error.kind === 'not_found')
        return failure(404, 'NOT_FOUND', 'Товар не найден. Обновите страницу.');
    }
    return failure(
      503,
      'MEDIA_UNAVAILABLE',
      'Не удалось загрузить фотографию. Повторите попытку позже.',
    );
  }
}
