export type KeyAction = { kind: 'keys'; keys: string[] } | { kind: 'text'; text: string } | null;

export interface KeyEventLike {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
}

const SPECIAL_KEY_MAP: Readonly<Record<string, string>> = {
    Enter: 'enter',
    Escape: 'esc',
    Backspace: 'backspace',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ' ': 'space',
};

const FUNCTION_KEY_PATTERN = /^F([1-9]|1[0-2])$/;

// maps a browser KeyboardEvent to a herdr `pane send-keys` name or literal text;
// null means the browser should keep the event (cmd shortcuts, unsupported keys)
export function mapKeyboardEvent(event: KeyEventLike): KeyAction {
    if (event.metaKey) {
        return null;
    }
    if (event.key === 'Tab') {
        return { kind: 'keys', keys: [event.shiftKey ? 'shift+tab' : 'tab'] };
    }
    if (event.ctrlKey) {
        if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
            return { kind: 'keys', keys: [`ctrl+${event.key.toLowerCase()}`] };
        }
        return null;
    }
    const special = SPECIAL_KEY_MAP[event.key];
    if (special) {
        return { kind: 'keys', keys: [special] };
    }
    if (FUNCTION_KEY_PATTERN.test(event.key)) {
        return { kind: 'keys', keys: [event.key.toLowerCase()] };
    }
    if (event.altKey) {
        return null;
    }
    if (event.key.length === 1) {
        return { kind: 'text', text: event.key };
    }
    return null;
}
