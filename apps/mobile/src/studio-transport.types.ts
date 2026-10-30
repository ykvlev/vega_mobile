import type { StudioPhase } from './studio-policy';

export type StudioTransportProps = {
  uri: string;
  onPhase: (phase: StudioPhase) => void;
  onFailure: () => void;
};
