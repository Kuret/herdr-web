'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test, beforeEach, afterEach } = require('node:test');

const { PushService } = require('../lib/push-service');

let stateDir;

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-push-'));
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

function makeService() {
  return new PushService(stateDir);
}

describe('addSubscription', () => {
  test('records the verbosity the device asked for', () => {
    const service = makeService();
    assert.equal(service.addSubscription({ endpoint: 'https://push.example/a', allChanges: true }), true);
    assert.equal(service.subscriptions[0].allChanges, true);
  });

  test('defaults an unflagged subscription to the quiet setting', () => {
    const service = makeService();
    service.addSubscription({ endpoint: 'https://push.example/a' });
    assert.equal(service.subscriptions[0].allChanges, false);
  });

  test('re-subscribing the same endpoint replaces its verbosity', () => {
    const service = makeService();
    service.addSubscription({ endpoint: 'https://push.example/a', allChanges: false });
    service.addSubscription({ endpoint: 'https://push.example/a', allChanges: true });
    assert.equal(service.subscriptionCount, 1);
    assert.equal(service.subscriptions[0].allChanges, true);
  });

  test('rejects a subscription with no endpoint', () => {
    const service = makeService();
    assert.equal(service.addSubscription({}), false);
    assert.equal(service.subscriptionCount, 0);
  });
});

describe('notifyAll routing', () => {
  function makeSpyService(sent) {
    const service = makeService();
    // stub the network hop: only the target selection is under test here
    service.sendTo = (subscription) => sent.push(subscription.endpoint);
    return service;
  }

  test('routine events reach only devices that opted into every change', async () => {
    const sent = [];
    const service = makeSpyService(sent);
    service.addSubscription({ endpoint: 'https://push.example/quiet', allChanges: false });
    service.addSubscription({ endpoint: 'https://push.example/loud', allChanges: true });

    await service.notifyAll({ title: 't' }, { routine: true });
    assert.deepEqual(sent, ['https://push.example/loud']);
  });

  test('attention and finished events reach every device', async () => {
    const sent = [];
    const service = makeSpyService(sent);
    service.addSubscription({ endpoint: 'https://push.example/quiet', allChanges: false });
    service.addSubscription({ endpoint: 'https://push.example/loud', allChanges: true });

    await service.notifyAll({ title: 't' });
    assert.deepEqual(sent.sort(), ['https://push.example/loud', 'https://push.example/quiet']);
  });

  test('a routine event with no loud device sends nothing', async () => {
    const sent = [];
    const service = makeSpyService(sent);
    service.addSubscription({ endpoint: 'https://push.example/quiet', allChanges: false });

    await service.notifyAll({ title: 't' }, { routine: true });
    assert.deepEqual(sent, []);
  });
});
