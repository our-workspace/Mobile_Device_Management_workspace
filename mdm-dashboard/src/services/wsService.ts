// src/services/wsService.ts
import type { DashboardEvent } from '../types';

type EventHandler = (event: DashboardEvent) => void;

class WsService {
  private ws: WebSocket | null = null;
  private handlers: EventHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnectAttempt = 0;
  private readonly backoffDelays = [1000, 3000, 5000, 10000, 30000];

  connect(token: string): void {
    this.shouldReconnect = true;
    const wsUrl = `ws://localhost:3000/ws/dashboard?token=${encodeURIComponent(token)}`;
    this._connect(wsUrl);
  }

  private _connect(url: string): void {
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] Dashboard connected');
        this.reconnectAttempt = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DashboardEvent;
          this.handlers.forEach((h) => h(data));
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code);
        if (this.shouldReconnect) {
          this.scheduleReconnect(url);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      if (this.shouldReconnect) {
        this.scheduleReconnect(url);
      }
    }
  }

  private scheduleReconnect(url: string): void {
    const delay = this.backoffDelays[Math.min(this.reconnectAttempt, this.backoffDelays.length - 1)];
    this.reconnectAttempt++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})...`);
    this.reconnectTimer = setTimeout(() => this._connect(url), delay);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close(1000, 'User disconnect');
    this.ws = null;
  }

  on(handler: EventHandler): () => void {
    this.handlers.push(handler);
    // إرجاع دالة لإلغاء الاشتراك
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WsService();
