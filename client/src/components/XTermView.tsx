import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { ClientMessage } from '../types';
import type { TerminalMessage } from '../hooks/useHerdrSocket';

const MOBILE_MAX_WIDTH_PX = 768;
const MOBILE_FONT_SIZE = 12;
const DESKTOP_FONT_SIZE = 14;
const RESIZE_DEBOUNCE_MS = 150;

// nerd-font families first so herdr's TUI glyphs render; the self-hosted
// Symbols Nerd Font Mono (style.css @font-face) is the guaranteed fallback
const TERMINAL_FONT_FAMILY =
    '"JetBrainsMono Nerd Font Mono", "JetBrainsMono Nerd Font", "MesloLGS NF", ' +
    '"FiraCode Nerd Font", "Hack Nerd Font Mono", "Symbols Nerd Font Mono", ' +
    'Menlo, Monaco, "Courier New", monospace';

const TERMINAL_THEME = {
    background: '#050607',
    foreground: '#e8eef2',
    cursor: '#7cb8ff',
    selectionBackground: '#264f78',
};

interface XTermViewProps {
    readonly connected: boolean;
    readonly send: (message: ClientMessage) => void;
    readonly subscribeTerminal: (handler: (message: TerminalMessage) => void) => () => void;
}

export function XTermView({ connected, send, subscribeTerminal }: XTermViewProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const startedRef = useRef(false);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH_PX;
        const xterm = new XTerm({
            cursorBlink: true,
            fontSize: isMobile ? MOBILE_FONT_SIZE : DESKTOP_FONT_SIZE,
            fontFamily: TERMINAL_FONT_FAMILY,
            theme: TERMINAL_THEME,
            scrollback: 5000,
            allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);
        xterm.open(container);
        fitAddon.fit();
        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        const inputDisposable = xterm.onData((data) => send({ type: 'input', data }));

        const unsubscribe = subscribeTerminal((message) => {
            if (message.type === 'output') {
                xterm.write(message.data);
                return;
            }
            xterm.write(`\r\n\x1b[2m[herdr exited with code ${message.code} — reconnecting will restart it]\x1b[0m\r\n`);
            startedRef.current = false;
        });

        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        const observer = new ResizeObserver(() => {
            if (resizeTimer !== null) {
                clearTimeout(resizeTimer);
            }
            resizeTimer = setTimeout(() => {
                fitAddon.fit();
                send({ type: 'resize', cols: xterm.cols, rows: xterm.rows });
            }, RESIZE_DEBOUNCE_MS);
        });
        observer.observe(container);

        return () => {
            observer.disconnect();
            if (resizeTimer !== null) {
                clearTimeout(resizeTimer);
            }
            unsubscribe();
            inputDisposable.dispose();
            xterm.dispose();
            xtermRef.current = null;
            fitAddonRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // every (re)connect gets a fresh server-side PTY, so restart the TUI stream
    useEffect(() => {
        const xterm = xtermRef.current;
        if (!connected || !xterm) {
            return;
        }
        if (startedRef.current) {
            xterm.reset();
        }
        fitAddonRef.current?.fit();
        send({ type: 'start', cols: xterm.cols, rows: xterm.rows });
        startedRef.current = true;
        xterm.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    return <main ref={containerRef} className="xterm-wrap" />;
}
