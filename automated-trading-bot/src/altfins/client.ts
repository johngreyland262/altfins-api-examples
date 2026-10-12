import { AltfinsSignal, AltfinsSignalsResponse, TechnicalAnalysisSetup } from '../types';

export class AltfinsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://altfins.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(endpoint: string, options?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options?.method || 'GET';

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'x-api-key': this.apiKey,
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`altFINS API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Fetch active trading signals from the altFINS signals feed
   */
  async getSignals(params: {
    symbols?: string[];
    signals?: string[];
    direction?: 'BULLISH' | 'BEARISH';
    fromDate?: string;
    toDate?: string;
  }): Promise<AltfinsSignalsResponse> {
    const body: Record<string, unknown> = {};

    if (params.symbols && params.symbols.length > 0) {
      body.symbols = params.symbols;
    }
    if (params.signals && params.signals.length > 0) {
      body.signals = params.signals;
    }
    if (params.direction) {
      body.direction = params.direction;
    }
    if (params.fromDate) {
      body.fromDate = params.fromDate;
    }
    if (params.toDate) {
      body.toDate = params.toDate;
    }

    return this.request<AltfinsSignalsResponse>('/api/v2/public/signals-feed/search-requests', {
      method: 'POST',
      body,
    });
  }

  /**
   * Fetch expert trade setups / technical analysis
   */
  async getTechnicalAnalysis(symbol?: string): Promise<{ content: TechnicalAnalysisSetup[] }> {
    const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    return this.request<{ content: TechnicalAnalysisSetup[] }>(`/api/v2/public/technical-analysis/data${query}`);
  }

  /**
   * Fetch real-time price snapshot for symbols
   */
  async getPriceSnapshot(symbols: string[]): Promise<Array<{ symbol: string; close: number; lastPrice?: number }>> {
    return this.request<Array<{ symbol: string; close: number; lastPrice?: number }>>(
      '/api/v2/public/ohlcv/snapshot-requests',
      {
        method: 'POST',
        body: { symbols },
      }
    );
  }
}
