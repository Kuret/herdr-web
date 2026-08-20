import { useEffect, useState } from 'react';
import { Composer } from './components/Composer';
import { PaneTabs } from './components/PaneTabs';
import { Terminal } from './components/Terminal';
import { ToastHost } from './components/ToastHost';
import { TopBar } from './components/TopBar';
import { useHerdrSocket } from './hooks/useHerdrSocket';
import { useNotifications } from './hooks/useNotifications';

const LAST_PANE_STORAGE_KEY = 'herdr-web:last-pane';

export function App() {
    const { connected, workspaces, panes, paneHtml, lastEvent, lastError, send } = useHerdrSocket();
    const { enabled: notificationsEnabled, toggle: toggleNotifications, notifyForEvent } = useNotifications();
    const [activePaneId, setActivePaneId] = useState<string | null>(null);

    useEffect(() => {
        if (!lastEvent) {
            return;
        }
        void notifyForEvent(lastEvent);
    }, [lastEvent, notifyForEvent]);

    useEffect(() => {
        if (activePaneId && !panes.some((pane) => pane.pane_id === activePaneId)) {
            setActivePaneId(null);
        }
    }, [panes, activePaneId]);

    const activatePane = (paneId: string, { remember }: { remember: boolean }) => {
        setActivePaneId(paneId);
        if (remember) {
            localStorage.setItem(LAST_PANE_STORAGE_KEY, paneId);
        }
        send({ type: 'subscribe', paneId });
    };

    const selectPane = (paneId: string) => activatePane(paneId, { remember: true });

    useEffect(() => {
        if (activePaneId !== null || panes.length === 0) {
            return;
        }
        const remembered = localStorage.getItem(LAST_PANE_STORAGE_KEY);
        const rememberedPane = panes.find((pane) => pane.pane_id === remembered);
        // falling back to the first pane must not clobber the remembered choice —
        // the remembered pane may only be transiently absent (agent restarting)
        if (rememberedPane) {
            activatePane(rememberedPane.pane_id, { remember: true });
        } else {
            activatePane(panes[0].pane_id, { remember: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panes, activePaneId]);

    useEffect(() => {
        if (connected && activePaneId) {
            send({ type: 'subscribe', paneId: activePaneId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    return (
        <>
            <TopBar
                connected={connected}
                panes={panes}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={() => void toggleNotifications()}
            />
            <PaneTabs panes={panes} workspaces={workspaces} activePaneId={activePaneId} onSelect={selectPane} />
            <Terminal html={paneHtml} hasPane={activePaneId !== null} />
            <Composer
                disabled={activePaneId === null}
                onSendText={(text) => activePaneId && send({ type: 'send_text', paneId: activePaneId, text })}
                onSendKeys={(keys) => activePaneId && send({ type: 'send_keys', paneId: activePaneId, keys })}
            />
            <ToastHost event={lastEvent} error={lastError} />
        </>
    );
}
