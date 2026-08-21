import { useCallback, useEffect, useRef, useState } from 'react';
import { HerdrSocket } from '../lib/ws-client';
import type { AgentEvent, ClientMessage, HerdrPane, HerdrWorkspace, ServerMessage } from '../types';

export type TerminalMessage = { type: 'output'; data: string } | { type: 'exit'; code: number };

export interface HerdrState {
    readonly connected: boolean;
    readonly workspaces: HerdrWorkspace[];
    readonly panes: HerdrPane[];
    readonly lastEvent: AgentEvent | null;
    readonly lastError: string | null;
    readonly send: (message: ClientMessage) => void;
    readonly subscribeTerminal: (handler: (message: TerminalMessage) => void) => () => void;
}

export function useHerdrSocket(): HerdrState {
    const [connected, setConnected] = useState(false);
    const [workspaces, setWorkspaces] = useState<HerdrWorkspace[]>([]);
    const [panes, setPanes] = useState<HerdrPane[]>([]);
    const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const socketRef = useRef<HerdrSocket | null>(null);
    const terminalHandlersRef = useRef(new Set<(message: TerminalMessage) => void>());

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${protocol}://${window.location.host}/ws`;
        const socket = new HerdrSocket(
            url,
            (message: ServerMessage) => {
                if (message.type === 'output' || message.type === 'exit') {
                    for (const handler of terminalHandlersRef.current) {
                        handler(message);
                    }
                    return;
                }
                if (message.type === 'topology') {
                    setWorkspaces(message.workspaces);
                    setPanes(message.panes);
                    return;
                }
                if (message.type === 'agent_event') {
                    setLastEvent(message.event);
                    return;
                }
                setLastError(message.message);
            },
            setConnected,
        );
        socketRef.current = socket;
        socket.connect();
        return () => socket.close();
    }, []);

    const send = useCallback((message: ClientMessage) => {
        socketRef.current?.send(message);
    }, []);

    const subscribeTerminal = useCallback((handler: (message: TerminalMessage) => void) => {
        terminalHandlersRef.current.add(handler);
        return () => {
            terminalHandlersRef.current.delete(handler);
        };
    }, []);

    return { connected, workspaces, panes, lastEvent, lastError, send, subscribeTerminal };
}
