import s from './admin.module.css';

export default function AdminLoading() {
  return (
    <main id="main" className={s.gate}>
      <section className={s.gateCard} role="status" aria-live="polite">
        <span className={s.eyebrow}>VEGA / WORKSPACE</span>
        <h1>Открываем каталог</h1>
        <p>Проверяем доступ и загружаем товары.</p>
      </section>
    </main>
  );
}
