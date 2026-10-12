import { loadConfig } from './config';
import { TradingBot } from './bot';

async function main(): Promise<void> {
  const config = loadConfig();
  const bot = new TradingBot(config);

  const shutdown = () => {
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await bot.start();
}

main().catch(err => {
  console.error('Fatal error starting altFINS Trading Bot:', err);
  process.exit(1);
});
