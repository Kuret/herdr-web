'use strict';

const { spawnSync } = require('child_process');
const { loadConfig } = require('../lib/config');

const NOTIFY_ONLY_FLAG = '--notify-only';

function herdrBinPath() {
  return process.env.HERDR_BIN_PATH || 'herdr';
}

function reportSpawnFailure(action, result) {
  const reason = result.error ? result.error.message : `exit code ${result.status}`;
  process.stderr.write(`herdr-web: ${action} failed: ${reason}\n`);
}

function showNotification(url) {
  const args = ['notification', 'show', 'Herdr Web', '--body', url];
  const result = spawnSync(herdrBinPath(), args, { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    reportSpawnFailure('notification', result);
  }
}

function browserOpenerCommand() {
  if (process.platform === 'darwin') {
    return 'open';
  }
  if (process.platform === 'linux') {
    return 'xdg-open';
  }
  return null;
}

function openInBrowser(url) {
  const opener = browserOpenerCommand();
  if (!opener) {
    // No known opener for this platform; the URL printed by main() is the fallback.
    return;
  }
  const result = spawnSync(opener, [url], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    reportSpawnFailure(`open browser via ${opener}`, result);
  }
}

function main() {
  const config = loadConfig();
  const url = `http://${config.host}:${config.port}`;

  if (process.argv.includes(NOTIFY_ONLY_FLAG)) {
    showNotification(url);
    process.exit(0);
  }

  openInBrowser(url);
  process.stdout.write(`${url}\n`);
  process.exit(0);
}

main();
