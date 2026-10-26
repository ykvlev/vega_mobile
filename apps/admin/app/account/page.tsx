import Link from 'next/link';
import { accountView } from './session';
import { CredentialsForm, LogoutForm } from './forms';
import s from './account.module.css';

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const validQuery =
    Object.keys(query).every((key) => key === 'mode') &&
    (query.mode === undefined ||
      query.mode === 'login' ||
      query.mode === 'register');
  const mode = query.mode === 'register' ? 'register' : 'login';
  const view = await accountView();
  return (
    <div className={s.account}>
      <div className={s.shell}>
        <header className={s.header}>
          <Link
            className={s.brand}
            href="/design-preview"
            aria-label="VEGA, к главной концепции"
          >
            VEGA<span>®</span>
          </Link>
          <Link className={s.back} href="/design-preview">
            Назад
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M20 12H4m6-6-6 6 6 6" />
            </svg>
          </Link>
        </header>
        <main id="main" className={s.main}>
          <section className={s.panel} aria-labelledby="account-title">
            {view.kind === 'authenticated' ? (
              <>
                <p className={s.eyebrow}>Личный кабинет</p>
                <div className={s.avatar} aria-hidden="true">
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  >
                    <circle cx="12" cy="7" r="4" />
                    <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
                  </svg>
                </div>
                <h1 id="account-title">Ваш аккаунт.</h1>
                <p className={s.description}>Вы вошли в VEGA.</p>
                <dl className={s.profile}>
                  <div>
                    <dt>Телефон</dt>
                    <dd>{view.user.phone}</dd>
                  </div>
                  <div>
                    <dt>Статус номера</dt>
                    <dd>
                      <span className={s.unverified}>
                        Телефон не подтверждён
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Тип доступа</dt>
                    <dd>
                      {view.user.role === 'manager' ? 'Сотрудник' : 'Клиент'}
                    </dd>
                  </div>
                  <div>
                    <dt>Коммерческий доступ</dt>
                    <dd>
                      {
                        {
                          pending: 'Ожидает одобрения менеджером',
                          approved: 'Одобрен менеджером',
                          rejected: 'Доступ не одобрен',
                          revoked: 'Доступ отозван',
                        }[view.user.commercialAccessStatus]
                      }
                    </dd>
                  </div>
                </dl>
                <p className={s.profileNote}>
                  Подтверждение номера и восстановление доступа ещё не
                  подключены. Цены, остатки и оформление заказа на этом этапе
                  недоступны.
                </p>
                <p className={s.profileNote}>
                  Менеджера назначит VEGA. Выбирать его самостоятельно не нужно.
                </p>
                <LogoutForm />
              </>
            ) : view.kind === 'unavailable' ? (
              <>
                <p className={s.eyebrow}>Личный кабинет</p>
                <h1 id="account-title">
                  Не удалось
                  <br />
                  проверить сеанс.
                </h1>
                <p className={s.description}>
                  Сервис аккаунтов временно недоступен. Проверьте соединение и
                  повторите попытку.
                </p>
                <p className={s.profileNote}>
                  Не удалось завершить выход? Попробуйте ещё раз позже.
                </p>
                <a className={s.primary} href="/account">
                  Повторить проверку<span aria-hidden="true">→</span>
                </a>
                <LogoutForm />
              </>
            ) : (
              <>
                <p className={s.eyebrow}>
                  {mode === 'register' ? 'Новый аккаунт' : 'С возвращением'}
                </p>
                <h1 id="account-title">
                  {mode === 'register' ? 'Регистрация' : 'Вход в VEGA'}
                </h1>
                <p className={s.description}>
                  {mode === 'register'
                    ? 'Укажите телефон и придумайте надёжный пароль.'
                    : 'Введите телефон и пароль от вашего аккаунта.'}
                </p>
                {!validQuery && (
                  <p className={s.error} role="alert">
                    Некорректная ссылка. Используйте форму входа ниже.
                  </p>
                )}
                {view.kind === 'expired' && (
                  <p className={s.sessionNote} role="status">
                    Сеанс завершён. Войдите снова.
                  </p>
                )}
                {mode === 'register' && (
                  <p className={s.profileNote}>
                    После регистрации менеджер проверит аккаунт. Цены и наличие
                    откроются после его одобрения. Выбирать менеджера не нужно.
                  </p>
                )}
                <CredentialsForm key={mode} mode={mode} />
                <p className={s.footerNote}>
                  Тестовый аккаунт VEGA. Покупки пока недоступны.
                </p>
              </>
            )}
          </section>
        </main>
        <footer className={s.footer}>
          <span>VEGA / ACCOUNT</span>
          <span>Тестовая среда · номер пока не подтверждается</span>
        </footer>
      </div>
    </div>
  );
}
