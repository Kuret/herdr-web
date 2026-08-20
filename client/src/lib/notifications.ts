import type { AgentEvent } from '../types';

export interface NotificationContent {
    readonly title: string;
    readonly body: string;
}

export function formatAgentNotification(event: AgentEvent): NotificationContent {
    const agent = event.agent ?? 'agent';
    const where = event.title && event.title.length > 0 ? event.title : event.paneId;
    if (event.to === 'blocked') {
        return { title: `${agent} needs attention`, body: where };
    }
    if (event.from === 'working') {
        return { title: `${agent} finished (${event.to})`, body: where };
    }
    return { title: `${agent}: ${String(event.from)} → ${event.to}`, body: where };
}

export function toastClass(event: AgentEvent): string {
    if (event.to === 'blocked') {
        return 'toast toast-blocked';
    }
    if (event.from === 'working') {
        return 'toast toast-done';
    }
    return 'toast';
}
