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

export interface NotificationSettingsHelp {
    readonly platform: 'android' | 'ios' | 'desktop';
    readonly intentUrl?: string;
    readonly settingsUrl?: string;
    readonly steps: readonly string[];
}

// Android Chrome/Edge honor intent: URLs on a user tap, which CAN open the OS
// notification settings for the browser app — the one real escape hatch a page has
export function notificationSettingsHelp(userAgent: string): NotificationSettingsHelp {
    if (/iPhone|iPad|iPod/.test(userAgent)) {
        return {
            platform: 'ios',
            steps: [
                'Open the iOS Settings app',
                'Notifications → find this app (or Safari) and allow notifications',
                'If installed from Safari: notifications need iOS 16.4+ and the app added to the Home Screen',
            ],
        };
    }
    if (/Android/.test(userAgent)) {
        const browserPackage = userAgent.includes('Edg') ? 'com.microsoft.emmx' : 'com.android.chrome';
        return {
            platform: 'android',
            intentUrl: `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${browserPackage};end`,
            steps: [
                'Tap "Open notification settings" below and allow notifications for the browser',
                'Then in the browser: tap the lock/tune icon next to the address → Permissions → Notifications → Allow',
            ],
        };
    }
    return {
        platform: 'desktop',
        settingsUrl: browserNotificationSettingsUrl(userAgent),
        steps: [
            'Copy the settings address below and open it in a new tab',
            'Find this site under "Not allowed" and switch it to Allow',
        ],
    };
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
