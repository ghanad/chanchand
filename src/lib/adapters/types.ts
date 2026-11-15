import { PriceObservation, SourceConfig, TargetConfig } from '../types';

export interface FetchContext {
  source: SourceConfig;
  target: TargetConfig;
}

/**
 * A provider response that contains prices for several products at once
 * (market/currency APIs). It is fetched once and parsed for every target that
 * shares the same source + URL.
 */
export interface SharedFetchResult {
  payload: unknown;
  statusCode?: number;
  apiUrl?: string;
}

export interface PriceAdapter {
  name: string;
  fetch(context: FetchContext): Promise<PriceObservation>;

  /**
   * Optional multi-item support. When both methods are implemented the runner
   * fetches the provider once per source/URL and parses every target from that
   * single response, so N market products cost one HTTP request.
   */
  fetchShared?(context: FetchContext): Promise<SharedFetchResult>;
  parseShared?(shared: SharedFetchResult, context: FetchContext): PriceObservation;
}
