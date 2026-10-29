'use server';

import 'server-only';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireActionOrigin } from '../account/session';
import {
  AdminApiError,
  removeProductImage,
  reorderProductImages,
} from './data';
import type { AdminActionState } from './model';

function fields(form: FormData, allowed: string[]) {
  const result: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$ACTION_')) continue;
    if (
      !allowed.includes(key) ||
      typeof value !== 'string' ||
      Object.hasOwn(result, key) ||
      value.length > 2048
    )
      throw new AdminApiError('validation');
    result[key] = value;
  }
  if (!/^[1-9][0-9]{0,9}$/.test(result.version ?? ''))
    throw new AdminApiError('validation');
  return result;
}

function message(error: unknown): AdminActionState {
  if (error instanceof AdminApiError) {
    if (error.kind === 'guest')
      return { message: 'Сеанс завершён. Войдите снова.' };
    if (error.kind === 'forbidden')
      return { message: 'Недостаточно прав для изменения фотографий.' };
    if (error.kind === 'version')
      return {
        message:
          'Товар изменился. Обновите страницу перед изменением фотографий.',
      };
    if (error.kind === 'not_found')
      return { message: 'Фотография не найдена. Обновите страницу.' };
    if (error.kind === 'validation')
      return { message: 'Не удалось изменить фотографии. Обновите страницу.' };
  }
  return {
    message: 'Не удалось изменить фотографии. Повторите попытку позже.',
  };
}

export async function deletePhoto(
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  let productId: string;
  try {
    await requireActionOrigin();
    const values = fields(form, ['productId', 'imageId', 'version']);
    productId = values.productId ?? '';
    await removeProductImage(productId, values.imageId ?? '', {
      version: Number(values.version),
    });
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
  } catch (error) {
    return message(error);
  }
  redirect(`/admin?edit=${encodeURIComponent(productId)}`);
}

export async function reorderPhotos(
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  let productId: string;
  try {
    await requireActionOrigin();
    const values = fields(form, ['productId', 'imageIds', 'version']);
    productId = values.productId ?? '';
    let imageIds: unknown;
    try {
      imageIds = JSON.parse(values.imageIds ?? '');
    } catch {
      throw new AdminApiError('validation');
    }
    await reorderProductImages(productId, {
      version: Number(values.version),
      imageIds,
    });
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
  } catch (error) {
    return message(error);
  }
  redirect(`/admin?edit=${encodeURIComponent(productId)}`);
}
