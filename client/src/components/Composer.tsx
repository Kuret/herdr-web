import type { ArmedModifier } from '../lib/modifier-keys';

const QUICK_KEYS: ReadonlyArray<{ label: string; bytes: string; danger?: boolean }> = [
    { label: 'prefix', bytes: '\x01' },
    { label: 'esc', bytes: '\x1b' },
    { label: 'tab', bytes: '\t' },
    { label: '↑', bytes: '\x1b[A' },
    { label: '↓', bytes: '\x1b[B' },
    { label: '←', bytes: '\x1b[D' },
    { label: '→', bytes: '\x1b[C' },
    { label: 'ctrl·c', bytes: '\x03', danger: true },
    { label: '⏎', bytes: '\r' },
];

const MODIFIER_KEYS: ReadonlyArray<{ modifier: ArmedModifier; label: string }> = [
    { modifier: 'ctrl', label: 'ctrl' },
    { modifier: 'alt', label: 'alt' },
];

interface ComposerProps {
    readonly disabled: boolean;
    readonly keyboardEnabled: boolean;
    readonly armedModifier: ArmedModifier | null;
    readonly onToggleKeyboard: () => void;
    readonly onToggleModifier: (modifier: ArmedModifier) => void;
    readonly onSendBytes: (bytes: string) => void;
}

// quick-keys bar for keys phone keyboards don't have — typing itself happens
// directly in the terminal; "prefix" sends herdr's default ctrl+a; ⌨ toggles
// the virtual keyboard on touch devices (taps navigate the TUI without it).
// ctrl/alt arm a one-shot modifier: the phone keyboard can't hold a modifier
// key while typing another, so the next character typed gets combined with it.
export function Composer({
    disabled,
    keyboardEnabled,
    armedModifier,
    onToggleKeyboard,
    onToggleModifier,
    onSendBytes,
}: ComposerProps) {
    return (
        <footer className="composer">
            <div className="quick-keys" role="toolbar" aria-label="quick keys">
                <button
                    type="button"
                    className={keyboardEnabled ? 'key-btn key-kbd key-active' : 'key-btn key-kbd'}
                    aria-pressed={keyboardEnabled}
                    aria-label={keyboardEnabled ? 'Hide the on-screen keyboard' : 'Show the on-screen keyboard'}
                    onClick={onToggleKeyboard}
                >
                    ⌨
                </button>
                {MODIFIER_KEYS.map(({ modifier, label }) => (
                    <button
                        key={modifier}
                        type="button"
                        className={armedModifier === modifier ? 'key-btn key-active' : 'key-btn'}
                        aria-pressed={armedModifier === modifier}
                        aria-label={`Arm ${label} for the next key typed`}
                        disabled={disabled}
                        onClick={() => onToggleModifier(modifier)}
                    >
                        {label}
                    </button>
                ))}
                {QUICK_KEYS.map((key) => (
                    <button
                        key={key.label}
                        type="button"
                        className={key.danger ? 'key-btn key-danger' : 'key-btn'}
                        disabled={disabled}
                        onClick={() => onSendBytes(key.bytes)}
                    >
                        {key.label}
                    </button>
                ))}
            </div>
        </footer>
    );
}
