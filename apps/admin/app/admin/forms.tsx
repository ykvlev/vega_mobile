'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { AdminProduct, PublicCategory } from '@vega/contracts';
import {
  changePublication,
  saveExistingProduct,
  saveNewCategory,
  saveNewProduct,
} from './actions';
import { initialAdminState, millimetersToMeters } from './model';
import s from './admin.module.css';
import { useEditorGuard } from './editor-guard';

function FormMessage({ message }: { message?: string }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {message && (
        <p className={s.formError} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

export function ProductEditor({
  product,
  categories,
}: {
  product: AdminProduct | null;
  categories: PublicCategory[];
}) {
  const [state, action, pending] = useActionState(
    product ? saveExistingProduct : saveNewProduct,
    initialAdminState,
  );
  const [values, setValues] = useState({
    name: product?.name ?? '',
    article: product?.article ?? '',
    categoryId: product?.categoryId ?? '',
    description: product?.description ?? '',
    rollLengthMeters: product ? millimetersToMeters(product.rollLengthMm) : '',
    widthMm: product?.widthMm ?? '',
  });
  const [attributes, setAttributes] = useState<
    { name: string; value: string }[]
  >(
    Object.entries(product?.characteristics ?? {}).map(([name, value]) => ({
      name,
      value,
    })),
  );
  const initialValues = useRef(values).current;
  const initialAttributes = useRef(attributes).current;
  const guard = useEditorGuard();
  const { setSavePending } = guard;
  useEffect(() => {
    setSavePending(pending);
  }, [pending, setSavePending]);
  const markDirty = (
    nextValues: typeof values,
    nextAttributes: typeof attributes,
  ) => {
    guard.setDirty(
      JSON.stringify([nextValues, nextAttributes]) !==
        JSON.stringify([initialValues, initialAttributes]),
    );
  };
  const updateAttributes = (next: typeof attributes) => {
    setAttributes(next);
    markDirty(values, next);
  };
  const filledAttributes = attributes.filter(
    (row) => row.name.trim() || row.value,
  );
  const duplicateAttributes =
    new Set(filledAttributes.map((row) => row.name.trim())).size !==
    filledAttributes.length;
  const characteristics = JSON.stringify(
    Object.fromEntries(
      filledAttributes.map((row) => [row.name.trim(), row.value]),
    ),
  );
  const update = (name: keyof typeof values, value: string) => {
    const next = { ...values, [name]: value };
    setValues(next);
    markDirty(next, attributes);
  };
  return (
    <form
      action={action}
      className={s.editorForm}
      aria-label={product ? 'Редактирование товара' : 'Новый товар'}
      onSubmit={(event) => {
        if (guard.publicationPending || guard.mediaPending)
          event.preventDefault();
        else guard.setSavePending(true);
      }}
    >
      {product && (
        <>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="version" value={product.version} />
        </>
      )}
      <input type="hidden" name="characteristics" value={characteristics} />
      <fieldset
        disabled={pending || guard.publicationPending || guard.mediaPending}
        className={s.formFields}
      >
        <div className={s.formSection}>
          <div className={s.sectionNumber}>01</div>
          <div className={s.formSectionContent}>
            <h2>Основное</h2>
            <p>Название, артикул и категория в клиентском каталоге.</p>
            <div className={s.formGrid}>
              <label className={s.fullField}>
                Название
                <input
                  name="name"
                  value={values.name}
                  onChange={(event) => update('name', event.target.value)}
                  required
                  maxLength={160}
                  placeholder="Например, VEGA Color Graphite"
                />
              </label>
              <label>
                Артикул
                <input
                  name="article"
                  value={values.article}
                  onChange={(event) => update('article', event.target.value)}
                  required
                  maxLength={64}
                  placeholder="Артикул товара"
                />
              </label>
              <label>
                Категория товара
                <select
                  aria-label="Категория товара"
                  name="categoryId"
                  value={values.categoryId}
                  onChange={(event) => update('categoryId', event.target.value)}
                  required
                >
                  <option value="">Выберите категорию</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.fullField}>
                Описание
                <textarea
                  aria-label="Описание"
                  name="description"
                  rows={4}
                  value={values.description}
                  onChange={(event) =>
                    update('description', event.target.value)
                  }
                  maxLength={4000}
                  placeholder="Кратко расскажите о материале"
                />
              </label>
            </div>
          </div>
        </div>
        <div className={s.formSection}>
          <div className={s.sectionNumber}>02</div>
          <div className={s.formSectionContent}>
            <h2>Размеры</h2>
            <p>Длина задаётся для этого артикула, а не для всего каталога.</p>
            <div className={s.formGrid}>
              <label>
                Длина рулона, м
                <input
                  name="rollLengthMeters"
                  aria-label="Длина рулона, м"
                  aria-describedby="roll-length-hint"
                  type="text"
                  inputMode="decimal"
                  value={values.rollLengthMeters}
                  onChange={(event) =>
                    update('rollLengthMeters', event.target.value)
                  }
                  required
                  maxLength={16}
                  placeholder="17"
                  pattern="[0-9]+([.,][0-9]{1,3})?"
                />
                <span className={s.fieldHint} id="roll-length-hint">
                  До трёх знаков после запятой.
                </span>
              </label>
              <label>
                Ширина, мм
                <input
                  name="widthMm"
                  type="text"
                  inputMode="numeric"
                  value={values.widthMm}
                  onChange={(event) => update('widthMm', event.target.value)}
                  required
                  maxLength={10}
                  placeholder="1520"
                  pattern="[0-9]+"
                />
              </label>
            </div>
          </div>
        </div>
        <div className={s.formSection}>
          <div className={s.sectionNumber}>03</div>
          <div className={s.formSectionContent}>
            <h2>Характеристики</h2>
            <p>Добавьте свойства, которые увидят клиенты в карточке.</p>
            <div className={s.attributeList}>
              {attributes.map((row, index) => (
                <div className={s.attributeRow} key={index}>
                  <label>
                    Название характеристики {index + 1}
                    <input
                      value={row.name}
                      maxLength={64}
                      placeholder="Цвет"
                      onChange={(event) =>
                        updateAttributes(
                          attributes.map((item, position) =>
                            position === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required={Boolean(row.value)}
                    />
                  </label>
                  <label>
                    Значение характеристики {index + 1}
                    <input
                      value={row.value}
                      maxLength={256}
                      placeholder="Графит"
                      onChange={(event) =>
                        updateAttributes(
                          attributes.map((item, position) =>
                            position === index
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required={Boolean(row.name.trim())}
                    />
                  </label>
                  <button
                    className={s.removeAttribute}
                    type="button"
                    onClick={() =>
                      updateAttributes(
                        attributes.filter((_, position) => position !== index),
                      )
                    }
                    aria-label={`Удалить характеристику ${index + 1}`}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {duplicateAttributes && (
              <p className={s.formError} role="alert">
                Названия характеристик не должны повторяться.
              </p>
            )}
            <button
              className={s.addAttribute}
              aria-label="Добавить характеристику"
              type="button"
              disabled={attributes.length >= 20}
              onClick={() =>
                updateAttributes([...attributes, { name: '', value: '' }])
              }
            >
              + Добавить характеристику
            </button>
            <p className={s.fieldHint}>
              {attributes.length} из 20 характеристик
            </p>
          </div>
        </div>
        <div className={s.formActions}>
          <span className={s.formFootnote}>
            {product
              ? `Версия ${product.version}. Изменения не меняют статус публикации.`
              : 'Новый товар сначала сохраняется как черновик.'}
          </span>
          <button
            className={s.primary}
            type="submit"
            disabled={duplicateAttributes}
          >
            {pending
              ? 'Сохраняем…'
              : product
                ? 'Сохранить изменения'
                : 'Создать черновик'}
            <Arrow />
          </button>
        </div>
      </fieldset>
      <FormMessage message={state.message} />
    </form>
  );
}

export function PublicationForm({ product }: { product: AdminProduct }) {
  const [state, action, pending] = useActionState(
    changePublication,
    initialAdminState,
  );
  const guard = useEditorGuard();
  const { setPublicationPending } = guard;
  useEffect(() => {
    setPublicationPending(pending);
  }, [pending, setPublicationPending]);
  return (
    <form
      action={action}
      aria-label="Публикация товара"
      className={s.publicationForm}
      onSubmit={(event) => {
        if (
          guard.dirty ||
          guard.savePending ||
          guard.publicationPending ||
          guard.mediaPending
        )
          event.preventDefault();
        else guard.setPublicationPending(true);
      }}
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="version" value={product.version} />
      <input
        type="hidden"
        name="isPublished"
        value={String(!product.isPublished)}
      />
      <button
        className={product.isPublished ? s.secondary : s.primary}
        type="submit"
        disabled={
          pending ||
          guard.publicationPending ||
          guard.dirty ||
          guard.savePending ||
          guard.mediaPending
        }
        aria-describedby={guard.dirty ? 'publication-dirty-hint' : undefined}
      >
        {pending
          ? 'Обновляем…'
          : product.isPublished
            ? 'Снять с публикации'
            : 'Опубликовать'}
        {!product.isPublished && <Arrow />}
      </button>
      {guard.dirty && (
        <p id="publication-dirty-hint" className={s.dirtyHint}>
          Сначала сохраните изменения
        </p>
      )}
      <FormMessage message={state.message} />
    </form>
  );
}

export function CategoryEditor() {
  const [state, action, pending] = useActionState(
    saveNewCategory,
    initialAdminState,
  );
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  return (
    <form
      action={action}
      className={s.categoryForm}
      aria-label="Новая категория"
    >
      <span className={s.eyebrow}>Структура каталога</span>
      <h2>Новая категория</h2>
      <p>
        Название увидят клиенты. Код помогает отличить категории друг от друга.
      </p>
      <fieldset disabled={pending} className={s.formFields}>
        <label>
          Название категории
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
            placeholder="Цветная плёнка"
          />
        </label>
        <label>
          Код категории
          <input
            name="slug"
            aria-label="Код категории"
            aria-describedby="category-code-hint"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            maxLength={64}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            placeholder="color-film"
          />
          <span className={s.fieldHint} id="category-code-hint">
            Латиница в нижнем регистре, цифры и дефис.
          </span>
        </label>
        <button className={s.primary} type="submit">
          {pending ? 'Создаём…' : 'Создать категорию'}
          <Arrow />
        </button>
      </fieldset>
      <FormMessage message={state.message} />
    </form>
  );
}

export function Arrow() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
