'use strict';
// npm strips the exec bit from node-pty's prebuilt spawn-helper, which makes every
// pty.spawn fail with "posix_spawnp failed" — restore it after install (unix only).
const fs = require('node:fs');
const path = require('node:path');

if (process.platform === 'win32') {
    process.exit(0);
}
const prebuildsDir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
let entries = [];
try {
    entries = fs.readdirSync(prebuildsDir);
} catch {
    process.exit(0);
}
for (const entry of entries) {
    const helper = path.join(prebuildsDir, entry, 'spawn-helper');
    try {
        fs.chmodSync(helper, 0o755);
    } catch {}
}
