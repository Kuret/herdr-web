import { useEffect, useState } from 'react';
import { Composer } from './components/Composer';
import { ToastHost } from './components/ToastHost';
import { TopBar } from './components/TopBar';
import { XTermView } from './components/XTermView';
import { browserNotificationSettingsUrl } from './lib/notifications';
import { useHerdrSocket } from './hooks/useHerdrSocket';
import { useNotifications } from './hooks/useNotifications';
import type { Notice } from './components/ToastHost';
import type { NotificationToggleResult } from './hooks/useNotifications';

const TOGGLE_NOTICES: Readonly<Record<NotificationToggleResult, Notice['text']>> = {
    'enabled-push': 'Push notifications on — delivered by the browser even when this page is closed',
    'enabled-local': 'Notifications on while this page is open (push unavailable in this browser)',
    disabled: 'Notifications off',
    unsupported: 'Notifications need HTTPS (or localhost) — open via Tailscale/HTTPS to enable',
    denied: 'Notification permission denied — allow it in browser site settings',
};

let nextNoticeId = 0;

export function App() {
    const { connected, panes, lastEvent, lastError, send, subscribeTerminal } = useHerdrSocket();
    const { enabled: notificationsEnabled, toggle: toggleNotifications, notifyForEvent } = useNotifications();
    const [notice, setNotice] = useState<Notice | null>(null);

    useEffect(() => {
        if (!lastEvent) {
            return;
        }
        void notifyForEvent(lastEvent);
    }, [lastEvent, notifyForEvent]);

    const onToggleNotifications = async () => {
        const result = await toggleNotifications();
        let text = TOGGLE_NOTICES[result];
        if (result === 'denied') {
            const settingsUrl = browserNotificationSettingsUrl(navigator.userAgent);
            try {
                await navigator.clipboard.writeText(settingsUrl);
                text = `Notifications blocked — settings address copied, paste it in a new tab and allow this site: ${settingsUrl}`;
            } catch {
                text = `Notifications blocked — open ${settingsUrl} in a new tab and allow this site`;
            }
        }
        nextNoticeId += 1;
        setNotice({
            id: nextNoticeId,
            text,
            tone: result === 'unsupported' || result === 'denied' ? 'warn' : 'info',
        });
    };

    return (
        <>
            <TopBar
                connected={connected}
                panes={panes}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={() => void onToggleNotifications()}
            />
            <XTermView connected={connected} send={send} subscribeTerminal={subscribeTerminal} />
            <Composer disabled={!connected} onSendBytes={(bytes) => send({ type: 'input', data: bytes })} />
            <ToastHost event={lastEvent} error={lastError} notice={notice} />
        </>
    );
}
