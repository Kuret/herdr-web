'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  runHerdr,
  runHerdrText,
  listWorkspaces,
  listTabs,
  listPanes,
  readPane,
  sendText,
  sendKeys,
  notifyDesktop,
} = require('../lib/herdr');

describe('herdr', () => {
  let savedBinPath;
  let tempDir;
  let stubCount;

  beforeEach(() => {
    savedBinPath = process.env.HERDR_BIN_PATH;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-web-herdr-test-'));
    stubCount = 0;
  });

  afterEach(() => {
    if (savedBinPath === undefined) {
      delete process.env.HERDR_BIN_PATH;
    } else {
      process.env.HERDR_BIN_PATH = savedBinPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function useStub(scriptBody) {
    const file = path.join(tempDir, `stub-${stubCount++}.sh`);
    fs.writeFileSync(file, `#!/bin/sh\n${scriptBody}\n`, { mode: 0o755 });
    process.env.HERDR_BIN_PATH = file;
    return file;
  }

  function useEnvelopeStub(envelope) {
    useStub(`printf '%s' '${JSON.stringify(envelope)}'`);
  }

  function useArgvRecordingStub() {
    const argvFile = path.join(tempDir, `argv-${stubCount}.txt`);
    useStub(`printf '%s\\n' "$@" > '${argvFile}'`);
    return argvFile;
  }

  function recordedArgv(argvFile) {
    return fs.readFileSync(argvFile, 'utf8').split('\n').filter((line) => line.length > 0);
  }

  describe('runHerdr', () => {
    test('parses the JSON envelope and resolves with its result', async () => {
      useEnvelopeStub({ id: 'cli:test', result: { ok: true, count: 2 } });
      assert.deepEqual(await runHerdr(['pane', 'list']), { ok: true, count: 2 });
    });

    test('rejects with stderr included when the binary exits non-zero', async () => {
      useStub(`echo 'boom: no such pane' >&2\nexit 3`);
      await assert.rejects(runHerdr(['pane', 'list']), (error) => {
        assert.match(error.message, /herdr pane list failed/);
        assert.match(error.message, /boom: no such pane/);
        return true;
      });
    });

    test('rejects when stdout is not parseable JSON', async () => {
      useStub(`printf '%s' 'definitely not json'`);
      await assert.rejects(runHerdr(['workspace', 'list']), (error) => {
        assert.match(error.message, /returned unparseable output/);
        assert.match(error.message, /definitely not json/);
        return true;
      });
    });
  });

  describe('runHerdrText', () => {
    test('resolves with raw stdout without JSON parsing', async () => {
      useStub(`printf '%s' 'plain terminal output'`);
      assert.equal(await runHerdrText(['pane', 'read', 'p1']), 'plain terminal output');
    });
  });

  describe('list helpers', () => {
    test('listWorkspaces returns the workspaces array from the envelope', async () => {
      useEnvelopeStub({ id: 'cli:test', result: { workspaces: [{ id: 'w1' }] } });
      assert.deepEqual(await listWorkspaces(), [{ id: 'w1' }]);
    });

    test('listWorkspaces returns [] when the result lacks a workspaces array', async () => {
      useEnvelopeStub({ id: 'cli:test', result: {} });
      assert.deepEqual(await listWorkspaces(), []);
    });

    test('listTabs returns [] when the result lacks a tabs array', async () => {
      useEnvelopeStub({ id: 'cli:test', result: {} });
      assert.deepEqual(await listTabs(), []);
    });

    test('listPanes returns [] when the result lacks a panes array', async () => {
      useEnvelopeStub({ id: 'cli:test', result: {} });
      assert.deepEqual(await listPanes(), []);
    });
  });

  describe('readPane', () => {
    test('passes explicit lines and format through to the binary', async () => {
      const argvFile = useArgvRecordingStub();
      await readPane('pane-7', { lines: 50, format: 'text' });
      assert.deepEqual(recordedArgv(argvFile), [
        'pane',
        'read',
        'pane-7',
        '--lines',
        '50',
        '--format',
        'text',
      ]);
    });

    test('defaults to 200 lines and ansi format', async () => {
      const argvFile = useArgvRecordingStub();
      await readPane('pane-7');
      assert.deepEqual(recordedArgv(argvFile), [
        'pane',
        'read',
        'pane-7',
        '--lines',
        '200',
        '--format',
        'ansi',
      ]);
    });

    test('rejects with TypeError for a non-string paneId', async () => {
      await assert.rejects(readPane(42), TypeError);
    });
  });

  describe('sendText', () => {
    test('sends the text as a single argument', async () => {
      const argvFile = useArgvRecordingStub();
      await sendText('pane-7', 'echo hi');
      assert.deepEqual(recordedArgv(argvFile), ['pane', 'send-text', 'pane-7', 'echo hi']);
    });

    test('rejects with TypeError for an empty paneId', async () => {
      await assert.rejects(sendText('', 'hi'), TypeError);
    });

    test('rejects with TypeError for non-string text', async () => {
      await assert.rejects(sendText('pane-7', { text: 'hi' }), TypeError);
    });
  });

  describe('sendKeys', () => {
    test('spreads the keys into the argument list', async () => {
      const argvFile = useArgvRecordingStub();
      await sendKeys('pane-7', ['ctrl-c', 'enter']);
      assert.deepEqual(recordedArgv(argvFile), ['pane', 'send-keys', 'pane-7', 'ctrl-c', 'enter']);
    });

    test('rejects with TypeError for an empty keys array', async () => {
      await assert.rejects(sendKeys('pane-7', []), TypeError);
    });

    test('rejects with TypeError when keys contains non-strings', async () => {
      await assert.rejects(sendKeys('pane-7', ['enter', 13]), TypeError);
    });

    test('rejects with TypeError for a missing paneId', async () => {
      await assert.rejects(sendKeys(undefined, ['enter']), TypeError);
    });
  });

  describe('notifyDesktop', () => {
    test('resolves without throwing when the binary is missing', async () => {
      process.env.HERDR_BIN_PATH = path.join(tempDir, 'no-such-binary');
      await assert.doesNotReject(notifyDesktop('Title', 'Body'));
    });

    test('passes title and --body through to the binary', async () => {
      const argvFile = useArgvRecordingStub();
      await notifyDesktop('Agent done', 'pane-7 finished');
      assert.deepEqual(recordedArgv(argvFile), [
        'notification',
        'show',
        'Agent done',
        '--body',
        'pane-7 finished',
      ]);
    });
  });
});
