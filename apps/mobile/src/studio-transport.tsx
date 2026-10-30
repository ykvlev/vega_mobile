import { WebView } from 'react-native-webview';
import { allowsStudioNavigation, studioPhase } from './studio-policy';
import type { StudioTransportProps } from './studio-transport.types';

export function StudioTransport({
  uri,
  onPhase,
  onFailure,
}: StudioTransportProps) {
  return (
    <WebView
      testID="studio-transport"
      source={{ uri }}
      style={{ flex: 1, backgroundColor: '#fff' }}
      // WebView's whitelist fallback calls Linking.openURL. Route every request
      // through our rejecting callback instead; never hand an external URL to the OS.
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={(request) =>
        allowsStudioNavigation(request.url, uri)
      }
      onNavigationStateChange={(state) => {
        if (!allowsStudioNavigation(state.url, uri)) onFailure();
      }}
      onMessage={(event) => {
        if (!allowsStudioNavigation(event.nativeEvent.url, uri)) return;
        const phase = studioPhase(event.nativeEvent.data);
        if (phase) onPhase(phase);
      }}
      onError={onFailure}
      onHttpError={onFailure}
      onContentProcessDidTerminate={onFailure}
      onRenderProcessGone={onFailure}
      onOpenWindow={() => {}}
      incognito
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      domStorageEnabled={false}
      cacheEnabled={false}
      mixedContentMode="never"
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowsInlineMediaPlayback={false}
      mediaCapturePermissionGrantType="deny"
      geolocationEnabled={false}
      allowsBackForwardNavigationGestures={false}
      allowsLinkPreview={false}
      setSupportMultipleWindows
    />
  );
}
