'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { loginAccount, logoutAccount, registerAccount } from './actions';
import { initialAccountState } from './state';
import s from './account.module.css';

export function CredentialsForm({ mode }: { mode: 'login' | 'register' }) {
  const [state, action, pending] = useActionState(
    mode === 'register' ? registerAccount : loginAccount,
    initialAccountState,
  );
  const [visible, setVisible] = useState(false);
  return (
    <form
      action={action}
      className={s.form}
      aria-label={
        mode === 'register' ? 'Регистрация аккаунта' : 'Вход в аккаунт'
      }
    >
      <fieldset disabled={pending} className={s.fields}>
        <div className={s.field}>
          <label htmlFor="account-phone">Телефон</label>
          <input
            id="account-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+7 999 123-45-67"
            required
            maxLength={32}
            aria-describedby={
              state.fields?.phone ? 'phone-error' : 'phone-hint'
            }
            aria-invalid={Boolean(state.fields?.phone)}
          />
          <p className={s.hint} id="phone-hint">
            Пока только российские номера.
          </p>
          {state.fields?.phone && (
            <p className={s.fieldError} id="phone-error">
              {state.fields.phone}
            </p>
          )}
        </div>
        <div className={s.field}>
          <label htmlFor="account-password">Пароль</label>
          <div className={s.passwordRow}>
            <input
              id="account-password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete={
                mode === 'register' ? 'new-password' : 'current-password'
              }
              required
              minLength={15}
              maxLength={256}
              aria-describedby={
                state.fields?.password ? 'password-error' : 'password-hint'
              }
              aria-invalid={Boolean(state.fields?.password)}
            />
            <button
              type="button"
              aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {visible && <path d="m3 3 18 18" />}
              </svg>
            </button>
          </div>
          <p className={s.hint} id="password-hint">
            От 15 до 128 символов. Можно использовать пробелы.
          </p>
          {state.fields?.password && (
            <p className={s.fieldError} id="password-error">
              {state.fields.password}
            </p>
          )}
        </div>
        <button type="submit" className={s.primary} disabled={pending}>
          {pending
            ? 'Подождите…'
            : mode === 'register'
              ? 'Создать аккаунт'
              : 'Войти'}
          <span aria-hidden="true">→</span>
        </button>
      </fieldset>
      <div aria-live="polite" aria-atomic="true">
        {state.message && (
          <p className={s.error} role="alert">
            {state.message}
          </p>
        )}
      </div>
      <p className={s.switch}>
        {mode === 'register' ? (
          <Link href="/account">Уже есть аккаунт? Войти</Link>
        ) : (
          <>
            <span>Ещё нет аккаунта?</span>
            <Link href="/account?mode=register">Зарегистрироваться</Link>
          </>
        )}
      </p>
    </form>
  );
}

export function LogoutForm() {
  const [state, action, pending] = useActionState(
    logoutAccount,
    initialAccountState,
  );
  return (
    <form action={action} className={s.logoutForm}>
      <button type="submit" className={s.secondary} disabled={pending}>
        {pending ? 'Завершаем сеанс…' : 'Выйти'}
      </button>
      <div aria-live="polite" aria-atomic="true">
        {state.message && (
          <p className={s.error} role="alert">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
