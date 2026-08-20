const QUICK_KEYS: ReadonlyArray<{ label: string; keys: string[]; danger?: boolean }> = [
    { label: 'esc', keys: ['esc'] },
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
    readonly onSendKeys: (keys: string[]) => void;
}

// quick-keys bar for keys phone keyboards don't have — typing itself happens
// directly in the terminal (tap it to summon the keyboard)
export function Composer({ disabled, onSendKeys }: ComposerProps) {
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
        </footer>
    );
}
