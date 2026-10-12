import * as crypto from 'crypto';
import { IExchangeAdapter } from './exchange-adapter.interface';
import { AccountBalance, OrderRequest, OrderResult, Position, TradingConfig } from '../types';

export class BinanceExchange implements IExchangeAdapter {
  name = 'Binance';
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(config: TradingConfig) {
    this.apiKey = config.binanceApiKey || '';
    this.apiSecret = config.binanceApiSecret || '';
    this.baseUrl = config.binanceUseTestnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
  }

  private sign(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    params: Record<string, string | number> = {},
    signed = false
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    const timestamp = Date.now();

    if (signed) {
      params.timestamp = timestamp;
    }

    const queryParts: string[] = [];
    for (const [key, val] of Object.entries(params)) {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
    let queryString = queryParts.join('&');

    if (signed) {
      const signature = this.sign(queryString);
      queryString += `&signature=${signature}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.apiKey) {
      headers['X-MBX-APIKEY'] = this.apiKey;
    }

    const fetchUrl = method === 'GET' ? `${url.toString()}?${queryString}` : url.toString();
    const fetchOptions: RequestInit = {
      method,
      headers,
      body: method === 'POST' ? queryString : undefined,
    };

    const response = await fetch(fetchUrl, fetchOptions);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  }

  async getPrice(symbol: string): Promise<number> {
    const market = `${symbol.toUpperCase()}USDT`;
    const res = await this.request<{ price: string }>(`/api/v3/ticker/price`, 'GET', { symbol: market });
    return parseFloat(res.price);
  }

  async getBalance(): Promise<AccountBalance> {
    const res = await this.request<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
      '/api/v3/account',
      'GET',
      {},
      true
    );

    const usdt = res.balances.find(b => b.asset === 'USDT') || { free: '0', locked: '0' };
    const free = parseFloat(usdt.free);
    const locked = parseFloat(usdt.locked);

    return {
      usdtFree: free,
      usdtLocked: locked,
      totalUsdtValue: free + locked,
    };
  }

  async executeOrder(order: OrderRequest): Promise<OrderResult> {
    const market = `${order.symbol.toUpperCase()}USDT`;
    const params: Record<string, string | number> = {
      symbol: market,
      side: order.side,
      type: 'MARKET',
      quantity: order.amount.toFixed(4),
    };

    try {
      const res = await this.request<{ orderId: number; cummulativeQuoteQty: string; executedQty: string }>(
        '/api/v3/order',
        'POST',
        params,
        true
      );

      const executedQty = parseFloat(res.executedQty);
      const quoteQty = parseFloat(res.cummulativeQuoteQty);
      const avgPrice = executedQty > 0 ? quoteQty / executedQty : order.price || 0;

      return {
        success: true,
        orderId: String(res.orderId),
        symbol: order.symbol,
        side: order.side,
        price: avgPrice,
        amount: executedQty,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return {
        success: false,
        orderId: '',
        symbol: order.symbol,
        side: order.side,
        price: order.price || 0,
        amount: order.amount,
        timestamp: Date.now(),
        error: err.message,
      };
    }
  }

  async closePosition(position: Position, exitPrice: number, _reason: string): Promise<OrderResult> {
    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
    return this.executeOrder({
      symbol: position.symbol,
      side: closeSide,
      type: 'MARKET',
      amount: position.amount,
      price: exitPrice,
    });
  }
}
