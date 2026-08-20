import { describe, expect, it } from 'vitest';
import { formatAgentNotification, toastClass } from './notifications';
import type { AgentEvent } from '../types';

function makeEvent(overrides: Partial<AgentEvent>): AgentEvent {
    return {
        type: 'agent_status_changed',
        paneId: 'w1:p1',
        from: 'working',
        to: 'idle',
        agent: 'claude',
        title: 'fix login bug',
        notifyWorthy: true,
        ...overrides,
    };
}

describe('formatAgentNotification', () => {
    it('announces blocked agents as needing attention', () => {
        const content = formatAgentNotification(makeEvent({ to: 'blocked' }));
        expect(content.title).toBe('claude needs attention');
        expect(content.body).toBe('fix login bug');
    });

    it('announces working-to-anything as finished', () => {
        const content = formatAgentNotification(makeEvent({ from: 'working', to: 'idle' }));
        expect(content.title).toBe('claude finished (idle)');
    });

    it('falls back to a generic transition and pane id', () => {
        const content = formatAgentNotification(makeEvent({ from: 'idle', to: 'unknown', title: '', agent: undefined }));
        expect(content.title).toBe('agent: idle → unknown');
        expect(content.body).toBe('w1:p1');
    });
});

describe('toastClass', () => {
    it('marks blocked events', () => {
        expect(toastClass(makeEvent({ to: 'blocked' }))).toBe('toast toast-blocked');
    });

    it('marks finished work', () => {
        expect(toastClass(makeEvent({ from: 'working', to: 'idle' }))).toBe('toast toast-done');
    });

    it('defaults to a plain toast', () => {
        expect(toastClass(makeEvent({ from: 'idle', to: 'working' }))).toBe('toast');
    });
});
