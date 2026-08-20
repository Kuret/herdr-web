import type { ClientMessage, ServerMessage } from '../types';

export class HerdrSocket {
    private static readonly RECONNECT_BASE_MS = 1000;
    private static readonly RECONNECT_MAX_MS = 15000;

    private socket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private closedByUser = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly url: string,
        private readonly onMessage: (message: ServerMessage) => void,
        private readonly onStatusChange: (connected: boolean) => void,
    ) {}

    connect(): void {
        this.closedByUser = false;
        this.open();
    }

    close(): void {
        this.closedByUser = true;
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.socket?.close();
        this.socket = null;
    }

    send(message: ClientMessage): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.socket.send(JSON.stringify(message));
    }

    private open(): void {
        if (this.closedByUser) {
            return;
        }
        const socket = new WebSocket(this.url);
        this.socket = socket;
        socket.onopen = () => {
            this.reconnectAttempts = 0;
            this.onStatusChange(true);
        };
        socket.onmessage = (raw: MessageEvent<string>) => {
            try {
                this.onMessage(JSON.parse(raw.data) as ServerMessage);
            } catch (err) {
                if (err instanceof Error) {
                    console.error('bad server message:', err.message);
                }
            }
        };
        socket.onclose = () => {
            this.onStatusChange(false);
            this.scheduleReconnect();
        };
        socket.onerror = () => {
            socket.close();
        };
    }

    private scheduleReconnect(): void {
        if (this.closedByUser) {
            return;
        }
        const delay = Math.min(
            HerdrSocket.RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
            HerdrSocket.RECONNECT_MAX_MS,
        );
        this.reconnectAttempts += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.open();
        }, delay);
    }
}
