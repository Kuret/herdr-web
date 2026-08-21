import { describe, expect, it } from 'vitest';
import { statusDotClass } from './status';

describe('statusDotClass', () => {
    it('maps known statuses to css classes', () => {
        expect(statusDotClass('working')).toBe('status-working');
        expect(statusDotClass('idle')).toBe('status-idle');
        expect(statusDotClass('blocked')).toBe('status-blocked');
    });

    it('falls back to unknown for missing or unrecognized status', () => {
        expect(statusDotClass(undefined)).toBe('status-unknown');
        expect(statusDotClass('')).toBe('status-unknown');
        expect(statusDotClass('sleeping')).toBe('status-unknown');
    });
});

