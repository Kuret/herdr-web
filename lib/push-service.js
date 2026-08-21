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
        this.subscriptions.push(subscription);
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

    // fire-and-forget: a dead subscription (uninstalled PWA, cleared site data)
    // is pruned on the push service's 404/410 answer
    async notifyAll(payload) {
        if (this.subscriptions.length === 0) {
            return;
        }
        const body = JSON.stringify(payload);
        const options = {
            vapidDetails: { subject: PushService.VAPID_SUBJECT, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey },
            TTL: 60,
        };
        const results = await Promise.allSettled(
            this.subscriptions.map((subscription) => webPush.sendNotification(subscription, body, options)),
        );
        const deadEndpoints = [];
        results.forEach((result, index) => {
            if (result.status === 'rejected' && PushService.GONE_STATUS_CODES.includes(result.reason?.statusCode)) {
                deadEndpoints.push(this.subscriptions[index].endpoint);
            }
        });
        if (deadEndpoints.length > 0) {
            this.subscriptions = this.subscriptions.filter((sub) => !deadEndpoints.includes(sub.endpoint));
            this.persistSubscriptions();
        }
    }
}

module.exports = { PushService };
