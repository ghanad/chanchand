import { PriceObservation, SourceConfig, TargetConfig } from '../types';

export interface FetchContext {
  source: SourceConfig;
  target: TargetConfig;
}

export interface PriceAdapter {
  name: string;
  fetch(context: FetchContext): Promise<PriceObservation>;
}
