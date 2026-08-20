import { useState } from 'react';
import type { FormEvent } from 'react';

const QUICK_KEYS: ReadonlyArray<{ label: string; keys: string[]; danger?: boolean }> = [
    { label: 'esc', keys: ['escape'] },
    { label: 'tab', keys: ['tab'] },
    { label: '↑', keys: ['up'] },
    { label: '↓', keys: ['down'] },
    { label: '←', keys: ['left'] },
    { label: '→', keys: ['right'] },
    { label: 'ctrl·c', keys: ['ctrl+c'], danger: true },
    { label: '⏎', keys: ['enter'] },
];

interface ComposerProps {
    readonly disabled: boolean;
    readonly onSendText: (text: string) => void;
    readonly onSendKeys: (keys: string[]) => void;
}

export function Composer({ disabled, onSendText, onSendKeys }: ComposerProps) {
    const [text, setText] = useState('');

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (disabled || text.length === 0) {
            return;
        }
        onSendText(text);
        setText('');
    };

    return (
        <footer className="composer">
            <div className="quick-keys" role="toolbar" aria-label="quick keys">
                {QUICK_KEYS.map((key) => (
                    <button
                        key={key.label}
                        type="button"
                        className={key.danger ? 'key-btn key-danger' : 'key-btn'}
                        disabled={disabled}
                        onClick={() => onSendKeys(key.keys)}
                    >
                        {key.label}
                    </button>
                ))}
            </div>
            <form className="send-row" onSubmit={submit}>
                <input
                    type="text"
                    value={text}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={disabled ? 'Select a pane first' : 'Type to the pane…'}
                    aria-label="Text to send"
                    disabled={disabled}
                    onChange={(event) => setText(event.target.value)}
                />
                <button className="send-btn" type="submit" disabled={disabled}>
                    Send
                </button>
            </form>
        </footer>
    );
}
