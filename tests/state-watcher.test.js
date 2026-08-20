'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { StateWatcher } = require('../lib/state-watcher');

function makePane(overrides = {}) {
  return {
    pane_id: 'pane-1',
    agent_status: 'working',
    agent: 'claude',
    terminal_title_stripped: 'some title',
    workspace_id: 'ws-1',
    tab_id: 'tab-1',
    ...overrides,
  };
}

describe('StateWatcher.update', () => {
  test('first sighting emits an event with from=null and notifyWorthy=false', () => {
    const watcher = new StateWatcher();
    const events = watcher.update([makePane({ agent_status: 'working' })]);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      type: 'agent_status_changed',
      paneId: 'pane-1',
      from: null,
      to: 'working',
      agent: 'claude',
      title: 'some title',
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      notifyWorthy: false,
    });
  });

  test('first sighting of a blocked pane is not notify-worthy', () => {
    const watcher = new StateWatcher();
    const events = watcher.update([makePane({ agent_status: 'blocked' })]);
    assert.equal(events.length, 1);
    assert.equal(events[0].notifyWorthy, false);
  });

  test('working -> idle emits a notify-worthy event', () => {
    const watcher = new StateWatcher();
    watcher.update([makePane({ agent_status: 'working' })]);
    const events = watcher.update([makePane({ agent_status: 'idle' })]);
    assert.equal(events.length, 1);
    assert.equal(events[0].from, 'working');
    assert.equal(events[0].to, 'idle');
    assert.equal(events[0].notifyWorthy, true);
  });

  test('idle -> blocked emits a notify-worthy event', () => {
    const watcher = new StateWatcher();
    watcher.update([makePane({ agent_status: 'idle' })]);
    const events = watcher.update([makePane({ agent_status: 'blocked' })]);
    assert.equal(events.length, 1);
    assert.equal(events[0].notifyWorthy, true);
  });

  test('idle -> working is not notify-worthy', () => {
    const watcher = new StateWatcher();
    watcher.update([makePane({ agent_status: 'idle' })]);
    const events = watcher.update([makePane({ agent_status: 'working' })]);
    assert.equal(events.length, 1);
    assert.equal(events[0].notifyWorthy, false);
  });

  test('unchanged status emits no event', () => {
    const watcher = new StateWatcher();
    watcher.update([makePane({ agent_status: 'working' })]);
    const events = watcher.update([makePane({ agent_status: 'working' })]);
    assert.deepEqual(events, []);
  });

  test('a pane that disappears and reappears is treated as a first sighting again', () => {
    const watcher = new StateWatcher();
    watcher.update([makePane({ agent_status: 'working' })]);
    assert.deepEqual(watcher.update([]), []);
    const events = watcher.update([makePane({ agent_status: 'working' })]);
    assert.equal(events.length, 1);
    assert.equal(events[0].from, null);
    assert.equal(events[0].notifyWorthy, false);
  });

  test('non-array input returns an empty array and leaves state intact', () => {
    const watcher = new StateWatcher();
    watcher.update([makePane({ agent_status: 'working' })]);
    assert.deepEqual(watcher.update(null), []);
    assert.deepEqual(watcher.update(undefined), []);
    assert.deepEqual(watcher.update('panes'), []);
    assert.deepEqual(watcher.update({}), []);
  });

  test('panes without agent_status or pane_id are skipped', () => {
    const watcher = new StateWatcher();
    const events = watcher.update([
      makePane({ agent_status: undefined }),
      makePane({ pane_id: undefined }),
      null,
      undefined,
      makePane({ pane_id: 'pane-2', agent_status: 'idle' }),
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].paneId, 'pane-2');
  });

  test('tracks multiple panes independently', () => {
    const watcher = new StateWatcher();
    watcher.update([
      makePane({ pane_id: 'a', agent_status: 'working' }),
      makePane({ pane_id: 'b', agent_status: 'idle' }),
    ]);
    const events = watcher.update([
      makePane({ pane_id: 'a', agent_status: 'idle' }),
      makePane({ pane_id: 'b', agent_status: 'idle' }),
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].paneId, 'a');
    assert.equal(events[0].notifyWorthy, true);
  });
});

describe('StateWatcher.notifyWorthy', () => {
  test('leaving working is always notify-worthy', () => {
    assert.equal(StateWatcher.notifyWorthy('working', 'idle'), true);
    assert.equal(StateWatcher.notifyWorthy('working', 'blocked'), true);
  });

  test('entering blocked from a known status is notify-worthy', () => {
    assert.equal(StateWatcher.notifyWorthy('idle', 'blocked'), true);
  });

  test('entering blocked from null (first sighting) is not notify-worthy', () => {
    assert.equal(StateWatcher.notifyWorthy(null, 'blocked'), false);
  });

  test('first sightings and transitions into working are not notify-worthy', () => {
    assert.equal(StateWatcher.notifyWorthy(null, 'working'), false);
    assert.equal(StateWatcher.notifyWorthy(null, 'idle'), false);
    assert.equal(StateWatcher.notifyWorthy('idle', 'working'), false);
    assert.equal(StateWatcher.notifyWorthy('blocked', 'working'), false);
    assert.equal(StateWatcher.notifyWorthy('blocked', 'idle'), false);
  });

  test('same-status transitions are not notify-worthy', () => {
    assert.equal(StateWatcher.notifyWorthy('working', 'working'), false);
    assert.equal(StateWatcher.notifyWorthy('idle', 'idle'), false);
  });
});
