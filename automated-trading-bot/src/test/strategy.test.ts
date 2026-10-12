import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { RiskManager } from '../strategy/risk-manager';
import { StrategyEngine } from '../strategy/strategy-engine';
import { PaperExchange } from '../exchange/paper-exchange';
import { TradingConfig, Position, AltfinsSignal } from '../types';

const mockConfig: TradingConfig = {
  altfinsApiKey: 'test-api-key',
  altfinsBaseUrl: 'https://altfins.com',
  tradingMode: 'paper',
  exchange: 'paper',
  binanceUseTestnet: true,
  symbols: ['BTC', 'ETH', 'SOL'],
  allowedDirections: 'BULLISH',
  allowedSignals: [],
  initialPaperBalance: 10000,
  positionSizeUsd: 500,
  maxOpenPositions: 3,
  stopLossPercentage: 3.0,
  takeProfitPercentage: 6.0,
  trailingStopPercentage: 1.5,
  useTrailingStop: true,
  pollIntervalMs: 60000,
};

describe('RiskManager', () => {
  it('should allow opening position when conditions are met', () => {
    const riskManager = new RiskManager(mockConfig);
    const result = riskManager.canOpenPosition('BTC', [], 10000);
    assert.strictEqual(result.allowed, true);
  });

  it('should reject opening position when max open positions reached', () => {
    const riskManager = new RiskManager(mockConfig);
    const mockPositions: Position[] = [
      { id: '1', symbol: 'BTC', side: 'BUY', entryPrice: 50000, amount: 0.01, positionValueUsd: 500, stopLossPrice: 48500, takeProfitPrice: 53000, highestPriceSeen: 50000, lowestPriceSeen: 50000, entryTimestamp: Date.now(), status: 'OPEN', signalSource: 'test' },
      { id: '2', symbol: 'ETH', side: 'BUY', entryPrice: 3000, amount: 0.16, positionValueUsd: 500, stopLossPrice: 2910, takeProfitPrice: 3180, highestPriceSeen: 3000, lowestPriceSeen: 3000, entryTimestamp: Date.now(), status: 'OPEN', signalSource: 'test' },
      { id: '3', symbol: 'SOL', side: 'BUY', entryPrice: 150, amount: 3.3, positionValueUsd: 500, stopLossPrice: 145.5, takeProfitPrice: 159, highestPriceSeen: 150, lowestPriceSeen: 150, entryTimestamp: Date.now(), status: 'OPEN', signalSource: 'test' },
    ];

    const result = riskManager.canOpenPosition('ADA', mockPositions, 5000);
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Max open positions reached/);
  });

  it('should reject opening duplicate position for the same symbol', () => {
    const riskManager = new RiskManager(mockConfig);
    const mockPositions: Position[] = [
      { id: '1', symbol: 'BTC', side: 'BUY', entryPrice: 50000, amount: 0.01, positionValueUsd: 500, stopLossPrice: 48500, takeProfitPrice: 53000, highestPriceSeen: 50000, lowestPriceSeen: 50000, entryTimestamp: Date.now(), status: 'OPEN', signalSource: 'test' },
    ];

    const result = riskManager.canOpenPosition('BTC', mockPositions, 5000);
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Position already open/);
  });

  it('should reject when balance is insufficient', () => {
    const riskManager = new RiskManager(mockConfig);
    const result = riskManager.canOpenPosition('BTC', [], 200); // position size is $500
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /Insufficient balance/);
  });

  it('should calculate stop-loss and take-profit correctly for BUY', () => {
    const riskManager = new RiskManager(mockConfig);
    const { stopLossPrice, takeProfitPrice } = riskManager.calculateRiskLevels(100, 'BUY');
    assert.strictEqual(stopLossPrice, 97); // 3% stop loss
    assert.strictEqual(takeProfitPrice, 106); // 6% take profit
  });

  it('should trigger take profit exit when price reaches target', () => {
    const riskManager = new RiskManager(mockConfig);
    const position: Position = {
      id: '1',
      symbol: 'BTC',
      side: 'BUY',
      entryPrice: 100,
      amount: 5,
      positionValueUsd: 500,
      stopLossPrice: 97,
      takeProfitPrice: 106,
      highestPriceSeen: 100,
      lowestPriceSeen: 100,
      entryTimestamp: Date.now(),
      status: 'OPEN',
      signalSource: 'test',
    };

    const evalResult = riskManager.evaluateExit(position, 106.5);
    assert.strictEqual(evalResult.shouldClose, true);
    assert.strictEqual(evalResult.reason, 'TAKE_PROFIT');
  });

  it('should trigger stop loss exit when price drops below stopLossPrice', () => {
    const riskManager = new RiskManager(mockConfig);
    const position: Position = {
      id: '1',
      symbol: 'BTC',
      side: 'BUY',
      entryPrice: 100,
      amount: 5,
      positionValueUsd: 500,
      stopLossPrice: 97,
      takeProfitPrice: 106,
      highestPriceSeen: 100,
      lowestPriceSeen: 100,
      entryTimestamp: Date.now(),
      status: 'OPEN',
      signalSource: 'test',
    };

    const evalResult = riskManager.evaluateExit(position, 96.5);
    assert.strictEqual(evalResult.shouldClose, true);
    assert.strictEqual(evalResult.reason, 'STOP_LOSS');
  });
});

