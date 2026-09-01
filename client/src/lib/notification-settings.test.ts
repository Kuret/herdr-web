import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ALL_CHANGES_STORAGE_KEY,
    DEFAULT_SETTINGS,
    TOASTS_STORAGE_KEY,
    loadStoredSettings,
    shouldAnnounce,
} from './notification-settings';
import type { AgentEvent } from '../types';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
    return {
        type: 'agent_status_changed',
        paneId: 'pane-1',
        from: 'idle',
        to: 'working',
        notifyWorthy: false,
        ...overrides,
    };
}

describe('loadStoredSettings', () => {
    // the suite runs in node, so stand up the one browser API this module reads
    beforeEach(() => {
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
            clear: () => store.clear(),
        });
    });

    it('falls back to the quiet defaults', () => {
        expect(loadStoredSettings()).toEqual({ toasts: DEFAULT_SETTINGS.toasts, allChanges: DEFAULT_SETTINGS.allChanges });
    });

    it('reads stored flags', () => {
        localStorage.setItem(TOASTS_STORAGE_KEY, 'false');
        localStorage.setItem(ALL_CHANGES_STORAGE_KEY, 'true');
        expect(loadStoredSettings()).toEqual({ toasts: false, allChanges: true });
    });

    it('ignores junk values', () => {
        localStorage.setItem(TOASTS_STORAGE_KEY, 'yes');
        expect(loadStoredSettings().toasts).toBe(DEFAULT_SETTINGS.toasts);
    });
});

describe('shouldAnnounce', () => {
    it('stays quiet for routine transitions by default', () => {
        expect(shouldAnnounce(makeEvent(), { allChanges: false })).toBe(false);
    });

    it('announces routine transitions once every change is opted into', () => {
        expect(shouldAnnounce(makeEvent(), { allChanges: true })).toBe(true);
    });

    it('always announces attention and finished events', () => {
        expect(shouldAnnounce(makeEvent({ to: 'blocked', notifyWorthy: true }), { allChanges: false })).toBe(true);
        expect(shouldAnnounce(makeEvent({ from: 'working', to: 'idle', notifyWorthy: true }), { allChanges: false })).toBe(true);
    });

    it('never announces a pane first reporting its status', () => {
        expect(shouldAnnounce(makeEvent({ from: null, notifyWorthy: true }), { allChanges: true })).toBe(false);
    });
});
