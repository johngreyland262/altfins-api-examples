import { Position, OrderResult } from '../types';

export class TelegramNotifier {
  private botToken?: string;
  private chatId?: string;

  constructor(botToken?: string, chatId?: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  async send(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
    } catch (err: any) {
      console.error(`[Telegram] Failed to send message: ${err.message}`);
    }
  }

  async notifyTradeEntry(symbol: string, side: string, price: number, amount: number, orderResult: OrderResult, signalName?: string): Promise<void> {
    const icon = side === 'BUY' ? '🟢' : '🔴';
    const msg = [
      `${icon} <b>altFINS Bot Trade Opened</b>`,
      `<b>Symbol:</b> ${symbol}/USDT`,
      `<b>Side:</b> ${side}`,
      `<b>Entry Price:</b> $${price.toFixed(4)}`,
      `<b>Amount:</b> ${amount.toFixed(4)}`,
      `<b>Order ID:</b> ${orderResult.orderId}`,
      signalName ? `<b>Signal:</b> ${signalName}` : '',
      `<b>Time:</b> ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n');

    await this.send(msg);
  }

  async notifyTradeExit(position: Position, exitPrice: number, reason: string): Promise<void> {
    const pnl = position.realizedPnlUsd ?? ((exitPrice - position.entryPrice) * position.amount);
    const pnlPct = position.realizedPnlPercentage ?? (((exitPrice - position.entryPrice) / position.entryPrice) * 100);
    const icon = pnl >= 0 ? '💰' : '🛑';

    const msg = [
      `${icon} <b>altFINS Bot Trade Closed</b>`,
      `<b>Symbol:</b> ${position.symbol}/USDT`,
      `<b>Reason:</b> ${reason}`,
      `<b>Entry:</b> $${position.entryPrice.toFixed(4)}`,
      `<b>Exit:</b> $${exitPrice.toFixed(4)}`,
      `<b>PnL:</b> $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`,
      `<b>Time:</b> ${new Date().toISOString()}`,
    ].join('\n');

    await this.send(msg);
  }
}
