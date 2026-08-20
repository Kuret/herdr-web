import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { mapKeyboardEvent } from '../lib/keymap';

const STICK_TO_BOTTOM_THRESHOLD_PX = 40;

interface TerminalProps {
    readonly html: string;
    readonly hasPane: boolean;
    readonly onSendKeys: (keys: string[]) => void;
    readonly onSendText: (text: string) => void;
}

export function Terminal({ html, hasPane, onSendKeys, onSendText }: TerminalProps) {
    const preRef = useRef<HTMLPreElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
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

    // click (or tap) the terminal to type straight into the pane; a hidden input
    // carries focus so phone keyboards open too — no separate composer needed
    const focusTypingInput = () => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            return;
        }
        inputRef.current?.focus({ preventScroll: true });
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        const action = mapKeyboardEvent(event);
        if (!action) {
            return;
        }
        event.preventDefault();
        if (action.kind === 'keys') {
            onSendKeys(action.keys);
            return;
        }
        onSendText(action.text);
    };

    // IME / mobile keyboards deliver text via input events instead of mapped keydowns
    const onInput = (event: FormEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        if (input.value.length === 0) {
            return;
        }
        onSendText(input.value);
        input.value = '';
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
        <main className="terminal-wrap" onClick={focusTypingInput}>
            {/* html is produced server-side by lib/ansi.js, which HTML-escapes all pane text */}
            <pre ref={preRef} className="terminal" onScroll={onScroll} dangerouslySetInnerHTML={{ __html: html }} />
            <input
                ref={inputRef}
                className="typing-input"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Type to the pane"
                onKeyDown={onKeyDown}
                onInput={onInput}
            />
        </main>
    );
}
