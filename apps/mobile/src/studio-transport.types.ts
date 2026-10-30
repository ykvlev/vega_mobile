import type { StudioChoice } from '@vega/contracts';
import type { StudioPhase } from './studio-policy';

export type StudioTransportProps = {
  uri: string;
  onPhase: (phase: StudioPhase) => void;
  onChoice: (choice: StudioChoice) => void;
  onFailure: () => void;
};
