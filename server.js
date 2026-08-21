#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');

const { loadConfig } = require('./lib/config');
const herdr = require('./lib/herdr');
const { PtySession } = require('./lib/pty-session');
const { PushService } = require('./lib/push-service');
const { StateWatcher } = require('./lib/state-watcher');

class HerdrWebServer {
    static PUBLIC_DIR = path.join(__dirname, 'public');

    static MIME_TYPES = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.webmanifest': 'application/manifest+json',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
    };

    static MAX_PUSH_BODY_BYTES = 16 * 1024;

    constructor(config, pushService = new PushService()) {
        this.config = config;
        this.watcher = new StateWatcher();
        this.push = pushService;
        this.clients = new Set();
        this.ptyBySocket = new Map();
        this.lastTopology = null;
        this.topologyTimer = null;
    }

    start() {
        const httpServer = http.createServer((req, res) => this.handleHttp(req, res));
        httpServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                process.stderr.write(`herdr-web: ${this.config.host}:${this.config.port} is already in use — is another instance running?\n`);
                process.exit(1);
            }
            throw error;
        });
        this.wss = new WebSocketServer({
            server: httpServer,
            path: '/ws',
            verifyClient: ({ origin, req }) => this.isAllowedOrigin(origin, req),
        });
        this.wss.on('connection', (socket) => this.onConnection(socket));
        httpServer.listen(this.config.port, this.config.host, () => {
            process.stdout.write(`herdr-web listening on http://${this.config.host}:${this.config.port}\n`);
        });
        this.topologyTimer = setInterval(() => this.pollTopology(), this.config.topologyPollMs);
        this.pollTopology();
    }

    // browsers always send an Origin header on WebSocket upgrades; non-browser
    // clients (curl, native apps) may omit it and are allowed through
    isAllowedOrigin(origin, req) {
        if (!origin) {
            return true;
        }
        if (this.config.allowedOrigins.includes(origin)) {
            return true;
        }
        let originUrl;
        try {
            originUrl = new URL(origin);
        } catch {
            return false;
        }
        return originUrl.host === req.headers.host;
    }

    handleHttp(req, res) {
        let requestPath;
        try {
            requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        } catch {
            res.writeHead(400);
            res.end('bad request');
            return;
        }
        if (requestPath.includes('\0')) {
            res.writeHead(400);
            res.end('bad request');
            return;
        }
        if (requestPath.startsWith('/push/')) {
            this.handlePushRoute(req, res, requestPath);
            return;
        }
        this.serveStatic(requestPath, res);
    }

    handlePushRoute(req, res, requestPath) {
        const respond = (status, payload) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
        };
        if (requestPath === '/push/public-key' && req.method === 'GET') {
            respond(200, { publicKey: this.push.publicKey });
            return;
        }
        if ((requestPath === '/push/subscribe' || requestPath === '/push/unsubscribe') && req.method === 'POST') {
            this.readJsonBody(req)
                .then((body) => {
                    if (requestPath === '/push/subscribe') {
                        const added = this.push.addSubscription(body);
                        respond(added ? 200 : 400, { ok: added });
                        return;
                    }
                    const removed = this.push.removeSubscription(body?.endpoint);
                    respond(200, { ok: removed });
                })
                .catch(() => respond(400, { ok: false }));
            return;
        }
        respond(404, { ok: false });
    }

    readJsonBody(req) {
        return new Promise((resolve, reject) => {
            let size = 0;
            const chunks = [];
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > HerdrWebServer.MAX_PUSH_BODY_BYTES) {
                    reject(new Error('body too large'));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (error) {
                    reject(error);
                }
            });
            req.on('error', reject);
        });
    }

    serveStatic(requestPath, res) {
        const { PUBLIC_DIR } = HerdrWebServer;
        const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
        const filePath = path.join(PUBLIC_DIR, relative);
        if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
            res.writeHead(403);
            res.end('forbidden');
            return;
        }
        fs.readFile(filePath, (error, data) => {
            if (error) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            const mime = HerdrWebServer.MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
            res.end(data);
        });
    }

    onConnection(socket) {
        this.clients.add(socket);
        socket.on('message', (raw) => this.onMessage(socket, raw));
        socket.on('close', () => this.dropClient(socket));
        if (this.lastTopology) {
            this.send(socket, this.lastTopology);
        }
    }

    dropClient(socket) {
        this.clients.delete(socket);
        const session = this.ptyBySocket.get(socket);
        if (session) {
            session.kill();
            this.ptyBySocket.delete(socket);
        }
    }

    onMessage(socket, raw) {
        let message;
        try {
            message = JSON.parse(String(raw));
        } catch {
            this.send(socket, { type: 'error', message: 'invalid JSON' });
            return;
        }
        try {
            this.handleMessage(socket, message);
        } catch (error) {
            this.send(socket, { type: 'error', message: error.message });
        }
    }

    handleMessage(socket, message) {
        const { type } = message;
        if (type === 'start' && !this.ptyBySocket.has(socket)) {
            this.startTerminal(socket, message);
            return;
        }
        if (type === 'input' && typeof message.data === 'string') {
            this.ptyBySocket.get(socket)?.write(message.data);
            return;
        }
        if (type === 'resize') {
            this.ptyBySocket.get(socket)?.resize(message.cols, message.rows);
            return;
        }
        if (type === 'refresh_topology') {
            this.pollTopology();
            return;
        }
        this.send(socket, { type: 'error', message: `unknown message type: ${String(type)}` });
    }

    // each browser client gets its own PTY attached to the herdr TUI, exactly
    // like a terminal window — herdr multiplexes concurrent attachments itself
    startTerminal(socket, { cols, rows }) {
        const session = new PtySession({
            command: process.env.HERDR_BIN_PATH || 'herdr',
            args: this.config.herdrArgs,
        });
        session.start({
            cols,
            rows,
            onData: (data) => this.send(socket, { type: 'output', data }),
            onExit: ({ exitCode }) => {
                this.send(socket, { type: 'exit', code: exitCode });
                this.ptyBySocket.delete(socket);
            },
        });
        this.ptyBySocket.set(socket, session);
    }

    async pollTopology() {
        let workspaces;
        let panes;
        try {
            [workspaces, panes] = await Promise.all([herdr.listWorkspaces(), herdr.listPanes()]);
        } catch (error) {
            this.broadcast({ type: 'error', message: `herdr unreachable: ${error.message}` });
            return;
        }
        this.lastTopology = { type: 'topology', workspaces, panes };
        this.broadcast(this.lastTopology);
        const events = this.watcher.update(panes);
        for (const event of events) {
            this.broadcast({ type: 'agent_event', event });
            if (event.notifyWorthy) {
                void this.push.notifyAll(HerdrWebServer.pushPayloadFor(event));
            }
        }
    }

    static pushPayloadFor(event) {
        const agent = event.agent || 'agent';
        const where = event.title || event.paneId;
        if (event.to === 'blocked') {
            return { title: `${agent} needs attention`, body: where, tag: event.paneId };
        }
        return { title: `${agent} finished (${event.to})`, body: where, tag: event.paneId };
    }

    broadcast(payload) {
        for (const socket of this.clients) {
            this.send(socket, payload);
        }
    }

    send(socket, payload) {
        if (socket.readyState !== socket.OPEN) {
            return;
        }
        socket.send(JSON.stringify(payload));
    }
}

if (require.main === module) {
    new HerdrWebServer(loadConfig()).start();
}

module.exports = { HerdrWebServer };
