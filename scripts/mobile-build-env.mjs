// Executed by EAS after install, before compilation. No endpoint/credential logs.
const message =
  'Задайте EXPO_PUBLIC_API_URL: доступный телефону HTTPS origin вашего demo API без пути, параметров и учётных данных. HTTP-обход должен быть выключен.';
try {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (!configured || configured.length > 2048) throw new Error(message);
  const url = new URL(configured);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    ['localhost', '127.0.0.1', '[::1]', 'example.com'].includes(url.hostname) ||
    /\.(invalid|example|localhost)$/.test(url.hostname) ||
    process.env.EXPO_PUBLIC_ALLOW_HTTP_DEMO === 'true'
  )
    throw new Error(message);
  console.log('Настройки HTTPS для тестовой native-сборки проверены.');
} catch {
  console.error(message);
  process.exitCode = 1;
}
