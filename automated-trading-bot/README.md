# altFINS Automated Trading Bot

An automated cryptocurrency trading bot that monitors real-time trading signals and technical analysis from the **altFINS Public API v2** and executes trades automatically using configurable risk management strategies.

The bot supports **Paper Trading (simulation)** out of the box, **Live Exchange Execution** (e.g. Binance), and **Webhook Bridging** (e.g. 3Commas, Freqtrade, or custom trading engines).

---

## Features

- **altFINS Signal Ingestion**: Polls the altFINS Public API v2 Signals Feed (`/api/v2/public/signals-feed/search-requests`), filtering by asset symbols, signal keys, and direction (`BULLISH` / `BEARISH`).
- **Paper Trading Engine**: Built-in simulated exchange that tracks virtual balances, entry prices, open positions, realized/unrealized PnL, and trade histories without risking real capital.
- **Live Exchange Execution**: Native Binance Spot integration with HMAC-SHA256 authenticated order execution.
- **Webhook Bridge**: Forward trading events directly to external platforms such as Freqtrade, 3Commas, TradingView, or custom webhook endpoints.
- **Automated Risk Management**:
  - Configurable position sizing in USD per trade.
  - Automatic Take-Profit (TP) and Stop-Loss (SL) calculation.
  - Optional Trailing Stop-Loss to lock in profits as prices rise.
  - Maximum concurrent open positions limit.
  - Duplicate symbol protection (avoids entering multiple overlapping positions on the same coin).
- **Telegram Notifications**: Real-time alerts for trade entries, exits, take-profit triggers, and stop-loss hits.

---

## Prerequisites

- **Node.js** (v18.0.0 or higher)
- **altFINS API Key**: [Get your API key on the altFINS platform](https://altfins.com)
- *(Optional for Live Trading)*: Binance API Key and Secret
- *(Optional for Notifications)*: Telegram Bot Token and Chat ID

---

## Installation

1. Navigate to the `automated-trading-bot` directory:
   ```bash
   cd automated-trading-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` configuration file:
   ```bash
   cp .env.example .env
   ```

---

## Configuration

Edit the `.env` file with your settings:

```dotenv
# altFINS API Key (Required)
ALTFINS_API_KEY=your_altfins_api_key_here
ALTFINS_BASE_URL=https://altfins.com

# Trading Mode: 'paper' (default), 'live', or 'webhook'
TRADING_MODE=paper

# Monitored Symbols (comma-separated)
TRADING_SYMBOLS=BTC,ETH,SOL,BNB,XRP

# Allowed Signal Direction: BULLISH, BEARISH, or BOTH
ALLOWED_DIRECTIONS=BULLISH

# Specific altFINS Signal Keys (optional; leave empty to monitor all)
# Example: FRESH_MOMENTUM_MACD_SIGNAL_LINE_CROSSOVER.TXT,SIGNALS_SUMMARY_SMA_50_200.TXT
ALLOWED_SIGNALS=

# Risk Management
INITIAL_PAPER_BALANCE_USDT=10000
POSITION_SIZE_USD=500
MAX_OPEN_POSITIONS=5
STOP_LOSS_PERCENTAGE=3.0
TAKE_PROFIT_PERCENTAGE=6.0
USE_TRAILING_STOP=true
TRAILING_STOP_PERCENTAGE=1.5

# Polling Interval in milliseconds (60000 = 1 minute)
POLL_INTERVAL_MS=60000

# Optional: Binance credentials for TRADING_MODE=live
BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_USE_TESTNET=true

# Optional: Webhook URL for TRADING_MODE=webhook (Freqtrade / 3Commas)
WEBHOOK_URL=

# Optional: Telegram Alerts
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## Usage

### 1. Build the TypeScript Code
```bash
npm run build
```

### 2. Run in Paper Trading Mode (Recommended First)
In paper trading mode, the bot simulates order execution with a virtual balance (default: $10,000 USDT):

```bash
npm start
```

### 3. Run Automated Tests
Verify strategy logic, risk calculations, and paper exchange behavior:

```bash
npm test
```

---

## Integration Modes

### Mode 1: Paper Trading (`TRADING_MODE=paper`)
- Default safe mode.
- Simulates realistic order fills at current altFINS market prices.
- Monitors open positions every polling cycle and automatically executes exits when Take-Profit or Stop-Loss thresholds are crossed.

### Mode 2: Live Exchange (`TRADING_MODE=live`)
- Connects directly to Binance Spot API (Testnet or Mainnet).
- When a valid altFINS signal arrives, creates signed `MARKET` buy orders.
- Exits are executed by sending corresponding sell orders when profit/stop targets are hit.

### Mode 3: Webhook Bridge / Freqtrade (`TRADING_MODE=webhook`)
- Emits structured JSON events whenever altFINS detects actionable signals:
  ```json
  {
    "event": "ENTRY_SIGNAL",
    "symbol": "BTC",
    "pair": "BTC/USDT",
    "action": "buy",
    "side": "BUY",
    "orderType": "MARKET",
    "amount": 0.0075,
    "price": 66500,
    "stopLoss": 64505,
    "takeProfit": 70490,
    "metadata": {
      "signalKey": "FRESH_MOMENTUM_MACD_SIGNAL_LINE_CROSSOVER.TXT",
      "signalName": "MACD Bullish Crossover"
    },
    "timestamp": "2026-10-12T21:45:00.000Z"
  }
  ```
- Can be pointed to Freqtrade's REST/Webhook API or a 3Commas bot webhook to trigger strategy trades.

---

## Project Structure

```
automated-trading-bot/
├── .env.example                # Sample environment configuration
├── package.json                # Dependencies and build scripts
├── tsconfig.json               # TypeScript compiler configuration
├── README.md                   # Bot documentation
└── src/
    ├── types.ts                # TypeScript types and interfaces
    ├── config.ts               # Environment configuration loader
    ├── index.ts                # Bot CLI entrypoint
    ├── bot.ts                  # Trading bot orchestrator & loop
    ├── altfins/
    │   ├── client.ts           # altFINS Public API v2 HTTP client
    │   └── signals-service.ts  # Signal fetcher & deduplication
    ├── strategy/
    │   ├── risk-manager.ts     # SL/TP, trailing stop, and position sizing
    │   └── strategy-engine.ts  # Signal evaluation & order generation
    ├── exchange/
    │   ├── exchange-adapter.interface.ts  # Adapter contract
    │   ├── paper-exchange.ts              # Virtual paper trading engine
    │   ├── binance-exchange.ts            # Live Binance Spot adapter
    │   └── webhook-exchange.ts            # Webhook bridge for Freqtrade/3Commas
    ├── notifications/
    │   └── telegram-notifier.ts           # Telegram notification service
    └── test/
        └── strategy.test.ts               # Automated unit & integration tests
```
