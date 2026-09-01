'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const webPush = require('web-push');

class PushService {
    static VAPID_FILE = 'vapid-keys.json';

    static SUBSCRIPTIONS_FILE = 'push-subscriptions.json';

    static VAPID_SUBJECT = 'https://github.com/barnuri/herdr-web';

    // push-service responses that mean the subscription is dead and must be pruned
    static GONE_STATUS_CODES = [404, 410];

    constructor(stateDir = PushService.defaultStateDir()) {
        this.stateDir = stateDir;
        this.keys = this.loadOrCreateVapidKeys();
        this.subscriptions = this.loadSubscriptions();
    }

    static defaultStateDir() {
        return process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'herdr-web');
    }

    get publicKey() {
        return this.keys.publicKey;
    }

    get subscriptionCount() {
        return this.subscriptions.length;
    }

    loadOrCreateVapidKeys() {
        const keysPath = path.join(this.stateDir, PushService.VAPID_FILE);
        try {
            const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
            if (typeof keys.publicKey === 'string' && typeof keys.privateKey === 'string') {
                return keys;
            }
        } catch {}
        const keys = webPush.generateVAPIDKeys();
        try {
            fs.mkdirSync(this.stateDir, { recursive: true });
            fs.writeFileSync(keysPath, `${JSON.stringify(keys)}\n`, { encoding: 'utf8', mode: 0o600 });
        } catch (error) {
            process.stderr.write(`herdr-web: failed to persist VAPID keys: ${error.message}\n`);
        }
        return keys;
    }

    subscriptionsPath() {
        return path.join(this.stateDir, PushService.SUBSCRIPTIONS_FILE);
    }

    loadSubscriptions() {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.subscriptionsPath(), 'utf8'));
            if (Array.isArray(parsed)) {
                return parsed.filter((sub) => sub && typeof sub.endpoint === 'string');
            }
        } catch {}
        return [];
    }

    persistSubscriptions() {
        try {
            fs.mkdirSync(this.stateDir, { recursive: true });
            fs.writeFileSync(this.subscriptionsPath(), `${JSON.stringify(this.subscriptions)}\n`, { encoding: 'utf8', mode: 0o600 });
        } catch (error) {
            process.stderr.write(`herdr-web: failed to persist push subscriptions: ${error.message}\n`);
        }
    }

    addSubscription(subscription) {
        if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length === 0) {
            return false;
        }
        this.subscriptions = this.subscriptions.filter((existing) => existing.endpoint !== subscription.endpoint);
        // subscriptions stored before this flag existed stay on the quiet setting
        this.subscriptions.push({ ...subscription, allChanges: subscription.allChanges === true });
        this.persistSubscriptions();
        return true;
    }

    removeSubscription(endpoint) {
        if (typeof endpoint !== 'string') {
            return false;
        }
        const before = this.subscriptions.length;
        this.subscriptions = this.subscriptions.filter((existing) => existing.endpoint !== endpoint);
        if (this.subscriptions.length !== before) {
            this.persistSubscriptions();
        }
        return this.subscriptions.length !== before;
    }

    // one-off push to a single subscription (used as the "it works" confirmation
    // right after subscribing)
    async notifyOne(subscription, payload) {
        const options = {
            vapidDetails: { subject: PushService.VAPID_SUBJECT, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey },
            TTL: 60,
        };
        try {
            await webPush.sendNotification(subscription, JSON.stringify(payload), options);
            return true;
        } catch (error) {
            process.stderr.write(`herdr-web: confirmation push failed (${error?.statusCode || error?.message})\n`);
            return false;
        }
    }

    // seam for tests: the one place a subscription actually hits the network
    sendTo(subscription, body, options) {
        return webPush.sendNotification(subscription, body, options);
    }

    // fire-and-forget: a dead subscription (uninstalled PWA, cleared site data)
    // is pruned on the push service's 404/410 answer
    // `routine` marks a transition that is not "needs attention" or "finished":
    // only devices that opted into every state change hear about those.
    async notifyAll(payload, { routine = false } = {}) {
        const targets = routine ? this.subscriptions.filter((sub) => sub.allChanges === true) : this.subscriptions;
        if (targets.length === 0) {
            return;
        }
        const body = JSON.stringify(payload);
        const options = {
            vapidDetails: { subject: PushService.VAPID_SUBJECT, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey },
            TTL: 60,
        };
        const results = await Promise.allSettled(targets.map((subscription) => this.sendTo(subscription, body, options)));
        const deadEndpoints = [];
        results.forEach((result, index) => {
            if (result.status !== 'rejected') {
                return;
            }
            if (PushService.GONE_STATUS_CODES.includes(result.reason?.statusCode)) {
                deadEndpoints.push(targets[index].endpoint);
                return;
            }
            process.stderr.write(`herdr-web: push delivery failed (${result.reason?.statusCode || result.reason?.message}) for ${targets[index].endpoint.slice(0, 60)}…\n`);
        });
        if (deadEndpoints.length > 0) {
            this.subscriptions = this.subscriptions.filter((sub) => !deadEndpoints.includes(sub.endpoint));
            this.persistSubscriptions();
        }
    }
}

module.exports = { PushService };
