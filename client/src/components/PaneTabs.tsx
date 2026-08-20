import { paneDisplayName, statusDotClass } from '../lib/status';
import type { HerdrPane, HerdrWorkspace } from '../types';

interface PaneTabsProps {
    readonly panes: HerdrPane[];
    readonly workspaces: HerdrWorkspace[];
    readonly activePaneId: string | null;
    readonly onSelect: (paneId: string) => void;
}

export function PaneTabs({ panes, workspaces, activePaneId, onSelect }: PaneTabsProps) {
    const workspaceNumberById = new Map(workspaces.map((ws) => [ws.workspace_id, ws.number]));
    return (
        <nav className="pane-tabs" aria-label="panes">
            {panes.map((pane) => {
                const wsNumber = workspaceNumberById.get(pane.workspace_id);
                return (
                    <button
                        key={pane.pane_id}
                        type="button"
                        className={pane.pane_id === activePaneId ? 'pane-chip active' : 'pane-chip'}
                        onClick={() => onSelect(pane.pane_id)}
                    >
                        <span className={`status-dot ${statusDotClass(pane.agent_status)}`} />
                        <span>{paneDisplayName(pane.terminal_title_stripped, pane.foreground_cwd ?? pane.cwd, pane.pane_id)}</span>
                        {wsNumber !== undefined && <span className="chip-ws">w{wsNumber}</span>}
                    </button>
                );
            })}
        </nav>
    );
}
