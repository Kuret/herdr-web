import { useCallback, useEffect, useState } from 'react';
import { formatAgentNotification } from '../lib/notifications';
import { subscribeToPush, unsubscribeFromPush } from '../lib/push';
import type { AgentEvent } from '../types';

const STORAGE_KEY = 'herdr-web:notifications-enabled';
const MODE_STORAGE_KEY = 'herdr-web:notifications-mode';

export type NotificationMode = 'push' | 'local';
export type NotificationToggleResult = 'enabled-push' | 'enabled-local' | 'disabled' | 'unsupported' | 'denied';

export interface NotificationControls {
    readonly enabled: boolean;
    readonly toggle: () => Promise<NotificationToggleResult>;
    readonly notifyForEvent: (event: AgentEvent) => Promise<void>;
}

export function useNotifications(): NotificationControls {
    const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
    const [mode, setMode] = useState<NotificationMode>(() =>
        localStorage.getItem(MODE_STORAGE_KEY) === 'local' ? 'local' : 'push',
    );

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(enabled));
        localStorage.setItem(MODE_STORAGE_KEY, mode);
    }, [enabled, mode]);

    // self-heal on load: "enabled" without a live push subscription is a silent
    // black hole (bell enabled before push existed, cleared site data, or a
    // server-state wipe) — re-subscribe idempotently and re-register server-side
    useEffect(() => {
        if (!enabled || mode !== 'push') {
            return;
        }
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }
        subscribeToPush()
            .then((subscription) => {
                if (!subscription) {
                    setMode('local');
                }
            })
            .catch((err: unknown) => {
                if (err instanceof Error) {
                    console.error('push re-sync failed:', err.message);
                }
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggle = useCallback(async (): Promise<NotificationToggleResult> => {
        if (enabled) {
            setEnabled(false);
            try {
                await unsubscribeFromPush();
            } catch {}
            return 'disabled';
        }
        if (!('Notification' in window)) {
            return 'unsupported';
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return 'denied';
        }
        // real Web Push first (browser delivers system notifications even with the
        // page closed); page-side notifications remain as the fallback
        try {
            const subscription = await subscribeToPush();
            if (subscription) {
                setMode('push');
                setEnabled(true);
                return 'enabled-push';
            }
        } catch (err) {
            if (err instanceof Error) {
                console.error('push subscription failed:', err.message);
            }
        }
        setMode('local');
        setEnabled(true);
        return 'enabled-local';
    }, [enabled]);

    const notifyForEvent = useCallback(
        async (event: AgentEvent) => {
            if (!enabled || mode === 'push' || !event.notifyWorthy) {
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
        [enabled, mode],
    );

    return { enabled, toggle, notifyForEvent };
}
