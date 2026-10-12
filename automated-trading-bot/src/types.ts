/**
 * Type definitions for the automated trading bot
 */

export type TradeDirection = 'BULLISH' | 'BEARISH';
export type TradingMode = 'paper' | 'live' | 'webhook';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type PositionStatus = 'OPEN' | 'CLOSED';
export type CloseReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'MANUAL' | 'OPPOSITE_SIGNAL';

export interface AltfinsSignal {
  timestamp: string;
  signalKey: string;
  signalName: string;
  symbol: string;
  symbolName?: string;
  lastPrice: string | number;
  marketCap?: string | number;
  priceChange?: string | number;
  direction: 'BULLISH' | 'BEARISH';
}

export interface AltfinsSignalsResponse {
  content: AltfinsSignal[];
  totalElements: number;
}

export interface TechnicalAnalysisSetup {
  symbol: string;
  created: string;
  status?: string;
  tradeType?: 'BUY' | 'SELL';
  entryZone?: string;
  target1?: number;
  target2?: number;
  stopLoss?: number;
  pattern?: string;
  summary?: string;
}

export interface TradingConfig {
  altfinsApiKey: string;
  altfinsBaseUrl: string;
  tradingMode: TradingMode;
  exchange: string;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  binanceUseTestnet: boolean;
  webhookUrl?: string;
  symbols: string[];
  allowedDirections: 'BULLISH' | 'BEARISH' | 'BOTH';
  allowedSignals: string[];
  initialPaperBalance: number;
  positionSizeUsd: number;
  maxOpenPositions: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  trailingStopPercentage: number;
  useTrailingStop: boolean;
  pollIntervalMs: number;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  amount: number;
  positionValueUsd: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  highestPriceSeen: number;
  lowestPriceSeen: number;
  entryTimestamp: number;
  status: PositionStatus;
  signalSource: string;
  closePrice?: number;
  closeTimestamp?: number;
  closeReason?: CloseReason;
  realizedPnlUsd?: number;
  realizedPnlPercentage?: number;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  metadata?: Record<string, unknown>;
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  amount: number;
  timestamp: number;
  error?: string;
}

export interface AccountBalance {
  usdtFree: number;
  usdtLocked: number;
  totalUsdtValue: number;
}
