import * as dotenv from 'dotenv';
import { TradingConfig, TradingMode } from './types';

// Load .env file
dotenv.config();

export function loadConfig(): TradingConfig {
  const parseList = (val?: string): string[] => {
    if (!val || !val.trim()) return [];
    return val.split(',').map(s => s.trim()).filter(Boolean);
  };

  const rawMode = (process.env.TRADING_MODE || 'paper').toLowerCase() as TradingMode;
  const validModes: TradingMode[] = ['paper', 'live', 'webhook'];
  const tradingMode = validModes.includes(rawMode) ? rawMode : 'paper';

  const rawDirection = (process.env.ALLOWED_DIRECTIONS || 'BULLISH').toUpperCase();
  const allowedDirections = ['BULLISH', 'BEARISH', 'BOTH'].includes(rawDirection)
    ? (rawDirection as 'BULLISH' | 'BEARISH' | 'BOTH')
    : 'BULLISH';

  return {
    altfinsApiKey: process.env.ALTFINS_API_KEY || '',
    altfinsBaseUrl: process.env.ALTFINS_BASE_URL || 'https://altfins.com',
    tradingMode,
    exchange: process.env.EXCHANGE || 'binance',
    binanceApiKey: process.env.BINANCE_API_KEY,
    binanceApiSecret: process.env.BINANCE_API_SECRET,
    binanceUseTestnet: process.env.BINANCE_USE_TESTNET === 'true',
    webhookUrl: process.env.WEBHOOK_URL,
    symbols: parseList(process.env.TRADING_SYMBOLS).length > 0
      ? parseList(process.env.TRADING_SYMBOLS)
      : ['BTC', 'ETH', 'SOL'],
    allowedDirections,
    allowedSignals: parseList(process.env.ALLOWED_SIGNALS),
    initialPaperBalance: Number(process.env.INITIAL_PAPER_BALANCE_USDT) || 10000,
    positionSizeUsd: Number(process.env.POSITION_SIZE_USD) || 500,
    maxOpenPositions: Number(process.env.MAX_OPEN_POSITIONS) || 5,
    stopLossPercentage: Number(process.env.STOP_LOSS_PERCENTAGE) || 3.0,
    takeProfitPercentage: Number(process.env.TAKE_PROFIT_PERCENTAGE) || 6.0,
    trailingStopPercentage: Number(process.env.TRAILING_STOP_PERCENTAGE) || 1.5,
    useTrailingStop: process.env.USE_TRAILING_STOP === 'true',
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 60000,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
  };
}
