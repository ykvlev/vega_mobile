import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  AuthCredentialsSchema,
  type PublicCategory,
  type PublicProduct,
} from '@vega/contracts';
import {
  getProduct,
  listCategories,
  listProducts,
  productImageUrl,
} from './api';
import { useSession } from './session';
import { useSelection } from './selection';
import { palette, styles as s } from './mobile-styles';
import hero from '../assets/vega-hero.png';
import { StudioScreen } from './studio-screen';
import { useStudioChoice } from './studio-choice';

type Tab = 'home' | 'catalog' | 'selection' | 'account';
type Unit = 'meter' | 'roll';

function Action({
  children,
  onPress,
  disabled = false,
  secondary = false,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[secondary ? s.secondary : s.primary, disabled && s.disabled]}
    >
      <Text style={secondary ? s.secondaryText : s.primaryText}>
        {children}
      </Text>
    </Pressable>
  );
}

function Notice({ children, retry }: { children: string; retry?: () => void }) {
  return (
    <View style={s.state}>
      <Text accessibilityRole="alert" style={s.stateText}>
        {children}
      </Text>
      {retry && (
        <Action onPress={retry} secondary>
          Повторить
        </Action>
      )}
    </View>
  );
}

function Loading({ text = 'Загружаем каталог' }: { text?: string }) {
  return (
    <View style={s.state} accessibilityLiveRegion="polite">
      <ActivityIndicator color={palette.ink} />
      <Text style={s.stateText}>{text}</Text>
    </View>
  );
}

function Header({ title, back }: { title?: string; back?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад в каталог"
          onPress={back}
          style={s.iconButton}
        >
          <Text style={s.back}>←</Text>
        </Pressable>
      ) : (
        <View style={s.iconButton} />
      )}
      {title ? (
        <Text accessibilityRole="header" style={s.headerTitle}>
          {title}
        </Text>
      ) : (
        <Text style={s.wordmark} allowFontScaling={false}>
          VEGA
        </Text>
      )}
      <View style={s.iconButton} />
    </View>
  );
}

function ProductVisual({ product }: { product: PublicProduct }) {
  const uri = product.media
    .map(productImageUrl)
    .find((value) => value !== null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={s.productImage}
        accessibilityLabel={product.name}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={{ alignItems: 'center' }}
      accessibilityLabel="Фотография ещё не добавлена"
    >
      <View style={s.roll}>
        <Text style={s.rollText} allowFontScaling={false}>
          VEGA
        </Text>
      </View>
      <Text style={s.noPhoto}>Фотография ещё не добавлена</Text>
    </View>
  );
}

