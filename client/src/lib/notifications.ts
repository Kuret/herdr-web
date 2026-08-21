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

// pages cannot navigate to browser-internal settings URLs, so the best a web
// app can do on a denied permission is hand the user the exact address
export function browserNotificationSettingsUrl(userAgent: string): string {
    if (userAgent.includes('Edg/')) {
        return 'edge://settings/content/notifications';
    }
    if (userAgent.includes('Firefox/')) {
        return 'about:preferences#privacy';
    }
    return 'chrome://settings/content/notifications';
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
