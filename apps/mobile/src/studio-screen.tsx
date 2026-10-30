import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { studioUrl, studioChoiceUrl, type StudioPhase } from './studio-policy';
import { StudioTransport } from './studio-transport';
import type { StudioChoice } from '@vega/contracts';
import type { useStudioChoice } from './studio-choice';
import { palette } from './mobile-styles';

declare const __DEV__: boolean;

export function StudioScreen({
  back,
  catalog,
  saved,
}: {
  back: () => void;
  catalog: () => void;
  saved: ReturnType<typeof useStudioChoice>;
}) {
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<StudioPhase>('loading');
  const initial = useRef<StudioChoice | null>(null);
  if (saved.ready && !initial.current) initial.current = saved.choice;
  const entry = studioUrl({
    configured: process.env.EXPO_PUBLIC_STUDIO_URL,
    platform: Platform.OS,
    development: typeof __DEV__ !== 'undefined' && __DEV__,
    appOrigin:
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : undefined,
    apiOrigin: process.env.EXPO_PUBLIC_API_URL,
  });
  const uri =
    entry && initial.current ? studioChoiceUrl(entry, initial.current) : null;
  const receiveChoice = useCallback(
    (next: StudioChoice) => {
      void saved.save(next);
    },
    [saved.save],
  );
  const failure = useCallback(() => setPhase('failed'), []);
  const receive = useCallback((next: StudioPhase) => {
    setPhase((current) => (current === 'failed' ? current : next));
  }, []);
  useEffect(() => {
    if (!uri || phase !== 'loading') return;
    const timeout = setTimeout(failure, 30000);
    return () => clearTimeout(timeout);
  }, [uri, phase, attempt, failure]);
  const failed = saved.ready && (!uri || phase === 'failed');
  return (
    <View testID="studio-screen" style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть 3D-студию"
          onPress={back}
          style={s.button}
        >
          <Text style={s.action}>← Назад</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>
          3D-студия
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="В каталог из 3D"
          onPress={catalog}
          style={s.button}
        >
          <Text style={s.action}>Каталог</Text>
        </Pressable>
      </View>
      <View style={s.stage}>
        {failed ? (
          <View style={s.notice}>
            <Text accessibilityRole="alert" style={s.copy}>
              3D сейчас недоступно. Вы можете продолжить выбирать плёнку в
              каталоге.
            </Text>
            {!!uri && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  initial.current = saved.choice;
                  setPhase('loading');
                  setAttempt((value) => value + 1);
                }}
                style={s.retry}
              >
                <Text style={s.retryText}>Повторить загрузку 3D</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {uri && (
              <StudioTransport
                key={attempt}
                uri={uri}
                onPhase={receive}
                onChoice={receiveChoice}
                onFailure={failure}
              />
            )}
            {phase === 'loading' && (
              <View
                style={[s.notice, s.loading]}
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator color={palette.ink} />
                <Text style={s.copy}>Загружаем 3D-студию</Text>
              </View>
            )}
          </>
        )}
      </View>
      {saved.error && (
        <View style={s.storageNotice}>
          <Text accessibilityRole="alert" style={s.disclaimer}>
            Не удалось восстановить или сохранить выбор на устройстве. Текущий
            цвет остаётся доступен в приложении.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить сохранение выбора"
            onPress={() => {
              void saved.save(saved.choice);
            }}
            style={s.button}
          >
            <Text style={s.action}>Повторить сохранение выбора</Text>
          </Pressable>
        </View>
      )}
      <Text style={s.disclaimer}>
        Демонстрационные цвета. Для выбора плёнки нужен реальный образец.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, minWidth: 0, backgroundColor: palette.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  title: { color: palette.ink, fontSize: 13, textTransform: 'uppercase' },
  button: {
    minHeight: 44,
    minWidth: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  action: { color: palette.ink, fontSize: 12 },
  stage: { flex: 1, minHeight: 0 },
  notice: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 20,
    backgroundColor: palette.paper,
  },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  copy: {
    fontSize: 14,
    lineHeight: 22,
    color: palette.ink,
    textAlign: 'center',
  },
  retry: {
    backgroundColor: palette.ink,
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  retryText: { color: palette.paper, fontSize: 12, textTransform: 'uppercase' },
  storageNotice: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    alignItems: 'center',
  },
  disclaimer: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'center',
  },
});
