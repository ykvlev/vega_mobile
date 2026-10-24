import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StartScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          VEGA
        </Text>
        <Text style={styles.label}>ТЕХНИЧЕСКИЙ СТАРТ</Text>
        <Text style={styles.description}>
          Основа мобильного приложения. Каталог, заказы и оплата ещё не
          подключены.
        </Text>
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Этап 1 — проверка запуска и сборки. Дизайн интерфейса появится на
            следующем этапе.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111111' },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 20,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -3,
  },
  label: {
    color: '#d1ffca',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
  description: { color: '#ffffff', fontSize: 20, lineHeight: 28 },
  note: { backgroundColor: '#202020', borderRadius: 24, padding: 24 },
  noteText: { color: '#c6c6c6', fontSize: 16, lineHeight: 24 },
});
