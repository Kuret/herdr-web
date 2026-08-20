import { useEffect, useRef } from 'react';

const STICK_TO_BOTTOM_THRESHOLD_PX = 40;

interface TerminalProps {
    readonly html: string;
    readonly hasPane: boolean;
}

export function Terminal({ html, hasPane }: TerminalProps) {
    const preRef = useRef<HTMLPreElement | null>(null);
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        const pre = preRef.current;
        if (!pre || !stickToBottomRef.current) {
            return;
        }
        pre.scrollTop = pre.scrollHeight;
    }, [html]);

    const onScroll = () => {
        const pre = preRef.current;
        if (!pre) {
            return;
        }
        const distanceFromBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight;
        stickToBottomRef.current = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD_PX;
    };

    if (!hasPane) {
        return (
            <main className="terminal-wrap">
                <div className="empty-state">
                    <p>No pane selected.</p>
                    <p className="empty-hint">Pick an agent above to see its terminal.</p>
                </div>
            </main>
        );
    }
    return (
        <main className="terminal-wrap">
            {/* html is produced server-side by lib/ansi.js, which HTML-escapes all pane text */}
            <pre ref={preRef} className="terminal" tabIndex={0} onScroll={onScroll} dangerouslySetInnerHTML={{ __html: html }} />
        </main>
    );
}
