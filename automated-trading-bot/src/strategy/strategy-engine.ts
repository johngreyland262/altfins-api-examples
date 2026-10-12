import { AltfinsSignal, OrderRequest, OrderSide, Position, TradingConfig } from '../types';
import { RiskManager } from './risk-manager';

export interface TradeIntent {
  shouldTrade: boolean;
  rejectReason?: string;
  order?: OrderRequest;
  signal?: AltfinsSignal;
}

export class StrategyEngine {
  private config: TradingConfig;
  private riskManager: RiskManager;

  constructor(config: TradingConfig, riskManager: RiskManager) {
    this.config = config;
    this.riskManager = riskManager;
  }

  /**
   * Evaluate an incoming altFINS signal and determine if a trade should be opened
   */
  evaluateSignal(signal: AltfinsSignal, currentPositions: Position[], freeBalanceUsd: number): TradeIntent {
    const symbol = signal.symbol.toUpperCase();
    const lastPrice = typeof signal.lastPrice === 'string' ? parseFloat(signal.lastPrice) : signal.lastPrice;

    if (!lastPrice || isNaN(lastPrice) || lastPrice <= 0) {
      return { shouldTrade: false, rejectReason: `Invalid price for ${symbol}: ${signal.lastPrice}` };
    }

    // Filter by allowed symbols if configured
    if (this.config.symbols.length > 0) {
      const allowed = this.config.symbols.map(s => s.toUpperCase());
      if (!allowed.includes(symbol)) {
        return { shouldTrade: false, rejectReason: `Symbol ${symbol} not in configured list` };
      }
    }

    // Filter by allowed direction
    if (this.config.allowedDirections !== 'BOTH' && signal.direction !== this.config.allowedDirections) {
      return { shouldTrade: false, rejectReason: `Direction ${signal.direction} not allowed (configured: ${this.config.allowedDirections})` };
    }

    // Filter by allowed signal keys if configured
    if (this.config.allowedSignals.length > 0) {
      const isAllowedKey = this.config.allowedSignals.some(
        key => signal.signalKey.toLowerCase().includes(key.toLowerCase())
      );
      if (!isAllowedKey) {
        return { shouldTrade: false, rejectReason: `Signal key ${signal.signalKey} not in allowed signals list` };
      }
    }

    // Validate risk manager rules
    const riskCheck = this.riskManager.canOpenPosition(symbol, currentPositions, freeBalanceUsd);
    if (!riskCheck.allowed) {
      return { shouldTrade: false, rejectReason: riskCheck.reason };
    }

    // Map altFINS direction to order side
    const side: OrderSide = signal.direction === 'BULLISH' ? 'BUY' : 'SELL';
    const amount = this.riskManager.calculateOrderAmount(lastPrice);
    const { stopLossPrice, takeProfitPrice } = this.riskManager.calculateRiskLevels(lastPrice, side);

    const order: OrderRequest = {
      symbol,
      side,
      type: 'MARKET',
      amount,
      price: lastPrice,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      metadata: {
        signalKey: signal.signalKey,
        signalName: signal.signalName,
        direction: signal.direction,
        timestamp: signal.timestamp,
      },
    };

    return {
      shouldTrade: true,
      order,
      signal,
    };
  }
}
