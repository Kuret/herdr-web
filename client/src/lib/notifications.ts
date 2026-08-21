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
    readonly platform: 'android' | 'ios' | 'desktop' | 'insecure';
    readonly title: string;
    readonly intentUrl?: string;
    readonly settingsUrl?: string;
    readonly httpsUrl?: string;
    readonly steps: readonly string[];
}

// browsers remove the Notification API on plain-http origins (except localhost),
// so the site can never appear in the allow lists — the only fix is the HTTPS URL
export function insecureContextHelp(httpsUrl: string | null): NotificationSettingsHelp {
    return {
        platform: 'insecure',
        title: 'Notifications need HTTPS',
        httpsUrl: httpsUrl ?? undefined,
        steps: [
            'This page is on plain HTTP, so the browser hides notifications for it entirely — it will never show up in the allow list',
            httpsUrl
                ? 'Open the HTTPS version below (with the self-signed certificate: tap Advanced → Proceed, or trust the cert on your device)'
                : 'Open the HTTPS URL of this server (or a Tailscale/HTTPS proxy) and enable notifications there',
            'Then toggle the bell again from the HTTPS page',
        ],
    };
}

// Android Chrome/Edge honor intent: URLs on a user tap, which CAN open the OS
// notification settings for the browser app — the one real escape hatch a page has
export function notificationSettingsHelp(userAgent: string): NotificationSettingsHelp {
    if (/iPhone|iPad|iPod/.test(userAgent)) {
        return {
            platform: 'ios',
            title: 'Notifications are blocked',
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
            title: 'Notifications are blocked',
            intentUrl: `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${browserPackage};end`,
            steps: [
                'Tap "Open notification settings" below and allow notifications for the browser',
                'Then in the browser: tap the lock/tune icon next to the address → Permissions → Notifications → Allow',
            ],
        };
    }
    return {
        platform: 'desktop',
        title: 'Notifications are blocked',
        settingsUrl: browserNotificationSettingsUrl(userAgent),
        steps: [
            'Easiest: click the lock/tune icon next to the address → Site settings → Notifications → Allow',
            'Or copy the settings address below, open it in a new tab, and add/allow this site (a site only appears in the list after it has asked once)',
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
