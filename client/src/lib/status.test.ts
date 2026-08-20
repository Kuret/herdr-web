import { describe, expect, it } from 'vitest';
import { paneDisplayName, statusDotClass } from './status';

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

describe('paneDisplayName', () => {
    it('prefers the terminal title', () => {
        expect(paneDisplayName('My Task', '/home/user/repo', 'w1:p1')).toBe('My Task');
    });

    it('trims whitespace-only titles and uses cwd basename', () => {
        expect(paneDisplayName('   ', '/home/user/repo', 'w1:p1')).toBe('repo');
        expect(paneDisplayName(undefined, '/home/user/repo/', 'w1:p1')).toBe('repo');
    });

    it('falls back to the pane id', () => {
        expect(paneDisplayName(undefined, undefined, 'w1:p1')).toBe('w1:p1');
        expect(paneDisplayName('', '', 'w1:p1')).toBe('w1:p1');
    });
});
