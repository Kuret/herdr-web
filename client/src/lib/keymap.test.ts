import { describe, expect, it } from 'vitest';
import { mapKeyboardEvent } from './keymap';
import type { KeyEventLike } from './keymap';

function ev(key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
    return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods };
}

describe('mapKeyboardEvent', () => {
    it('maps special keys to herdr key names', () => {
        expect(mapKeyboardEvent(ev('Enter'))).toEqual({ kind: 'keys', keys: ['enter'] });
        expect(mapKeyboardEvent(ev('Escape'))).toEqual({ kind: 'keys', keys: ['esc'] });
        expect(mapKeyboardEvent(ev('Backspace'))).toEqual({ kind: 'keys', keys: ['backspace'] });
        expect(mapKeyboardEvent(ev('ArrowUp'))).toEqual({ kind: 'keys', keys: ['up'] });
        expect(mapKeyboardEvent(ev('ArrowRight'))).toEqual({ kind: 'keys', keys: ['right'] });
        expect(mapKeyboardEvent(ev(' '))).toEqual({ kind: 'keys', keys: ['space'] });
    });

    it('maps Tab and Shift+Tab', () => {
        expect(mapKeyboardEvent(ev('Tab'))).toEqual({ kind: 'keys', keys: ['tab'] });
        expect(mapKeyboardEvent(ev('Tab', { shiftKey: true }))).toEqual({ kind: 'keys', keys: ['shift+tab'] });
    });

    it('maps ctrl+letter and rejects other ctrl combos', () => {
        expect(mapKeyboardEvent(ev('c', { ctrlKey: true }))).toEqual({ kind: 'keys', keys: ['ctrl+c'] });
        expect(mapKeyboardEvent(ev('R', { ctrlKey: true }))).toEqual({ kind: 'keys', keys: ['ctrl+r'] });
        expect(mapKeyboardEvent(ev('ArrowUp', { ctrlKey: true }))).toBeNull();
        expect(mapKeyboardEvent(ev('1', { ctrlKey: true }))).toBeNull();
    });

    it('maps function keys', () => {
        expect(mapKeyboardEvent(ev('F5'))).toEqual({ kind: 'keys', keys: ['f5'] });
        expect(mapKeyboardEvent(ev('F12'))).toEqual({ kind: 'keys', keys: ['f12'] });
        expect(mapKeyboardEvent(ev('F13'))).toBeNull();
    });

    it('passes printable characters through as text', () => {
        expect(mapKeyboardEvent(ev('a'))).toEqual({ kind: 'text', text: 'a' });
        expect(mapKeyboardEvent(ev('Z'))).toEqual({ kind: 'text', text: 'Z' });
        expect(mapKeyboardEvent(ev('/'))).toEqual({ kind: 'text', text: '/' });
    });

    it('leaves meta/cmd shortcuts and unsupported keys to the browser', () => {
        expect(mapKeyboardEvent(ev('c', { metaKey: true }))).toBeNull();
        expect(mapKeyboardEvent(ev('Home'))).toBeNull();
        expect(mapKeyboardEvent(ev('Delete'))).toBeNull();
        expect(mapKeyboardEvent(ev('a', { altKey: true }))).toBeNull();
        expect(mapKeyboardEvent(ev('Shift'))).toBeNull();
    });
});
