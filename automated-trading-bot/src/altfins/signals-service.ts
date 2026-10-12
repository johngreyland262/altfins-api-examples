import { AltfinsClient } from './client';
import { AltfinsSignal, TradingConfig } from '../types';

export class SignalsService {
  private client: AltfinsClient;
  private config: TradingConfig;
  private lastCheckedTimestamp: number;
  private seenSignalIds: Set<string> = new Set();

  constructor(client: AltfinsClient, config: TradingConfig) {
    this.client = client;
    this.config = config;
    // Look back 15 minutes on first check, or from now
    this.lastCheckedTimestamp = Date.now() - 15 * 60 * 1000;
  }

  /**
   * Fetch new signals matching configured filters since the last check
   */
  async fetchNewSignals(): Promise<AltfinsSignal[]> {
    const fromDate = new Date(this.lastCheckedTimestamp).toISOString();
    const toDate = new Date().toISOString();

    const direction = this.config.allowedDirections === 'BOTH'
      ? undefined
      : this.config.allowedDirections;

    const response = await this.client.getSignals({
      symbols: this.config.symbols,
      signals: this.config.allowedSignals.length > 0 ? this.config.allowedSignals : undefined,
      direction,
      fromDate,
      toDate,
    });

    if (!response || !response.content || response.content.length === 0) {
      return [];
    }

    const newSignals: AltfinsSignal[] = [];

    for (const signal of response.content) {
      const signalTime = new Date(signal.timestamp).getTime();
      // Generate a deduplication key
      const dedupeKey = `${signal.symbol}_${signal.signalKey}_${signal.timestamp}`;

      if (signalTime > this.lastCheckedTimestamp && !this.seenSignalIds.has(dedupeKey)) {
        this.seenSignalIds.add(dedupeKey);
        newSignals.push(signal);
      }
    }

    // Keep set bounded to prevent memory growth
    if (this.seenSignalIds.size > 2000) {
      this.seenSignalIds.clear();
    }

    this.lastCheckedTimestamp = Date.now();
    return newSignals;
  }
}