describe('StrategyEngine', () => {
  it('should approve valid bullish signal for configured symbol', () => {
    const riskManager = new RiskManager(mockConfig);
    const engine = new StrategyEngine(mockConfig, riskManager);

    const signal: AltfinsSignal = {
      timestamp: new Date().toISOString(),
      signalKey: 'FRESH_MOMENTUM_MACD_SIGNAL_LINE_CROSSOVER.TXT',
      signalName: 'MACD Bullish Crossover',
      symbol: 'BTC',
      lastPrice: '65000',
      direction: 'BULLISH',
    };

    const intent = engine.evaluateSignal(signal, [], 10000);
    assert.strictEqual(intent.shouldTrade, true);
    assert.ok(intent.order);
    assert.strictEqual(intent.order?.side, 'BUY');
    assert.strictEqual(intent.order?.symbol, 'BTC');
    assert.strictEqual(intent.order?.price, 65000);
  });

  it('should reject signal for non-configured symbol', () => {
    const riskManager = new RiskManager(mockConfig);
    const engine = new StrategyEngine(mockConfig, riskManager);

    const signal: AltfinsSignal = {
      timestamp: new Date().toISOString(),
      signalKey: 'TEST_KEY',
      signalName: 'Test Signal',
      symbol: 'DOGE', // Not in ['BTC', 'ETH', 'SOL']
      lastPrice: '0.15',
      direction: 'BULLISH',
    };

    const intent = engine.evaluateSignal(signal, [], 10000);
    assert.strictEqual(intent.shouldTrade, false);
    assert.match(intent.rejectReason || '', /not in configured list/);
  });

  it('should reject bearish signal when allowedDirections is BULLISH', () => {
    const riskManager = new RiskManager(mockConfig);
    const engine = new StrategyEngine(mockConfig, riskManager);

    const signal: AltfinsSignal = {
      timestamp: new Date().toISOString(),
      signalKey: 'TEST_KEY',
      signalName: 'Test Signal',
      symbol: 'BTC',
      lastPrice: '65000',
      direction: 'BEARISH',
    };

    const intent = engine.evaluateSignal(signal, [], 10000);
    assert.strictEqual(intent.shouldTrade, false);
    assert.match(intent.rejectReason || '', /Direction BEARISH not allowed/);
  });
});

describe('PaperExchange', () => {
  it('should execute paper order and update balance and positions', async () => {
    const exchange = new PaperExchange(mockConfig);

    const initialBal = await exchange.getBalance();
    assert.strictEqual(initialBal.usdtFree, 10000);

    const orderRes = await exchange.executeOrder({
      symbol: 'BTC',
      side: 'BUY',
      type: 'MARKET',
      amount: 0.01,
      price: 50000,
    });

    assert.strictEqual(orderRes.success, true);
    assert.strictEqual(exchange.getOpenPositions().length, 1);

    const postBal = await exchange.getBalance();
    assert.strictEqual(postBal.usdtFree, 9500); // 10000 - (0.01 * 50000)
    assert.strictEqual(postBal.usdtLocked, 500);

    const pos = exchange.getOpenPositions()[0];
    const closeRes = await exchange.closePosition(pos, 53000, 'TAKE_PROFIT');
    assert.strictEqual(closeRes.success, true);

    const finalBal = await exchange.getBalance();
    // Profit = (53000 - 50000) * 0.01 = 30 USDT. New balance = 10030
    assert.strictEqual(finalBal.usdtFree, 10030);
    assert.strictEqual(finalBal.usdtLocked, 0);
    assert.strictEqual(exchange.getOpenPositions().length, 0);
    assert.strictEqual(exchange.getClosedPositions().length, 1);
  });
});
