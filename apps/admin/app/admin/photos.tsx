'use client';

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { AdminProduct } from '@vega/contracts';
import { useEditorGuard } from './editor-guard';
import { deletePhoto, reorderPhotos } from './image-actions';
import { initialAdminState, type AdminActionState } from './model';
import s from './admin.module.css';

type PhotoAction = (
  previous: AdminActionState,
  form: FormData,
) => Promise<AdminActionState>;

function PhotoMutation({
  product,
  imageId,
  imageIds,
  label,
  disabled,
  children,
  onError,
}: {
  product: AdminProduct;
  imageId?: string;
  imageIds?: string[];
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onError: (message: string) => void;
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    imageId ? deletePhoto : (reorderPhotos as PhotoAction),
    initialAdminState,
  );
  const guard = useEditorGuard();
  const owner = useId();
  const { setMediaPending } = guard;
  useEffect(() => {
    setMediaPending(pending, owner);
  }, [pending, owner, setMediaPending]);
  useEffect(() => {
    if (state.message) onError(state.message);
  }, [state.message, onError]);
  const blocked =
    guard.dirty ||
    guard.savePending ||
    guard.publicationPending ||
    guard.mediaPending;
  return (
    <form
      action={action}
      className={s.photoMutation}
      onSubmit={(event) => {
        if (blocked) event.preventDefault();
        else {
          onError('');
          guard.setMediaPending(true, owner);
        }
      }}
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="version" value={product.version} />
      {imageId ? (
        <input type="hidden" name="imageId" value={imageId} />
      ) : (
        <input type="hidden" name="imageIds" value={JSON.stringify(imageIds)} />
      )}
      <button
        type="submit"
        aria-label={label}
        disabled={disabled || blocked || pending}
      >
        {children}
      </button>
    </form>
  );
}

