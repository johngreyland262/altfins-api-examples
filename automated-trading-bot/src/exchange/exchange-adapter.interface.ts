import { AccountBalance, OrderRequest, OrderResult, Position } from '../types';

export interface IExchangeAdapter {
  name: string;
  getBalance(): Promise<AccountBalance>;
  getPrice(symbol: string): Promise<number>;
  executeOrder(order: OrderRequest): Promise<OrderResult>;
  closePosition(position: Position, exitPrice: number, reason: string): Promise<OrderResult>;
}
