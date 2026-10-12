import { AltfinsClient } from './altfins/client';
import { SignalsService } from './altfins/signals-service';
import { StrategyEngine } from './strategy/strategy-engine';
import { RiskManager } from './strategy/risk-manager';
import { IExchangeAdapter } from './exchange/exchange-adapter.interface';
import { PaperExchange } from './exchange/paper-exchange';
import { BinanceExchange } from './exchange/binance-exchange';
import { WebhookExchange } from './exchange/webhook-exchange';
import { TelegramNotifier } from './notifications/telegram-notifier';
import { TradingConfig, Position } from './types';

export class TradingBot {
  private config: TradingConfig;
  private altfinsClient: AltfinsClient;
  private signalsService: SignalsService;
  private riskManager: RiskManager;
  private strategyEngine: StrategyEngine;
  private exchange: IExchangeAdapter;
  private notifier: TelegramNotifier;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private activePositions: Map<string, Position> = new Map();

  constructor(config: TradingConfig) {
    this.config = config;

    this.altfinsClient = new AltfinsClient(config.altfinsApiKey, config.altfinsBaseUrl);
    this.signalsService = new SignalsService(this.altfinsClient, config);
    this.riskManager = new RiskManager(config);
    this.strategyEngine = new StrategyEngine(config, this.riskManager);

    // Initialize exchange adapter
    if (config.tradingMode === 'live') {
      this.exchange = new BinanceExchange(config);
    } else if (config.tradingMode === 'webhook') {
      this.exchange = new WebhookExchange(config);
    } else {
      this.exchange = new PaperExchange(config);
    }

    this.notifier = new TelegramNotifier(config.telegramBotToken, config.telegramChatId);
  }

  getExchange(): IExchangeAdapter {
    return this.exchange;
  }

  getActivePositions(): Position[] {
    return Array.from(this.activePositions.values());
  }

