'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const KEY_FILE = 'https-key.pem';
const CERT_FILE = 'https-cert.pem';
const CERT_DAYS = 3650;
const CERT_SUBJECT = '/CN=herdr-web';

// the cert must name every address a device might use to reach this machine,
// or browsers reject it even when it is trusted
function subjectAltNames() {
  const names = new Set(['DNS:localhost', 'IP:127.0.0.1', 'IP:::1']);
  const hostname = os.hostname();
  if (hostname) {
    names.add(`DNS:${hostname}`);
    if (!hostname.endsWith('.local')) {
      names.add(`DNS:${hostname}.local`);
    }
  }
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (!address.internal && address.family === 'IPv4') {
        names.add(`IP:${address.address}`);
      }
    }
  }
  return `subjectAltName=${[...names].join(',')}`;
}

function defaultStateDir() {
  return process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'herdr-web');
}

function generateSelfSigned(stateDir) {
  const keyPath = path.join(stateDir, KEY_FILE);
  const certPath = path.join(stateDir, CERT_FILE);
  fs.mkdirSync(stateDir, { recursive: true });
  const result = spawnSync(
    'openssl',
    ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-keyout', keyPath, '-out', certPath,
      '-days', String(CERT_DAYS), '-nodes', '-subj', CERT_SUBJECT, '-addext', subjectAltNames()],
    { encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    return null;
  }
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {}
  return { keyPath, certPath };
}

// resolves TLS material for the https listener: configured paths win; otherwise
// a self-signed cert is generated once into the plugin state dir (needs openssl)
function loadTlsOptions(config, stateDir = defaultStateDir()) {
  let keyPath = config.httpsKeyPath;
  let certPath = config.httpsCertPath;
  if (!keyPath || !certPath) {
    keyPath = path.join(stateDir, KEY_FILE);
    certPath = path.join(stateDir, CERT_FILE);
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      const generated = generateSelfSigned(stateDir);
      if (!generated) {
        return null;
      }
    }
  }
  try {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  } catch {
    return null;
  }
}

// the public certificate the https listener is actually serving (configured
// path if set, otherwise the state-dir self-signed one) — safe to hand out,
// it is sent in every TLS handshake anyway
function activeCertificatePath(config, stateDir = defaultStateDir()) {
  const certPath = config.httpsCertPath || path.join(stateDir, CERT_FILE);
  return fs.existsSync(certPath) ? certPath : null;
}

module.exports = { loadTlsOptions, generateSelfSigned, activeCertificatePath };
