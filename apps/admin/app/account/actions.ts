'use server';

import 'server-only';
import { redirect } from 'next/navigation';
import { AuthCredentialsSchema } from '@vega/contracts';
import {
  AccountServiceError,
  beginSession,
  endSession,
  requireActionOrigin,
} from './session';
import type { AccountFormState } from './state';

function readCredentials(formData: FormData) {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    // React's progressive-enhancement metadata is never forwarded to the API.
    if (key.startsWith('$ACTION_')) continue;
    if (
      !['phone', 'password'].includes(key) ||
      typeof value !== 'string' ||
      Object.hasOwn(fields, key)
    )
      return null;
    fields[key] = value;
  }
  return AuthCredentialsSchema.safeParse(fields);
}

function safeFailure(error: unknown): AccountFormState {
  if (error instanceof AccountServiceError) {
    if (error.reason === 'credentials')
      return { message: 'Не удалось войти. Проверьте телефон и пароль.' };
    if (error.reason === 'registration')
      return {
        message:
          'Не удалось создать аккаунт. Попробуйте войти или повторите позже.',
      };
    if (error.reason === 'limited')
      return { message: 'Слишком много попыток. Повторите позже.' };
    if (error.reason === 'origin')
      return {
        message:
          'Не удалось проверить источник запроса. Откройте страницу заново.',
      };
  }
  return {
    message: 'Сервис входа временно недоступен. Повторите попытку позже.',
  };
}

async function authenticate(
  mode: 'login' | 'register',
  formData: FormData,
): Promise<AccountFormState> {
  try {
    await requireActionOrigin();
    const parsed = readCredentials(formData);
    if (!parsed || !parsed.success) {
      const invalid = new Set(
        parsed?.error.issues.map((issue) => issue.path[0]),
      );
      return {
        message: 'Проверьте данные формы.',
        fields: {
          ...(invalid.has('phone')
            ? {
                phone: 'Российский номер: +7 и 10 цифр. Допустим формат с 8.',
              }
            : {}),
          ...(invalid.has('password')
            ? {
                password:
                  'От 15 до 128 символов. Пробелы в пароле сохраняются.',
              }
            : {}),
        },
      };
    }
    await beginSession(mode, parsed.data);
  } catch (error) {
    return safeFailure(error);
  }
  redirect('/account');
}

export async function loginAccount(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  return authenticate('login', formData);
}

export async function registerAccount(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  return authenticate('register', formData);
}

export async function logoutAccount(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    await requireActionOrigin();
    for (const [key] of formData.entries()) {
      if (!key.startsWith('$ACTION_'))
        return {
          message: 'Не удалось выполнить выход. Откройте страницу заново.',
        };
    }
    await endSession();
  } catch {
    return { message: 'Не удалось завершить выход. Повторите попытку.' };
  }
  redirect('/account');
}