export function ProductPhotos({ product }: { product: AdminProduct | null }) {
  const guard = useEditorGuard();
  const owner = useId();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const [selectedId, setSelectedId] = useState(product?.images[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const { setMediaPending } = guard;
  useEffect(() => {
    setMediaPending(uploading || refreshing, owner);
  }, [uploading, refreshing, owner, setMediaPending]);
  const blocked =
    guard.dirty ||
    guard.savePending ||
    guard.publicationPending ||
    guard.mediaPending;
  const selected =
    product?.images.find((image) => image.id === selectedId) ??
    product?.images[0];
  const selectedIndex =
    product?.images.findIndex((image) => image.id === selected?.id) ?? 0;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !product || !file || blocked) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Подойдут только JPEG, PNG или WebP.');
      return;
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      setError('Выберите файл размером до 5 МБ.');
      return;
    }
    setUploading(true);
    guard.setMediaPending(true, owner);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('productId', product.id);
    form.append('version', String(product.version));
    try {
      const response = await fetch('/admin/images/upload', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof body.error === 'object' &&
          body.error !== null &&
          'code' in body.error
            ? body.error.code
            : null;
        const messages: Record<string, string> = {
          AUTH_REQUIRED: 'Сеанс завершён. Войдите снова.',
          FORBIDDEN: 'Недостаточно прав для загрузки.',
          VERSION_CONFLICT:
            'Товар изменился. Обновите страницу перед загрузкой.',
          IMAGE_LIMIT_REACHED: 'Можно добавить не больше 8 фотографий.',
          PAYLOAD_TOO_LARGE: 'Файл слишком большой. Максимум — 5 МБ.',
          INVALID_IMAGE:
            'Не удалось прочитать изображение. Выберите JPEG, PNG или WebP.',
        };
        setError(
          typeof code === 'string' && Object.hasOwn(messages, code)
            ? messages[code]!
            : 'Не удалось загрузить фотографию. Повторите попытку позже.',
        );
        return;
      }
      if (
        typeof body !== 'object' ||
        body === null ||
        !('ok' in body) ||
        body.ok !== true
      )
        throw new Error('Upload unavailable');
      setFile(null);
      if (input.current) input.current.value = '';
      startRefresh(() => router.refresh());
    } catch {
      setError(
        'Не удалось подтвердить загрузку. Обновите страницу перед повторной попыткой.',
      );
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, direction: -1 | 1): string[] {
    const ids = product?.images.map((image) => image.id) ?? [];
    const target = index + direction;
    if (target >= 0 && target < ids.length)
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    return ids;
  }

  return (
    <section className={s.photos} aria-labelledby="product-photos-title">
      <div className={s.photosHeading}>
        <div>
          <span className={s.eyebrow}>Карточка товара</span>
          <h2 id="product-photos-title">Фотографии товара</h2>
        </div>
        {product && (
          <span className={s.photosCount}>{product.images.length} / 8</span>
        )}
      </div>
      {!product ? (
        <p className={s.photoHint}>
          Сначала сохраните черновик, чтобы добавить фотографии.
        </p>
      ) : (
        <>
          <p className={s.photoHint}>
            Первое фото — обложка карточки. Остальные появятся в галерее.
          </p>
          {selected && (
            <div className={s.photoPreview}>
              <Image
                src={selected.url}
                alt={`${product.name} — фото ${selectedIndex + 1}`}
                fill
                unoptimized
                sizes="(max-width: 650px) 100vw, 640px"
                className={s.actualPhoto}
              />
            </div>
          )}
          {product.images.length > 0 && (
            <ol className={s.photoList} aria-label="Фотографии товара">
              {product.images.map((image, index) => (
                <li key={image.id}>
                  <button
                    type="button"
                    className={s.photoThumbnail}
                    aria-label={`Показать фото ${index + 1}`}
                    aria-pressed={selected?.id === image.id}
                    disabled={!ready}
                    onClick={() => setSelectedId(image.id)}
                  >
                    <Image
                      src={image.url}
                      alt=""
                      fill
                      unoptimized
                      sizes="72px"
                      className={s.actualPhoto}
                    />
                  </button>
                  <div className={s.photoDetails}>
                    <strong>
                      Фото {index + 1}
                      {index === 0 ? ' · обложка' : ''}
                    </strong>
                    <span>
                      {image.width} × {image.height} px
                    </span>
                  </div>
                  <div className={s.photoButtons}>
                    <PhotoMutation
                      onError={setError}
                      product={product}
                      imageIds={move(index, -1)}
                      label={`Переместить фото ${index + 1} выше`}
                      disabled={index === 0}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <path d="m6 14 6-6 6 6" />
                      </svg>
                    </PhotoMutation>
                    <PhotoMutation
                      onError={setError}
                      product={product}
                      imageIds={move(index, 1)}
                      label={`Переместить фото ${index + 1} ниже`}
                      disabled={index === product.images.length - 1}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <path d="m6 10 6 6 6-6" />
                      </svg>
                    </PhotoMutation>
                    <PhotoMutation
                      onError={setError}
                      product={product}
                      imageId={image.id}
                      label={`Удалить фото ${index + 1}`}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
                      </svg>
                    </PhotoMutation>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {guard.dirty && (
            <p className={s.dirtyHint}>
              Сохраните карточку перед изменением фотографий.
            </p>
          )}
          {product.images.length < 8 ? (
            <form
              onSubmit={upload}
              className={s.uploadForm}
              aria-label="Загрузка фотографии"
              aria-busy={!ready || uploading || refreshing}
            >
              <label htmlFor="product-photo-file">Добавить фотографию</label>
              <input
                ref={input}
                id="product-photo-file"
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="photo-size-hint"
                disabled={!ready || blocked || uploading || refreshing}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError('');
                }}
              />
              <p id="photo-size-hint">
                До 8 фотографий · JPEG, PNG или WebP · до 5 МБ
              </p>
              <button
                className={s.secondary}
                type="submit"
                disabled={!ready || blocked || uploading || refreshing || !file}
              >
                {uploading || refreshing
                  ? 'Загружаем фотографию…'
                  : 'Загрузить фото'}
              </button>
            </form>
          ) : (
            <p className={s.photoHint}>
              Добавлены все 8 фотографий. Удалите одну, чтобы загрузить новую.
            </p>
          )}
          {error && (
            <p className={s.formError} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
