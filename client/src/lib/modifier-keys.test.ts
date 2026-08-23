import { describe, expect, it } from 'vitest';
import { applyModifier } from './modifier-keys';

describe('applyModifier', () => {
    it('maps ctrl+letter to its control code, case-insensitively', () => {
        expect(applyModifier('ctrl', 'c')).toBe('\x03');
        expect(applyModifier('ctrl', 'C')).toBe('\x03');
        expect(applyModifier('ctrl', 'a')).toBe('\x01');
        expect(applyModifier('ctrl', 'z')).toBe('\x1a');
    });

    it('leaves non-letters unchanged for ctrl', () => {
        expect(applyModifier('ctrl', '1')).toBe('1');
        expect(applyModifier('ctrl', ' ')).toBe(' ');
    });

    it('prefixes alt+char with ESC', () => {
        expect(applyModifier('alt', 'f')).toBe('\x1bf');
        expect(applyModifier('alt', '1')).toBe('\x1b1');
    });
});
