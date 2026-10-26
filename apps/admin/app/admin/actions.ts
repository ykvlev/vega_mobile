'use server';

import 'server-only';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireActionOrigin } from '../account/session';
import {
  AdminApiError,
  createCategory,
  createProduct,
  updateProduct,
} from './data';
import { metersToMillimeters, type AdminActionState } from './model';

function fields(
  form: FormData,
  allowed: readonly string[],
): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$ACTION_')) continue;
    if (
      !allowed.includes(key) ||
      typeof value !== 'string' ||
      Object.hasOwn(result, key) ||
      value.length > 16000
    )
      return null;
    result[key] = value;
  }
  return result;
}

function failure(error: unknown): AdminActionState {
  if (error instanceof AdminApiError) {
    if (error.kind === 'guest')
      return { message: 'Сеанс завершён. Войдите в аккаунт снова.' };
    if (error.kind === 'forbidden')
      return { message: 'Недостаточно прав для этого действия.' };
    if (error.kind === 'version')
      return {
        message: 'Товар изменился. Обновите страницу и повторите изменения.',
      };
    if (error.kind === 'conflict')
      return { message: 'Такой артикул или код категории уже используется.' };
    if (error.kind === 'validation')
      return {
        message:
          'Проверьте название, артикул, категорию, размеры и характеристики.',
      };
    if (error.kind === 'not_found')
      return { message: 'Товар не найден. Обновите страницу.' };
  }
  return {
    message: 'Не удалось сохранить изменения. Повторите попытку позже.',
  };
}

function productInput(values: Record<string, string>) {
  const rollLengthMm = metersToMillimeters(values.rollLengthMeters ?? '');
  if (!rollLengthMm || (values.characteristics?.length ?? 0) > 8000)
    throw new AdminApiError('validation');
  let characteristics: unknown;
  try {
    characteristics = JSON.parse(values.characteristics || '{}');
  } catch {
    throw new AdminApiError('validation');
  }
  return {
    article: values.article,
    name: values.name,
    categoryId: values.categoryId,
    description: values.description ?? '',
    rollLengthMm,
    widthMm: values.widthMm?.trim(),
    characteristics,
  };
}

export async function saveNewProduct(
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  let id: string;
  try {
    await requireActionOrigin();
    const values = fields(form, [
      'article',
      'name',
      'categoryId',
      'description',
      'rollLengthMeters',
      'widthMm',
      'characteristics',
    ]);
    if (!values) throw new AdminApiError('validation');
    const created = await createProduct({
      ...productInput(values),
      isPublished: false,
    });
    id = created.id;
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
  } catch (error) {
    return failure(error);
  }
  redirect(`/admin?edit=${encodeURIComponent(id)}`);
}

export async function saveExistingProduct(
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  let id: string;
  try {
    await requireActionOrigin();
    const values = fields(form, [
      'productId',
      'version',
      'article',
      'name',
      'categoryId',
      'description',
      'rollLengthMeters',
      'widthMm',
      'characteristics',
    ]);
    if (!values || !/^[1-9][0-9]{0,9}$/.test(values.version ?? ''))
      throw new AdminApiError('validation');
    id = values.productId ?? '';
    await updateProduct(id, {
      ...productInput(values),
      version: Number(values.version),
    });
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
  } catch (error) {
    return failure(error);
  }
  redirect(`/admin?edit=${encodeURIComponent(id)}`);
}

export async function changePublication(
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  let id: string;
  try {
    await requireActionOrigin();
    const values = fields(form, ['productId', 'version', 'isPublished']);
    if (
      !values ||
      !/^[1-9][0-9]{0,9}$/.test(values.version ?? '') ||
      !['true', 'false'].includes(values.isPublished ?? '')
    )
      throw new AdminApiError('validation');
    id = values.productId ?? '';
    await updateProduct(id, {
      version: Number(values.version),
      isPublished: values.isPublished === 'true',
    });
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
  } catch (error) {
    return failure(error);
  }
  redirect(`/admin?edit=${encodeURIComponent(id)}`);
}

export async function saveNewCategory(
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  try {
    await requireActionOrigin();
    const values = fields(form, ['name', 'slug']);
    if (!values) throw new AdminApiError('validation');
    await createCategory(values);
    revalidatePath('/admin');
    revalidatePath('/catalog-lab');
  } catch (error) {
    return failure(error);
  }
  redirect('/admin?view=categories');
}
