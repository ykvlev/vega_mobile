import s from './account.module.css';

export default function AccountLoading() {
  return (
    <main id="main" className={s.account}>
      <div className={s.loading} role="status" aria-live="polite">
        <span className={s.eyebrow}>VEGA / аккаунт</span>
        <h1>Проверяем сеанс.</h1>
        <p>Подождите немного.</p>
      </div>
    </main>
  );
}
