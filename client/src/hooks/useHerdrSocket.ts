import { useEffect, useMemo, useRef, useState } from 'react';
import { HerdrSocket } from '../lib/ws-client';
import type { AgentEvent, ClientMessage, HerdrPane, HerdrWorkspace, ServerMessage } from '../types';

export interface HerdrState {
    readonly connected: boolean;
    readonly workspaces: HerdrWorkspace[];
    readonly panes: HerdrPane[];
    readonly paneHtml: string;
    readonly lastEvent: AgentEvent | null;
    readonly lastError: string | null;
    readonly send: (message: ClientMessage) => void;
}

export function useHerdrSocket(): HerdrState {
    const [connected, setConnected] = useState(false);
    const [workspaces, setWorkspaces] = useState<HerdrWorkspace[]>([]);
    const [panes, setPanes] = useState<HerdrPane[]>([]);
    const [paneHtml, setPaneHtml] = useState('');
    const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const socketRef = useRef<HerdrSocket | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${protocol}://${window.location.host}/ws`;
        const socket = new HerdrSocket(
            url,
            (message: ServerMessage) => {
                if (message.type === 'topology') {
                    setWorkspaces(message.workspaces);
                    setPanes(message.panes);
                    return;
                }
                if (message.type === 'pane_output') {
                    setPaneHtml(message.html);
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

    const send = useMemo(() => {
        return (message: ClientMessage) => socketRef.current?.send(message);
    }, []);

    return { connected, workspaces, panes, paneHtml, lastEvent, lastError, send };
}
