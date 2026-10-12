import { IExchangeAdapter } from './exchange-adapter.interface';
import { AccountBalance, OrderRequest, OrderResult, Position, TradingConfig } from '../types';

export class WebhookExchange implements IExchangeAdapter {
  name = 'Webhook Bridge (3Commas / Freqtrade / Custom)';
  private webhookUrl: string;

  constructor(config: TradingConfig) {
    this.webhookUrl = config.webhookUrl || '';
  }

  async getBalance(): Promise<AccountBalance> {
    // In webhook mode, balance is managed remotely
    return {
      usdtFree: 100000,
      usdtLocked: 0,
      totalUsdtValue: 100000,
    };
  }

  async getPrice(_symbol: string): Promise<number> {
    return 0;
  }

  async executeOrder(order: OrderRequest): Promise<OrderResult> {
    const payload = {
      event: 'ENTRY_SIGNAL',
      symbol: order.symbol,
      pair: `${order.symbol}/USDT`,
      action: order.side.toLowerCase(),
      side: order.side,
      orderType: order.type,
      amount: order.amount,
      price: order.price,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      metadata: order.metadata,
      timestamp: new Date().toISOString(),
    };

    if (!this.webhookUrl) {
      console.log('[Webhook Bridge] WEBHOOK_URL not configured. Simulating payload dispatch:', JSON.stringify(payload, null, 2));
      return {
        success: true,
        orderId: `webhook-sim-${Date.now()}`,
        symbol: order.symbol,
        side: order.side,
        price: order.price || 0,
        amount: order.amount,
        timestamp: Date.now(),
      };
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}`);
      }

      return {
        success: true,
        orderId: `webhook-${Date.now()}`,
        symbol: order.symbol,
        side: order.side,
        price: order.price || 0,
        amount: order.amount,
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

  async closePosition(position: Position, exitPrice: number, reason: string): Promise<OrderResult> {
    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
    const payload = {
      event: 'EXIT_SIGNAL',
      positionId: position.id,
      symbol: position.symbol,
      pair: `${position.symbol}/USDT`,
      action: closeSide.toLowerCase(),
      side: closeSide,
      price: exitPrice,
      amount: position.amount,
      reason,
      timestamp: new Date().toISOString(),
    };

    if (this.webhookUrl) {
      try {
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        console.error('[Webhook Bridge] Error sending exit webhook:', err.message);
      }
    }

    return {
      success: true,
      orderId: `webhook-close-${Date.now()}`,
      symbol: position.symbol,
      side: closeSide,
      price: exitPrice,
      amount: position.amount,
      timestamp: Date.now(),
    };
  }
}
