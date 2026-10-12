import { Position, TradingConfig, OrderSide, CloseReason } from '../types';

export interface ExitEvaluation {
  shouldClose: boolean;
  reason?: CloseReason;
  exitPrice?: number;
}

export class RiskManager {
  private config: TradingConfig;

  constructor(config: TradingConfig) {
    this.config = config;
  }

  /**
   * Determine if opening a new position is allowed
   */
  canOpenPosition(symbol: string, currentOpenPositions: Position[], freeBalanceUsd: number): { allowed: boolean; reason?: string } {
    if (currentOpenPositions.length >= this.config.maxOpenPositions) {
      return { allowed: false, reason: `Max open positions reached (${this.config.maxOpenPositions})` };
    }

    const alreadyOpen = currentOpenPositions.some(
      p => p.symbol.toUpperCase() === symbol.toUpperCase() && p.status === 'OPEN'
    );
    if (alreadyOpen) {
      return { allowed: false, reason: `Position already open for ${symbol}` };
    }

    if (freeBalanceUsd < this.config.positionSizeUsd) {
      return { allowed: false, reason: `Insufficient balance ($${freeBalanceUsd.toFixed(2)} < $${this.config.positionSizeUsd})` };
    }

    return { allowed: true };
  }

  /**
   * Calculate stop-loss and take-profit prices for an entry
   */
  calculateRiskLevels(entryPrice: number, side: OrderSide): { stopLossPrice: number; takeProfitPrice: number } {
    if (side === 'BUY') {
      const stopLossPrice = entryPrice * (1 - this.config.stopLossPercentage / 100);
      const takeProfitPrice = entryPrice * (1 + this.config.takeProfitPercentage / 100);
      return { stopLossPrice, takeProfitPrice };
    } else {
      const stopLossPrice = entryPrice * (1 + this.config.stopLossPercentage / 100);
      const takeProfitPrice = entryPrice * (1 - this.config.takeProfitPercentage / 100);
      return { stopLossPrice, takeProfitPrice };
    }
  }

  /**
   * Calculate order amount in coins based on position size USD and current price
   */
  calculateOrderAmount(entryPrice: number): number {
    if (entryPrice <= 0) return 0;
    return this.config.positionSizeUsd / entryPrice;
  }

  /**
   * Update trailing stop and evaluate if an active position should be closed
   */
  evaluateExit(position: Position, currentPrice: number): ExitEvaluation {
    if (position.status !== 'OPEN') {
      return { shouldClose: false };
    }

    if (position.side === 'BUY') {
      // Update highest price seen
      if (currentPrice > position.highestPriceSeen) {
        position.highestPriceSeen = currentPrice;

        // If trailing stop is enabled, trail the stop loss upward
        if (this.config.useTrailingStop) {
          const trailingStop = currentPrice * (1 - this.config.trailingStopPercentage / 100);
          if (trailingStop > position.stopLossPrice) {
            position.stopLossPrice = trailingStop;
          }
        }
      }

      // Check Take Profit
      if (currentPrice >= position.takeProfitPrice) {
        return { shouldClose: true, reason: 'TAKE_PROFIT', exitPrice: currentPrice };
      }

      // Check Stop Loss (including trailing stop)
      if (currentPrice <= position.stopLossPrice) {
        return {
          shouldClose: true,
          reason: this.config.useTrailingStop && position.stopLossPrice > position.entryPrice
            ? 'TRAILING_STOP'
            : 'STOP_LOSS',
          exitPrice: currentPrice,
        };
      }
    } else {
      // SELL / SHORT side
      if (currentPrice < position.lowestPriceSeen) {
        position.lowestPriceSeen = currentPrice;

        if (this.config.useTrailingStop) {
          const trailingStop = currentPrice * (1 + this.config.trailingStopPercentage / 100);
          if (trailingStop < position.stopLossPrice) {
            position.stopLossPrice = trailingStop;
          }
        }
      }

      if (currentPrice <= position.takeProfitPrice) {
        return { shouldClose: true, reason: 'TAKE_PROFIT', exitPrice: currentPrice };
      }

      if (currentPrice >= position.stopLossPrice) {
        return {
          shouldClose: true,
          reason: this.config.useTrailingStop && position.stopLossPrice < position.entryPrice
            ? 'TRAILING_STOP'
            : 'STOP_LOSS',
          exitPrice: currentPrice,
        };
      }
    }

    return { shouldClose: false };
  }
}
