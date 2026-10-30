import { useEffect, useRef } from 'react';
import { studioPhase, studioChoiceMessage } from './studio-policy';
import type { StudioTransportProps } from './studio-transport.types';

export function StudioTransport({
  uri,
  onPhase,
  onChoice,
  onFailure,
}: StudioTransportProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const target = frame.current;
    if (!target) return;
    const origin = new URL(uri).origin;
    const receive = (event: MessageEvent) => {
      if (event.source !== target.contentWindow || event.origin !== origin)
        return;
      const phase = studioPhase(event.data);
      if (phase) onPhase(phase);
      const choice = studioChoiceMessage(event.data);
      if (choice) onChoice(choice);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [uri, onPhase, onChoice]);
  return (
    <iframe
      ref={frame}
      title="3D-студия VEGA"
      src={uri}
      // Chromium can omit ambient credentials; other engines retain the
      // separate-origin + sandbox boundary. Set before the initial request.
      {...{ credentialless: true }}
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      onError={onFailure}
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        border: 0,
        minHeight: 0,
      }}
    />
  );
}
