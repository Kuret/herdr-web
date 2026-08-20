export interface HerdrPane {
    readonly pane_id: string;
    readonly tab_id: string;
    readonly workspace_id: string;
    readonly cwd?: string;
    readonly foreground_cwd?: string;
    readonly agent?: string;
    readonly agent_status?: string;
    readonly terminal_title?: string;
    readonly terminal_title_stripped?: string;
    readonly focused?: boolean;
}

export interface HerdrWorkspace {
    readonly workspace_id: string;
    readonly label: string;
    readonly number: number;
    readonly focused: boolean;
    readonly agent_status?: string;
}

export interface AgentEvent {
    readonly type: 'agent_status_changed';
    readonly paneId: string;
    readonly from: string | null;
    readonly to: string;
    readonly agent?: string;
    readonly title?: string;
    readonly workspaceId?: string;
    readonly tabId?: string;
    readonly notifyWorthy: boolean;
}

export type ServerMessage =
    | { type: 'topology'; workspaces: HerdrWorkspace[]; panes: HerdrPane[] }
    | { type: 'pane_output'; paneId: string; html: string }
    | { type: 'agent_event'; event: AgentEvent }
    | { type: 'error'; message: string };

export type ClientMessage =
    | { type: 'subscribe'; paneId: string }
    | { type: 'unsubscribe' }
    | { type: 'send_text'; paneId: string; text: string }
    | { type: 'send_keys'; paneId: string; keys: string[] }
    | { type: 'refresh_topology' };