  /**
   * Run one evaluation cycle (tick)
   */
  async tick(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] --- Running Bot Evaluation Cycle ---`);

    try {
      // 1. Get Account Balance
      const balance = await this.exchange.getBalance();
      console.log(`[Account] Balance: $${balance.usdtFree.toFixed(2)} USDT free, $${balance.usdtLocked.toFixed(2)} USDT in positions`);

      // 2. Monitor open positions & evaluate exit rules (Stop-loss / Take-profit)
      await this.checkOpenPositions();

      // 3. Fetch new signals from altFINS
      if (!this.config.altfinsApiKey) {
        console.log('[altFINS] ALTFINS_API_KEY is not set. In demo mode, waiting for configuration or mock signals.');
        return;
      }

      console.log(`[altFINS] Querying signals for symbols: [${this.config.symbols.join(', ')}], direction: ${this.config.allowedDirections}...`);
      const signals = await this.signalsService.fetchNewSignals();
      console.log(`[altFINS] Retrieved ${signals.length} new signals`);

      // 4. Process incoming signals
      for (const signal of signals) {
        console.log(`\n[Signal Received] ${signal.symbol} | ${signal.signalName} (${signal.signalKey}) | Direction: ${signal.direction} | Price: $${signal.lastPrice}`);

        const currentPositions = this.getActivePositions();
        const tradeIntent = this.strategyEngine.evaluateSignal(signal, currentPositions, balance.usdtFree);

        if (!tradeIntent.shouldTrade || !tradeIntent.order) {
          console.log(`[Strategy] Signal rejected: ${tradeIntent.rejectReason}`);
          continue;
        }

        console.log(`[Strategy] Signal approved! Placing ${tradeIntent.order.side} order for ${tradeIntent.order.amount.toFixed(4)} ${signal.symbol} at ~$${tradeIntent.order.price}...`);

        const orderResult = await this.exchange.executeOrder(tradeIntent.order);
        if (orderResult.success) {
          console.log(`[Order Success] Order executed ID: ${orderResult.orderId}`);

          const newPosition: Position = {
            id: orderResult.orderId,
            symbol: tradeIntent.order.symbol,
            side: tradeIntent.order.side,
            entryPrice: orderResult.price,
            amount: orderResult.amount,
            positionValueUsd: orderResult.price * orderResult.amount,
            stopLossPrice: tradeIntent.order.stopLoss || 0,
            takeProfitPrice: tradeIntent.order.takeProfit || 0,
            highestPriceSeen: orderResult.price,
            lowestPriceSeen: orderResult.price,
            entryTimestamp: orderResult.timestamp,
            status: 'OPEN',
            signalSource: signal.signalName,
          };

          this.activePositions.set(newPosition.id, newPosition);

          await this.notifier.notifyTradeEntry(
            newPosition.symbol,
            newPosition.side,
            newPosition.entryPrice,
            newPosition.amount,
            orderResult,
            signal.signalName
          );
        } else {
          console.error(`[Order Failed] Error: ${orderResult.error}`);
        }
      }

      console.log(`[Status] Active open positions: ${this.activePositions.size}`);
    } catch (err: any) {
      console.error(`[Bot Error] Cycle execution failed: ${err.message}`);
    }
  }

  /**
   * Check all active positions against current prices for stop-loss and take-profit
   */
  private async checkOpenPositions(): Promise<void> {
    if (this.activePositions.size === 0) return;

    const symbols = Array.from(new Set(Array.from(this.activePositions.values()).map(p => p.symbol)));
    let prices: Record<string, number> = {};

    try {
      if (this.config.altfinsApiKey) {
        const snapshots = await this.altfinsClient.getPriceSnapshot(symbols);
        for (const snap of snapshots) {
          prices[snap.symbol.toUpperCase()] = snap.close || snap.lastPrice || 0;
        }
      }
    } catch (err: any) {
      console.warn(`[Price Check] Failed to fetch price snapshots: ${err.message}`);
    }

    for (const [id, position] of Array.from(this.activePositions.entries())) {
      const currentPrice = prices[position.symbol.toUpperCase()] || position.entryPrice;
      const evaluation = this.riskManager.evaluateExit(position, currentPrice);

      if (evaluation.shouldClose && evaluation.exitPrice && evaluation.reason) {
        console.log(`\n[Exit Triggered] Closing position ${position.id} (${position.symbol}) due to ${evaluation.reason} at $${evaluation.exitPrice}`);

        const result = await this.exchange.closePosition(position, evaluation.exitPrice, evaluation.reason);
        if (result.success) {
          this.activePositions.delete(id);
          await this.notifier.notifyTradeExit(position, evaluation.exitPrice, evaluation.reason);
          console.log(`[Position Closed] ${position.symbol} closed. Reason: ${evaluation.reason}`);
        }
      }
    }
  }

  /**
   * Start the automated bot polling loop
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('================================================================');
    console.log('🤖 altFINS Automated Trading Bot Initialized');
    console.log('================================================================');
    console.log(`Mode:            ${this.config.tradingMode.toUpperCase()}`);
    console.log(`Exchange:        ${this.exchange.name}`);
    console.log(`Assets:          ${this.config.symbols.join(', ')}`);
    console.log(`Directions:      ${this.config.allowedDirections}`);
    console.log(`Position Size:   $${this.config.positionSizeUsd} USDT`);
    console.log(`Stop Loss:       ${this.config.stopLossPercentage}%`);
    console.log(`Take Profit:     ${this.config.takeProfitPercentage}%`);
    console.log(`Trailing Stop:   ${this.config.useTrailingStop ? `${this.config.trailingStopPercentage}%` : 'Disabled'}`);
    console.log(`Poll Interval:   ${this.config.pollIntervalMs / 1000}s`);
    console.log('================================================================\n');

    // Run first tick immediately
    await this.tick();

    // Schedule regular ticks
    this.timer = setInterval(() => {
      this.tick().catch(err => console.error('[Tick Error]', err));
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the automated bot
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('\n🛑 altFINS Automated Trading Bot Stopped.');
  }
}
