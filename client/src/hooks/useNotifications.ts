import { useCallback, useEffect, useState } from 'react';
import { formatAgentNotification } from '../lib/notifications';
import type { AgentEvent } from '../types';

const STORAGE_KEY = 'herdr-web:notifications-enabled';

export interface NotificationControls {
    readonly enabled: boolean;
    readonly toggle: () => Promise<void>;
    readonly notifyForEvent: (event: AgentEvent) => Promise<void>;
}

export function useNotifications(): NotificationControls {
    const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(enabled));
    }, [enabled]);

    const toggle = useCallback(async () => {
        if (enabled) {
            setEnabled(false);
            return;
        }
        if (!('Notification' in window)) {
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            setEnabled(true);
        }
    }, [enabled]);

    const notifyForEvent = useCallback(
        async (event: AgentEvent) => {
            if (!enabled || !event.notifyWorthy) {
                return;
            }
            if (!('Notification' in window) || Notification.permission !== 'granted') {
                return;
            }
            const { title, body } = formatAgentNotification(event);
            const registration = await navigator.serviceWorker?.getRegistration();
            if (registration) {
                await registration.showNotification(title, { body, icon: '/icon-192.png', tag: event.paneId });
                return;
            }
            new Notification(title, { body, icon: '/icon-192.png', tag: event.paneId });
        },
        [enabled],
    );

    return { enabled, toggle, notifyForEvent };
}
