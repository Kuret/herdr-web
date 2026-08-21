import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HerdrSocket } from './ws-client';
import type { ClientMessage } from '../types';

class MockWebSocket {
    static readonly OPEN = 1;
    static instances: MockWebSocket[] = [];

    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readonly sent: string[] = [];
    closeCalls = 0;

    constructor(readonly url: string) {
        MockWebSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.closeCalls += 1;
    }
}

function latestSocket(): MockWebSocket {
    const instance = MockWebSocket.instances.at(-1);
    if (!instance) {
        throw new Error('no WebSocket was created');
    }
    return instance;
}

function makeMessageEvent(data: string): MessageEvent<string> {
    return { data } as unknown as MessageEvent<string>;
}

function makeClient() {
    const onMessage = vi.fn();
    const onStatusChange = vi.fn();
    const client = new HerdrSocket('ws://localhost:8123/ws', onMessage, onStatusChange);
    return { client, onMessage, onStatusChange };
}

describe('HerdrSocket', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        MockWebSocket.instances = [];
        vi.stubGlobal('WebSocket', MockWebSocket);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('connect() opens a websocket to the given url', () => {
        const { client } = makeClient();
        client.connect();
        expect(MockWebSocket.instances).toHaveLength(1);
        expect(latestSocket().url).toBe('ws://localhost:8123/ws');
    });

    it('reports connected on open and disconnected on close', () => {
        const { client, onStatusChange } = makeClient();
        client.connect();
        latestSocket().onopen?.();
        expect(onStatusChange).toHaveBeenLastCalledWith(true);
        latestSocket().onclose?.();
        expect(onStatusChange).toHaveBeenLastCalledWith(false);
    });

    it('schedules the first reconnect at 1000ms after close', () => {
        const { client } = makeClient();
        client.connect();
        latestSocket().onclose?.();
        vi.advanceTimersByTime(999);
        expect(MockWebSocket.instances).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('doubles the reconnect delay on repeated failures, capped at 15000ms', () => {
        const { client } = makeClient();
        client.connect();
        const delays = [1000, 2000, 4000, 8000, 15000, 15000];
        for (const delay of delays) {
            const before = MockWebSocket.instances.length;
            latestSocket().onclose?.();
            vi.advanceTimersByTime(delay - 1);
            expect(MockWebSocket.instances).toHaveLength(before);
            vi.advanceTimersByTime(1);
            expect(MockWebSocket.instances).toHaveLength(before + 1);
        }
    });

    it('resets the backoff after a successful open', () => {
        const { client } = makeClient();
        client.connect();
        latestSocket().onclose?.();
        vi.advanceTimersByTime(1000);
        expect(MockWebSocket.instances).toHaveLength(2);
        latestSocket().onopen?.();
        latestSocket().onclose?.();
        vi.advanceTimersByTime(1000);
        expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('close() during backoff cancels the pending reconnect', () => {
        const { client } = makeClient();
        client.connect();
        latestSocket().onclose?.();
        client.close();
        vi.advanceTimersByTime(60000);
        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('never reconnects after close(), even if the socket closes afterwards', () => {
        const { client } = makeClient();
        client.connect();
        const socket = latestSocket();
        client.close();
        expect(socket.closeCalls).toBe(1);
        socket.onclose?.();
        vi.advanceTimersByTime(60000);
        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('send() no-ops when the socket is not open', () => {
        const { client } = makeClient();
        client.connect();
        client.send({ type: 'refresh_topology' });
        expect(latestSocket().sent).toHaveLength(0);
    });

    it('send() serializes the message as JSON when the socket is open', () => {
        const { client } = makeClient();
        client.connect();
        const socket = latestSocket();
        socket.readyState = MockWebSocket.OPEN;
        const message: ClientMessage = { type: 'input', data: 'ls' };
        client.send(message);
        expect(socket.sent).toEqual([JSON.stringify(message)]);
    });

    it('ignores malformed server messages without throwing', () => {
        const { client, onMessage } = makeClient();
        client.connect();
        expect(() => latestSocket().onmessage?.(makeMessageEvent('not json'))).not.toThrow();
        expect(onMessage).not.toHaveBeenCalled();
    });

    it('parses well-formed server messages', () => {
        const { client, onMessage } = makeClient();
        client.connect();
        latestSocket().onmessage?.(makeMessageEvent('{"type":"error","message":"boom"}'));
        expect(onMessage).toHaveBeenCalledWith({ type: 'error', message: 'boom' });
    });
});
