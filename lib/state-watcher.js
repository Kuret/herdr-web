'use strict';

class StateWatcher {
  static EVENT_AGENT_STATUS_CHANGED = 'agent_status_changed';
  static STATUS_WORKING = 'working';
  static STATUS_BLOCKED = 'blocked';

  constructor() {
    this._lastByPane = new Map();
  }

  update(panes) {
    if (!Array.isArray(panes)) {
      return [];
    }
    const events = StateWatcher.diff(this._lastByPane, panes);
    // Rebuild from scratch so panes that disappeared are dropped.
    const nextByPane = new Map();
    for (const pane of panes) {
      if (!pane || !pane.pane_id || !pane.agent_status) {
        continue;
      }
      nextByPane.set(pane.pane_id, pane.agent_status);
    }
    this._lastByPane = nextByPane;
    return events;
  }

  static diff(prevMap, panes) {
    if (!(prevMap instanceof Map) || !Array.isArray(panes)) {
      return [];
    }
    const events = [];
    for (const pane of panes) {
      if (!pane || !pane.pane_id || !pane.agent_status) {
        continue;
      }
      const from = prevMap.has(pane.pane_id) ? prevMap.get(pane.pane_id) : null;
      const to = pane.agent_status;
      if (from === to) {
        continue;
      }
      events.push({
        type: StateWatcher.EVENT_AGENT_STATUS_CHANGED,
        paneId: pane.pane_id,
        from,
        to,
        agent: pane.agent,
        title: pane.terminal_title_stripped,
        workspaceId: pane.workspace_id,
        tabId: pane.tab_id,
        notifyWorthy: StateWatcher.notifyWorthy(from, to),
      });
    }
    return events;
  }

  static notifyWorthy(from, to) {
    if (from === StateWatcher.STATUS_WORKING && to !== StateWatcher.STATUS_WORKING) {
      return true;
    }
    return to === StateWatcher.STATUS_BLOCKED && from !== null;
  }
}

module.exports = { StateWatcher };
