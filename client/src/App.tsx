import { useEffect, useState } from 'react';
import { Composer } from './components/Composer';
import { ToastHost } from './components/ToastHost';
import { TopBar } from './components/TopBar';
import { XTermView } from './components/XTermView';
import { NotificationHelp } from './components/NotificationHelp';
import { insecureContextHelp, notificationSettingsHelp } from './lib/notifications';
import type { NotificationSettingsHelp } from './lib/notifications';
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

const HAS_COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;
const KEYBOARD_STORAGE_KEY = 'herdr-web:keyboard-enabled';

function initialKeyboardEnabled(): boolean {
    const stored = localStorage.getItem(KEYBOARD_STORAGE_KEY);
    if (stored === 'true' || stored === 'false') {
        return stored === 'true';
    }
    return !HAS_COARSE_POINTER;
}

export function App() {
    const { connected, panes, lastEvent, lastError, send, subscribeTerminal } = useHerdrSocket();
    const { enabled: notificationsEnabled, toggle: toggleNotifications, notifyForEvent } = useNotifications();
    const [notice, setNotice] = useState<Notice | null>(null);
    const [keyboardEnabled, setKeyboardEnabled] = useState(initialKeyboardEnabled);

    useEffect(() => {
        localStorage.setItem(KEYBOARD_STORAGE_KEY, String(keyboardEnabled));
    }, [keyboardEnabled]);
    const [help, setHelp] = useState<NotificationSettingsHelp | null>(null);

    useEffect(() => {
        if (!lastEvent) {
            return;
        }
        void notifyForEvent(lastEvent);
    }, [lastEvent, notifyForEvent]);

    // iOS ignores interactive-widget=resizes-content, so track the visual
    // viewport by hand: the app shrinks and the quick-keys bar rides above the
    // on-screen keyboard instead of being covered by it
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) {
            return;
        }
        const apply = () => {
            const keyboardShowing = viewport.height < window.innerHeight - 1;
            document.documentElement.style.setProperty('--app-height', keyboardShowing ? `${viewport.height}px` : '100%');
        };
        viewport.addEventListener('resize', apply);
        apply();
        return () => viewport.removeEventListener('resize', apply);
    }, []);

    const onToggleNotifications = async () => {
        const result = await toggleNotifications();
        if (result === 'denied') {
            setHelp(notificationSettingsHelp(navigator.userAgent));
            return;
        }
        if (result === 'unsupported') {
            let httpsUrl: string | null = null;
            try {
                const meta = (await (await fetch('/meta')).json()) as { https: boolean; httpsPort: number };
                if (meta.https) {
                    httpsUrl = `https://${window.location.hostname}:${meta.httpsPort}/`;
                }
            } catch {}
            setHelp(insecureContextHelp(httpsUrl));
            return;
        }
        nextNoticeId += 1;
        setNotice({
            id: nextNoticeId,
            text: TOGGLE_NOTICES[result],
            tone: 'info',
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
            <XTermView connected={connected} keyboardEnabled={keyboardEnabled} send={send} subscribeTerminal={subscribeTerminal} />
            <Composer
                disabled={!connected}
                keyboardEnabled={keyboardEnabled}
                onToggleKeyboard={() => setKeyboardEnabled((current) => !current)}
                onSendBytes={(bytes) => send({ type: 'input', data: bytes })}
            />
            <ToastHost event={lastEvent} error={lastError} notice={notice} />
            <NotificationHelp help={help} onClose={() => setHelp(null)} />
        </>
    );
}
