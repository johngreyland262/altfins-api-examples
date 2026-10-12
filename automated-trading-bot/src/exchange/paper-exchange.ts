import { IExchangeAdapter } from './exchange-adapter.interface';
import { AccountBalance, OrderRequest, OrderResult, Position, TradingConfig } from '../types';

export class PaperExchange implements IExchangeAdapter {
  name = 'Paper Trading (Simulation)';
  private usdtFree: number;
  private usdtLocked = 0;
  private openPositions: Map<string, Position> = new Map();
  private closedPositions: Position[] = [];
  private orderCounter = 1;

  constructor(config: TradingConfig) {
    this.usdtFree = config.initialPaperBalance;
  }

  async getBalance(): Promise<AccountBalance> {
    return {
      usdtFree: this.usdtFree,
      usdtLocked: this.usdtLocked,
      totalUsdtValue: this.usdtFree + this.usdtLocked,
    };
  }

  async getPrice(_symbol: string): Promise<number> {
    // In paper trading, price is provided via order request or altfins snapshot
    return 0;
  }

  async executeOrder(order: OrderRequest): Promise<OrderResult> {
    const price = order.price || 0;
    const orderCost = order.amount * price;

    if (orderCost > this.usdtFree) {
      return {
        success: false,
        orderId: `paper-${Date.now()}`,
        symbol: order.symbol,
        side: order.side,
        price,
        amount: order.amount,
        timestamp: Date.now(),
        error: `Insufficient virtual balance: required $${orderCost.toFixed(2)}, free $${this.usdtFree.toFixed(2)}`,
      };
    }

    // Deduct cost from free balance and lock in position
    this.usdtFree -= orderCost;
    this.usdtLocked += orderCost;

    const positionId = `pos-${order.symbol}-${this.orderCounter++}`;
    const position: Position = {
      id: positionId,
      symbol: order.symbol,
      side: order.side,
      entryPrice: price,
      amount: order.amount,
      positionValueUsd: orderCost,
      stopLossPrice: order.stopLoss || 0,
      takeProfitPrice: order.takeProfit || 0,
      highestPriceSeen: price,
      lowestPriceSeen: price,
      entryTimestamp: Date.now(),
      status: 'OPEN',
      signalSource: (order.metadata?.signalKey as string) || 'altFINS',
    };

    this.openPositions.set(position.id, position);

    return {
      success: true,
      orderId: positionId,
      symbol: order.symbol,
      side: order.side,
      price,
      amount: order.amount,
      timestamp: Date.now(),
    };
  }

  async closePosition(position: Position, exitPrice: number, reason: string): Promise<OrderResult> {
    const existing = this.openPositions.get(position.id);
    if (!existing) {
      return {
        success: false,
        orderId: `close-${position.id}`,
        symbol: position.symbol,
        side: position.side === 'BUY' ? 'SELL' : 'BUY',
        price: exitPrice,
        amount: position.amount,
        timestamp: Date.now(),
        error: `Position ${position.id} not found in open positions`,
      };
    }

    const entryPrice = existing.entryPrice;
    const amount = existing.amount;

    // Calculate PnL
    const pnlUsd = existing.side === 'BUY'
      ? (exitPrice - entryPrice) * amount
      : (entryPrice - exitPrice) * amount;

    const pnlPercentage = existing.side === 'BUY'
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;

    // Return locked funds + PnL back to free balance
    this.usdtLocked -= existing.positionValueUsd;
    this.usdtFree += existing.positionValueUsd + pnlUsd;

    existing.status = 'CLOSED';
    existing.closePrice = exitPrice;
    existing.closeTimestamp = Date.now();
    existing.closeReason = reason as any;
    existing.realizedPnlUsd = pnlUsd;
    existing.realizedPnlPercentage = pnlPercentage;

    this.openPositions.delete(position.id);
    this.closedPositions.push(existing);

    return {
      success: true,
      orderId: `close-${position.id}`,
      symbol: position.symbol,
      side: position.side === 'BUY' ? 'SELL' : 'BUY',
      price: exitPrice,
      amount: position.amount,
      timestamp: Date.now(),
    };
  }

  getOpenPositions(): Position[] {
    return Array.from(this.openPositions.values());
  }

  getClosedPositions(): Position[] {
    return [...this.closedPositions];
  }
}
