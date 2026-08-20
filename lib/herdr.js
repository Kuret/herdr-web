'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const HERDR_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_READ_LINES = 200;
const DEFAULT_READ_FORMAT = 'ansi';

function herdrBinaryPath() {
  return process.env.HERDR_BIN_PATH || 'herdr';
}

function assertPaneId(paneId) {
  if (typeof paneId !== 'string' || paneId.length === 0) {
    throw new TypeError('paneId must be a non-empty string');
  }
}

async function execHerdr(args) {
  try {
    const { stdout } = await execFileAsync(herdrBinaryPath(), args, {
      encoding: 'utf8',
      maxBuffer: HERDR_MAX_BUFFER_BYTES,
    });
    return stdout;
  } catch (error) {
    const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
    throw new Error(`herdr ${args.join(' ')} failed: ${stderr || error.message}`);
  }
}

async function runHerdr(args) {
  const stdout = await execHerdr(args);
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error(`herdr ${args.join(' ')} returned unparseable output: ${stdout.trim()}`);
  }
  return envelope.result;
}

async function runHerdrText(args) {
  return execHerdr(args);
}

async function listWorkspaces() {
  return (await runHerdr(['workspace', 'list'])).workspaces || [];
}

async function listTabs() {
  return (await runHerdr(['tab', 'list'])).tabs || [];
}

async function listPanes() {
  return (await runHerdr(['pane', 'list'])).panes || [];
}

async function readPane(paneId, { lines = DEFAULT_READ_LINES, format = DEFAULT_READ_FORMAT } = {}) {
  assertPaneId(paneId);
  return runHerdrText(['pane', 'read', paneId, '--lines', String(lines), '--format', format]);
}

async function sendText(paneId, text) {
  assertPaneId(paneId);
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  return runHerdrText(['pane', 'send-text', paneId, text]);
}

async function sendKeys(paneId, keys) {
  assertPaneId(paneId);
  if (!Array.isArray(keys) || keys.length === 0 || keys.some((key) => typeof key !== 'string')) {
    throw new TypeError('keys must be a non-empty array of strings');
  }
  return runHerdrText(['pane', 'send-keys', paneId, ...keys]);
}

async function notifyDesktop(title, body) {
  try {
    await runHerdrText(['notification', 'show', title, '--body', body]);
  } catch (error) {
    // Notifications are best-effort; never let a failed toast break the caller.
    console.error(`herdr notification failed: ${error.message}`);
  }
}

module.exports = {
  runHerdr,
  runHerdrText,
  listWorkspaces,
  listTabs,
  listPanes,
  readPane,
  sendText,
  sendKeys,
  notifyDesktop,
};