function HomeScreen({
  catalog,
  account,
  studio,
}: {
  catalog: (categoryId?: string) => void;
  account: () => void;
  studio: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    listCategories(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCategories(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <ImageBackground
      testID="home-screen"
      source={hero}
      style={[
        s.hero,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 118 },
      ]}
      imageStyle={s.heroImage}
    >
      <View style={s.heroTop}>
        <Text style={s.demo}>Демонстрационная версия VEGA</Text>
        <View style={s.heroCollections}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Все плёнки"
            onPress={() => catalog()}
            style={s.heroCollection}
          >
            <Text style={s.heroCollectionText}>Все плёнки</Text>
          </Pressable>
          {categories.slice(0, 3).map((category) => (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.name}
              onPress={() => catalog(category.id)}
              style={s.heroCollection}
            >
              <Text style={s.heroCollectionText}>{category.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={s.heroCampaign}>
        <Text accessibilityRole="header" style={s.heroTitle}>
          Цвет меняет всё
        </Text>
        <Text style={s.heroSubtitle}>Коллекция автомобильных плёнок</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Выбрать плёнку"
          onPress={() => catalog()}
          style={s.heroCta}
        >
          <Text style={s.heroCtaText}>Выбрать плёнку</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть 3D-студию"
          onPress={studio}
          style={s.heroCta}
        >
          <Text style={s.heroCtaText}>Открыть 3D-студию</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть аккаунт"
        onPress={account}
      >
        <Text style={s.heroBrand} allowFontScaling={false}>
          VEGA
        </Text>
        <Text style={s.heroBrandNote}>Авторская цветовая концепция</Text>
      </Pressable>
    </ImageBackground>
  );
}

function CatalogScreen({
  onStudio,
  categoryId,
  onCategory,
  onProduct,
  query,
  onQuery,
  draftQuery,
  onDraftQuery,
}: {
  onStudio: () => void;
  categoryId: string | undefined;
  onCategory: (id: string | undefined) => void;
  onProduct: (id: string) => void;
  query: string;
  onQuery: (value: string) => void;
  draftQuery: string;
  onDraftQuery: (value: string) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (Math.min(width, 1100) - 48) / 2;
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const setDraftQuery = onDraftQuery;
  const setQuery = onQuery;
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const generation = useRef(0);
  const moreController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    moreController.current?.abort();
    setLoading(true);
    setError(false);
    setMore(false);
    setMoreError(false);
    setProducts([]);
    setCursor(null);
    Promise.all([
      listCategories(controller.signal),
      listProducts({ q: query || undefined, categoryId }, controller.signal),
    ])
      .then(([nextCategories, page]) => {
        if (controller.signal.aborted || current !== generation.current) return;
        setCategories(nextCategories);
        setProducts(page.items);
        setCursor(page.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted && current === generation.current)
          setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && current === generation.current)
          setLoading(false);
      });
    return () => {
      controller.abort();
      moreController.current?.abort();
    };
  }, [query, categoryId, attempt]);
  const loadMore = async () => {
    if (!cursor || more) return;
    const current = generation.current;
    const controller = new AbortController();
    moreController.current = controller;
    setMore(true);
    setMoreError(false);
    try {
      const page = await listProducts(
        { q: query || undefined, categoryId, cursor },
        controller.signal,
      );
      if (controller.signal.aborted || current !== generation.current) return;
      setProducts((existing) => [
        ...existing,
        ...page.items.filter(
          (item) => !existing.some((value) => value.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor === cursor ? null : page.nextCursor);
    } catch {
      if (!controller.signal.aborted && current === generation.current)
        setMoreError(true);
    } finally {
      if (!controller.signal.aborted && current === generation.current)
        setMore(false);
    }
  };
  return (
    <ScrollView
      testID="catalog-screen"
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Header title="Каталог" />
      <View style={s.body}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть 3D-студию"
          onPress={onStudio}
          style={s.textButton}
        >
          <Text style={s.linkText}>3D-эскиз автомобиля</Text>
        </Pressable>
        <View style={s.searchRow}>
          <TextInput
            accessibilityLabel="Поиск по названию или артикулу"
            style={s.searchInput}
            value={draftQuery}
            onChangeText={setDraftQuery}
            placeholder="Название или артикул"
            placeholderTextColor={palette.muted}
            maxLength={128}
            returnKeyType="search"
            onSubmitEditing={() => {
              setQuery(draftQuery.trim());
              Keyboard.dismiss();
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Найти"
            onPress={() => {
              setQuery(draftQuery.trim());
              Keyboard.dismiss();
            }}
            style={s.searchAction}
          >
            <Text style={s.smallAction}>Найти</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.categories}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Все"
            accessibilityState={{ selected: !categoryId }}
            onPress={() => onCategory(undefined)}
            style={[s.category, !categoryId && s.categoryActive]}
          >
            <Text style={s.categoryText}>Все</Text>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.name}
              accessibilityState={{ selected: categoryId === category.id }}
              onPress={() => onCategory(category.id)}
              style={[
                s.category,
                categoryId === category.id && s.categoryActive,
              ]}
            >
              <Text style={s.categoryText}>{category.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={s.tiny}>
          Тестовый каталог · цены и наличие пока не подключены
        </Text>
        {loading ? (
          <Loading />
        ) : error ? (
          <Notice retry={() => setAttempt((value) => value + 1)}>
            Не удалось загрузить каталог. Проверьте соединение и повторите
            попытку.
          </Notice>
        ) : products.length === 0 ? (
          <View style={s.state}>
            <Text style={s.stateText}>
              По вашему запросу ничего не найдено.
            </Text>
            <Action
              secondary
              onPress={() => {
                setDraftQuery('');
                setQuery('');
                onCategory(undefined);
              }}
            >
              Сбросить поиск
            </Action>
          </View>
        ) : (
          <View style={s.grid}>
            {products.map((product) => (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                accessibilityLabel={`Открыть ${product.name}`}
                onPress={() => onProduct(product.id)}
                style={[s.productCard, { width: cardWidth }]}
              >
                <View style={[s.productVisual, { height: cardWidth * 1.3 }]}>
                  <ProductVisual product={product} />
                </View>
                <Text style={s.article}>{product.article}</Text>
                <Text style={s.productName}>{product.name}</Text>
                <Text style={s.tiny}>
                  Рулон {Number(product.rollLengthMm) / 1000} м
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {moreError && (
          <Text accessibilityRole="alert" style={s.error}>
            Не удалось загрузить следующую страницу. Повторите попытку.
          </Text>
        )}
        {cursor && !loading && (
          <Action
            secondary
            disabled={more}
            onPress={() => {
              void loadMore();
            }}
          >
            {more ? 'Загружаем…' : 'Показать ещё'}
          </Action>
        )}
      </View>
    </ScrollView>
  );
}

function ProductDetail({
  id,
  back,
  selection,
}: {
  id: string;
  back: () => void;
  selection: () => void;
}) {
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [unit, setUnit] = useState<Unit>('meter');
  const [metres, setMetres] = useState(1);
  const [rolls, setRolls] = useState('1');
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const chosen = useSelection();
  useEffect(() => {
    const controller = new AbortController();
    setProduct(null);
    setError(false);
    setAdded(false);
    getProduct(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setProduct(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [id, attempt]);
  const quantity = unit === 'meter' ? metres : Number(rolls);
  const valid =
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    (unit !== 'meter' || quantity <= 18);
  const add = async () => {
    if (!product || !valid || pending || !chosen.ready) return;
    setPending(true);
    try {
      const saved = await chosen.put(product, unit, quantity);
      setAdded(saved);
    } finally {
      setPending(false);
    }
  };
  return (
    <ScrollView
      testID="product-detail"
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Header title="Карточка товара" back={back} />
      {error ? (
        <Notice retry={() => setAttempt((value) => value + 1)}>
          Не удалось открыть товар. Он мог быть снят с публикации. Повторите
          попытку или вернитесь в каталог.
        </Notice>
      ) : !product ? (
        <Loading text="Открываем товар" />
      ) : (
        <>
          <View style={[s.productVisual, s.detailImage]}>
            <ProductVisual product={product} />
          </View>
          <View style={s.body}>
            <Text style={s.article}>{product.article}</Text>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              {product.name}
            </Text>
            {!!product.description && (
              <Text style={s.text}>{product.description}</Text>
            )}
            <View style={s.facts}>
              <Fact
                title="Длина рулона"
                value={`${Number(product.rollLengthMm) / 1000} м`}
              />
              <Fact title="Ширина" value={`${product.widthMm} мм`} />
              {Object.entries(product.characteristics).map(([name, value]) => (
                <Fact key={name} title={name} value={value} />
              ))}
            </View>
            <Text style={s.muted}>
              Цены и наличие откроются после одобрения менеджером. Сейчас
              доступен только локальный подбор.
            </Text>
            <View style={s.segments}>
              {(['meter', 'roll'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={value === 'meter' ? 'Метры' : 'Рулоны'}
                  accessibilityState={{ selected: unit === value }}
                  onPress={() => {
                    setUnit(value);
                    setAdded(false);
                  }}
                  style={[s.segment, unit === value && s.segmentActive]}
                >
                  <Text style={s.smallAction}>
                    {value === 'meter' ? 'Метры' : 'Рулоны'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {unit === 'meter' ? (
              <View style={{ gap: 12 }}>
                <Text style={s.fieldLabel}>Длина отреза</Text>
                <View style={s.metreGrid}>
                  {Array.from({ length: 18 }, (_, index) => index + 1).map(
                    (length) => (
                      <Pressable
                        key={length}
                        accessibilityRole="button"
                        accessibilityLabel={`${length} м`}
                        accessibilityState={{ selected: metres === length }}
                        onPress={() => {
                          setMetres(length);
                          setAdded(false);
                        }}
                        style={[s.metre, metres === length && s.metreActive]}
                      >
                        <Text
                          style={[
                            s.metreText,
                            metres === length && s.metreActiveText,
                          ]}
                        >
                          {length} м
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              </View>
            ) : (
              <View style={s.field}>
                <Text style={s.fieldLabel}>Количество рулонов</Text>
                <TextInput
                  accessibilityLabel="Количество рулонов"
                  keyboardType="number-pad"
                  style={s.input}
                  value={rolls}
                  maxLength={9}
                  onChangeText={(value) => {
                    setRolls(value);
                    setAdded(false);
                  }}
                />
              </View>
            )}
            <Text style={s.tiny}>
              Выбранный метраж не подтверждает наличие. Ничего не резервируется
              и не оформляется.
            </Text>
            <Action
              disabled={!valid || pending || !chosen.ready}
              onPress={() => {
                void add();
              }}
            >
              {pending ? 'Сохраняем…' : 'Добавить в подбор'}
            </Action>
            {chosen.error && (
              <Text accessibilityRole="alert" style={s.error}>
                {chosen.error}
              </Text>
            )}
            {added && !chosen.error && (
              <>
                <Text accessibilityLiveRegion="polite" style={s.muted}>
                  Добавлено в подбор
                </Text>
                <Action secondary onPress={selection}>
                  Открыть подбор
                </Action>
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Fact({ title, value }: { title: string; value: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.tiny}>{title}</Text>
      <Text style={s.text}>{value}</Text>
    </View>
  );
}

function SelectionScreen({
  catalog,
  open,
}: {
  catalog: () => void;
  open: (id: string) => void;
}) {
  const selection = useSelection();
  return (
    <ScrollView testID="selection-screen" contentContainerStyle={s.scroll}>
      <Header title="Ваш подбор" />
      <View style={s.body}>
        <Text style={s.muted}>
          Список для выбора материалов. Это не заказ и не гарантия наличия.
        </Text>
        {selection.error && (
          <Text accessibilityRole="alert" style={s.error}>
            {selection.error}
          </Text>
        )}
        {!selection.ready ? (
          <Loading text="Восстанавливаем подбор" />
        ) : selection.items.length === 0 ? (
          <>
            <Text style={[s.stateText, { paddingVertical: 40 }]}>
              В подборе пока нет материалов.
            </Text>
            <Action onPress={catalog}>Перейти в каталог</Action>
          </>
        ) : (
          selection.items.map((item) => (
            <View
              key={`${item.product.skuId}:${item.unit}`}
              style={s.selectionItem}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Открыть ${item.product.name}`}
                onPress={() => open(item.product.id)}
                style={s.selectionRow}
              >
                <View style={[s.productVisual, s.selectionImage]}>
                  <ProductVisual product={item.product} />
                </View>
                <View style={s.selectionInfo}>
                  <Text style={s.productName}>{item.product.name}</Text>
                  <Text style={s.article}>{item.product.article}</Text>
                  <Text style={s.text}>
                    {item.quantity} {item.unit === 'meter' ? 'м' : 'рул.'}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить ${item.product.name}, ${item.unit === 'meter' ? 'метры' : 'рулоны'}`}
                onPress={() => {
                  void selection.remove(item.product.skuId, item.unit);
                }}
                style={s.textButton}
              >
                <Text style={s.linkText}>Удалить</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const approvalLabels = {
  pending: 'Ожидает одобрения менеджером',
  approved: 'Одобрен менеджером',
  rejected: 'Доступ не одобрен',
  revoked: 'Доступ отозван',
};

function AccountScreen() {
  const session = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => {
    if (session.state !== 'authenticated') return;
    setPhone('');
    setPassword('');
    setVisible(false);
    setValidation(null);
    setMode('login');
  }, [session.state]);
  const submit = async () => {
    const credentials = AuthCredentialsSchema.safeParse({ phone, password });
    if (!credentials.success) {
      setValidation(
        'Проверьте российский номер телефона и пароль: от 15 до 128 символов.',
      );
      return;
    }
    setValidation(null);
    Keyboard.dismiss();
    await (mode === 'login'
      ? session.login(credentials.data)
      : session.register(credentials.data));
  };
  return (
    <ScrollView
      testID="account-screen"
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Header />
      <View
        style={[s.body, { maxWidth: 560, width: '100%', alignSelf: 'center' }]}
      >
        {session.state === 'restoring' ? (
          <Loading text="Проверяем сеанс" />
        ) : session.state === 'unavailable' ? (
          <>
            <Text accessibilityRole="header" style={s.title}>
              Проверить сеанс не удалось
            </Text>
            <Notice
              retry={() => {
                void session.retry();
              }}
            >
              Сервис аккаунтов временно недоступен. Проверьте соединение и
              повторите попытку.
            </Notice>
            <Action
              secondary
              disabled={session.pending}
              onPress={() => {
                void session.logout();
              }}
            >
              Выйти
            </Action>
          </>
        ) : session.state === 'authenticated' && session.user ? (
          <>
            <Text accessibilityRole="header" style={s.title}>
              Ваш аккаунт
            </Text>
            <View>
              <Fact title="Телефон" value={session.user.phone} />
              <Fact title="Статус номера" value="Телефон не подтверждён" />
              <Fact
                title="Коммерческий доступ"
                value={approvalLabels[session.user.commercialAccessStatus]}
              />
            </View>
            <Text style={s.muted}>
              Менеджера назначит VEGA. Выбирать его самостоятельно не нужно.
            </Text>
            <Text style={s.tiny}>
              Реальные цены, наличие и оформление заказа пока не подключены.
            </Text>
            <Action
              secondary
              disabled={session.pending}
              onPress={() => {
                void session.retry();
              }}
            >
              Обновить статус
            </Action>
            <Action
              secondary
              disabled={session.pending}
              onPress={() => {
                void session.logout();
              }}
            >
              Выйти
            </Action>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={s.title}>
              {mode === 'login' ? 'Вход в VEGA' : 'Регистрация'}
            </Text>
            <Text style={[s.muted, s.centered]}>
              {mode === 'login'
                ? 'Введите телефон и пароль от вашего аккаунта.'
                : 'После регистрации менеджер проверит аккаунт. Цены и наличие откроются после одобрения.'}
            </Text>
            <View style={s.form}>
              <View style={s.field}>
                <Text style={s.fieldLabel}>Телефон</Text>
                <TextInput
                  accessibilityLabel="Телефон"
                  style={s.input}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  placeholder="+7 999 123-45-67"
                  placeholderTextColor={palette.muted}
                  maxLength={32}
                  editable={!session.pending}
                />
              </View>
              <View style={s.field}>
                <Text style={s.fieldLabel}>Пароль</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    accessibilityLabel="Пароль"
                    style={s.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!visible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={
                      mode === 'register' ? 'new-password' : 'current-password'
                    }
                    textContentType={
                      mode === 'register' ? 'newPassword' : 'password'
                    }
                    maxLength={256}
                    editable={!session.pending}
                    onSubmitEditing={() => {
                      void submit();
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      visible ? 'Скрыть пароль' : 'Показать пароль'
                    }
                    onPress={() => setVisible((value) => !value)}
                    style={s.passwordAction}
                  >
                    <Text style={s.tiny}>
                      {visible ? 'Скрыть' : 'Показать'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={s.tiny}>
                  От 15 до 128 символов. Можно использовать пробелы.
                </Text>
              </View>
              {validation && (
                <Text accessibilityRole="alert" style={s.error}>
                  {validation}
                </Text>
              )}
              <Action
                disabled={session.pending}
                onPress={() => {
                  void submit();
                }}
              >
                {session.pending
                  ? 'Подождите…'
                  : mode === 'login'
                    ? 'Войти'
                    : 'Создать аккаунт'}
              </Action>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  mode === 'login'
                    ? 'Зарегистрироваться'
                    : 'Уже есть аккаунт? Войти'
                }
                disabled={session.pending}
                onPress={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setPassword('');
                  setValidation(null);
                  session.clearError();
                }}
                style={s.textButton}
              >
                <Text style={s.linkText}>
                  {mode === 'login'
                    ? 'Зарегистрироваться'
                    : 'Уже есть аккаунт? Войти'}
                </Text>
              </Pressable>
            </View>
            <Text style={s.tiny}>
              Демонстрационный аккаунт. Номер пока не подтверждается.
            </Text>
          </>
        )}
        {session.error && (
          <Text accessibilityRole="alert" style={s.error}>
            {session.error}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

export function CustomerApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [productId, setProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [keyboard, setKeyboard] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const studioChoice = useStudioChoice();
  const selection = useSelection();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (studioOpen) {
        setStudioOpen(false);
        return true;
      }
      if (productId) {
        setProductId(null);
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [productId, tab, studioOpen]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboard(true),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboard(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const navigate = (next: Tab) => {
    Keyboard.dismiss();
    setStudioOpen(false);
    setProductId(null);
    setTab(next);
  };
  const catalog = (category?: string) => {
    setSearchQuery('');
    setSearchDraft('');
    setCategoryId(category);
    navigate('catalog');
  };
  const open = (id: string) => {
    setProductId(id);
    setTab('catalog');
  };
  let content: ReactNode;
  if (studioOpen)
    content = (
      <StudioScreen
        saved={studioChoice}
        back={() => setStudioOpen(false)}
        catalog={() => catalog()}
      />
    );
  else if (tab === 'home')
    content = (
      <HomeScreen
        catalog={catalog}
        account={() => navigate('account')}
        studio={() => setStudioOpen(true)}
      />
    );
  else if (tab === 'catalog')
    content = productId ? (
      <ProductDetail
        key={productId}
        id={productId}
        back={() => setProductId(null)}
        selection={() => navigate('selection')}
      />
    ) : (
      <CatalogScreen
        onStudio={() => setStudioOpen(true)}
        categoryId={categoryId}
        onCategory={setCategoryId}
        onProduct={open}
        query={searchQuery}
        onQuery={setSearchQuery}
        draftQuery={searchDraft}
        onDraftQuery={setSearchDraft}
      />
    );
  else if (tab === 'selection')
    content = <SelectionScreen catalog={() => catalog()} open={open} />;
  else content = <AccountScreen />;
  return (
    <SafeAreaView style={s.app} edges={['left', 'right']}>
      <StatusBar
        barStyle={
          tab === 'home' && !studioOpen ? 'light-content' : 'dark-content'
        }
      />
      <KeyboardAvoidingView
        style={s.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
      </KeyboardAvoidingView>
      {!keyboard && !studioOpen && (
        <View
          style={[
            s.navigation,
            tab === 'home' && s.homeNavigation,
            { paddingBottom: Math.max(insets.bottom, 8) },
          ]}
          accessibilityLabel="Основная навигация"
        >
          {(
            [
              { id: 'home', label: 'Главная', glyph: '⌂' },
              { id: 'catalog', label: 'Каталог', glyph: '▦' },
              { id: 'selection', label: 'Подбор', glyph: '□' },
              { id: 'account', label: 'Аккаунт', glyph: '○' },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: tab === item.id }}
              onPress={() => navigate(item.id)}
              style={s.navItem}
            >
              <Text
                style={[
                  s.navGlyph,
                  tab === item.id && s.navGlyphActive,
                  tab === 'home' && s.navGlyphLight,
                ]}
                allowFontScaling={false}
              >
                {item.glyph}
              </Text>
              <Text
                style={[
                  s.navLabel,
                  tab === item.id && s.navLabelActive,
                  tab === 'home' && s.navLabelLight,
                ]}
              >
                {item.label}
                {item.id === 'selection' && selection.items.length > 0
                  ? ` (${selection.items.length})`
                  : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
