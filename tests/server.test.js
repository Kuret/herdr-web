'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HerdrWebServer } = require('../server');

function makeConfig(overrides = {}) {
  return {
    host: '127.0.0.1',
    port: 0,
    topologyPollMs: 2000,
    panePollMs: 1000,
    readLines: 200,
    allowedOrigins: [],
    ...overrides,
  };
}

function makeSocket() {
  const sent = [];
  return {
    readyState: 1,
    OPEN: 1,
    send: (raw) => sent.push(JSON.parse(raw)),
    sent,
  };
}

// fake req/res pair for serveStatic; res.finished resolves once end() is
// called so the async fs.readFile path can be awaited
function makeRes() {
  const res = { statusCode: null, headers: null, body: null };
  res.finished = new Promise((resolve) => {
    res.writeHead = (status, headers) => {
      res.statusCode = status;
      res.headers = headers || null;
    };
    res.end = (data) => {
      res.body = data;
      resolve();
    };
  });
  return res;
}

describe('HerdrWebServer', () => {
  describe('isAllowedOrigin', () => {
    const req = { headers: { host: '127.0.0.1:7936' } };

    test('missing origin is allowed (non-browser clients)', () => {
      const server = new HerdrWebServer(makeConfig());
      assert.equal(server.isAllowedOrigin(undefined, req), true);
      assert.equal(server.isAllowedOrigin('', req), true);
    });

    test('origin whose host matches the request host is allowed', () => {
      const server = new HerdrWebServer(makeConfig());
      assert.equal(server.isAllowedOrigin('http://127.0.0.1:7936', req), true);
    });

    test('origin whose host does not match the request host is rejected', () => {
      const server = new HerdrWebServer(makeConfig());
      assert.equal(server.isAllowedOrigin('http://evil.example.com', req), false);
      assert.equal(server.isAllowedOrigin('http://127.0.0.1:9999', req), false);
    });

    test('malformed origin string is rejected, not thrown', () => {
      const server = new HerdrWebServer(makeConfig());
      assert.equal(server.isAllowedOrigin('not a url', req), false);
    });

    test('explicitly configured allowedOrigins entry is accepted despite host mismatch', () => {
      const server = new HerdrWebServer(makeConfig({ allowedOrigins: ['https://phone.example.com'] }));
      assert.equal(server.isAllowedOrigin('https://phone.example.com', req), true);
    });
  });

  describe('serveStatic', () => {
    let server;

    beforeEach(() => {
      server = new HerdrWebServer(makeConfig());
    });

    test('malformed percent-encoding returns 400 instead of throwing', async () => {
      const res = makeRes();
      server.serveStatic({ url: '/%zz', headers: {} }, res);
      await res.finished;
      assert.equal(res.statusCode, 400);
    });

    test('null byte in the path returns 400', async () => {
      const res = makeRes();
      server.serveStatic({ url: '/%00', headers: {} }, res);
      await res.finished;
      assert.equal(res.statusCode, 400);
    });

    test('plain ../ traversal never serves files outside public/', async () => {
      const res = makeRes();
      server.serveStatic({ url: '/../server.js', headers: {} }, res);
      await res.finished;
      assert.ok([403, 404].includes(res.statusCode), `expected 403/404, got ${res.statusCode}`);
    });

    test('encoded-slash ../ traversal is rejected with 403', async () => {
      const res = makeRes();
      server.serveStatic({ url: '/..%2Fserver.js', headers: {} }, res);
      await res.finished;
      assert.equal(res.statusCode, 403);
    });

    test('/index.html is served from public/ with the html mime type', async () => {
      const res = makeRes();
      server.serveStatic({ url: '/index.html', headers: {} }, res);
      await res.finished;
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
      assert.ok(res.body.length > 0);
    });

    test('/ maps to index.html', async () => {
      const res = makeRes();
      server.serveStatic({ url: '/', headers: {} }, res);
      await res.finished;
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
    });
  });

  describe('handleMessage', () => {
    let server;
    let savedBinPath;
    let tempDir;
    let argsLog;

    beforeEach(() => {
      server = new HerdrWebServer(makeConfig());
      savedBinPath = process.env.HERDR_BIN_PATH;
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-web-server-test-'));
      argsLog = path.join(tempDir, 'args.log');
      const stubPath = path.join(tempDir, 'herdr-stub');
      fs.writeFileSync(stubPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${argsLog}'\nprintf 'stub pane output'\n`, { mode: 0o755 });
      process.env.HERDR_BIN_PATH = stubPath;
    });

    afterEach(() => {
      if (savedBinPath === undefined) {
        delete process.env.HERDR_BIN_PATH;
      } else {
        process.env.HERDR_BIN_PATH = savedBinPath;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function loggedArgs() {
      return fs.existsSync(argsLog) ? fs.readFileSync(argsLog, 'utf8').trim().split('\n') : [];
    }

    test('unknown message type replies with an error', async () => {
      const socket = makeSocket();
      await server.handleMessage(socket, { type: 'bogus' });
      assert.deepEqual(socket.sent, [{ type: 'error', message: 'unknown message type: bogus' }]);
    });

    test('subscribe with a non-string paneId falls through to the unknown-type error', async () => {
      const socket = makeSocket();
      await server.handleMessage(socket, { type: 'subscribe', paneId: 42 });
      assert.equal(server.subscriptions.size, 0);
      assert.deepEqual(socket.sent, [{ type: 'error', message: 'unknown message type: subscribe' }]);
    });

    test('subscribe registers the socket and pushes the pane output', async () => {
      const socket = makeSocket();
      await server.handleMessage(socket, { type: 'subscribe', paneId: 'pane-1' });
      assert.equal(server.subscriptions.get(socket), 'pane-1');
      assert.equal(socket.sent.length, 1);
      assert.equal(socket.sent[0].type, 'pane_output');
      assert.equal(socket.sent[0].paneId, 'pane-1');
      assert.ok(socket.sent[0].html.includes('stub pane output'));
      assert.deepEqual(loggedArgs(), ['pane read pane-1 --lines 200 --format ansi']);
    });

    test('unsubscribe removes the subscription', async () => {
      const socket = makeSocket();
      server.subscriptions.set(socket, 'pane-1');
      await server.handleMessage(socket, { type: 'unsubscribe' });
      assert.equal(server.subscriptions.has(socket), false);
      assert.deepEqual(socket.sent, []);
    });

    test('send_text forwards to herdr and pushes fresh pane output to subscribers', async () => {
      const socket = makeSocket();
      server.subscriptions.set(socket, 'pane-1');
      await server.handleMessage(socket, { type: 'send_text', paneId: 'pane-1', text: 'hello' });
      assert.deepEqual(loggedArgs(), [
        'pane send-text pane-1 hello',
        'pane read pane-1 --lines 200 --format ansi',
      ]);
      assert.equal(socket.sent.length, 1);
      assert.equal(socket.sent[0].type, 'pane_output');
    });

    test('send_text with a non-string text falls through to the unknown-type error', async () => {
      const socket = makeSocket();
      await server.handleMessage(socket, { type: 'send_text', paneId: 'pane-1', text: 42 });
      assert.deepEqual(loggedArgs(), []);
      assert.deepEqual(socket.sent, [{ type: 'error', message: 'unknown message type: send_text' }]);
    });

    test('send_keys forwards each key to herdr', async () => {
      const socket = makeSocket();
      await server.handleMessage(socket, { type: 'send_keys', paneId: 'pane-1', keys: ['Enter'] });
      assert.deepEqual(loggedArgs(), [
        'pane send-keys pane-1 Enter',
        'pane read pane-1 --lines 200 --format ansi',
      ]);
    });

    test('send_keys with an empty keys array falls through to the unknown-type error', async () => {
      const socket = makeSocket();
      await server.handleMessage(socket, { type: 'send_keys', paneId: 'pane-1', keys: [] });
      assert.deepEqual(loggedArgs(), []);
      assert.deepEqual(socket.sent, [{ type: 'error', message: 'unknown message type: send_keys' }]);
    });
  });

  describe('subscribedPaneIds', () => {
    test('dedupes two sockets subscribed to the same pane', () => {
      const server = new HerdrWebServer(makeConfig());
      server.subscriptions.set(makeSocket(), 'pane-1');
      server.subscriptions.set(makeSocket(), 'pane-1');
      server.subscriptions.set(makeSocket(), 'pane-2');
      assert.deepEqual(server.subscribedPaneIds().sort(), ['pane-1', 'pane-2']);
    });

    test('returns an empty list with no subscriptions', () => {
      const server = new HerdrWebServer(makeConfig());
      assert.deepEqual(server.subscribedPaneIds(), []);
    });
  });

  describe('send', () => {
    test('skips sockets that are not open', () => {
      const server = new HerdrWebServer(makeConfig());
      const socket = makeSocket();
      socket.readyState = 3;
      server.send(socket, { type: 'topology' });
      assert.deepEqual(socket.sent, []);
    });
  });
});
