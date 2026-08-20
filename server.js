#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');

const { loadConfig } = require('./lib/config');
const herdr = require('./lib/herdr');
const { ansiToHtml } = require('./lib/ansi');
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
    };

    constructor(config) {
        this.config = config;
        this.watcher = new StateWatcher();
        this.clients = new Set();
        this.subscriptions = new Map();
        this.lastTopology = null;
        this.lastPaneHtml = new Map();
        this.topologyTimer = null;
        this.paneTimer = null;
    }

    start() {
        const httpServer = http.createServer((req, res) => this.serveStatic(req, res));
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
        this.paneTimer = setInterval(() => this.pollSubscribedPanes(), this.config.panePollMs);
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

    serveStatic(req, res) {
        const { PUBLIC_DIR } = HerdrWebServer;
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
        socket.on('close', () => {
            this.clients.delete(socket);
            this.subscriptions.delete(socket);
        });
        if (this.lastTopology) {
            this.send(socket, this.lastTopology);
        }
    }

    async onMessage(socket, raw) {
        let message;
        try {
            message = JSON.parse(String(raw));
        } catch {
            this.send(socket, { type: 'error', message: 'invalid JSON' });
            return;
        }
        try {
            await this.handleMessage(socket, message);
        } catch (error) {
            this.send(socket, { type: 'error', message: error.message });
        }
    }

    async handleMessage(socket, message) {
        const { type, paneId } = message;
        if (type === 'subscribe' && typeof paneId === 'string') {
            this.subscriptions.set(socket, paneId);
            await this.pushPaneOutput(paneId, { force: true });
            return;
        }
        if (type === 'unsubscribe') {
            this.subscriptions.delete(socket);
            return;
        }
        if (type === 'send_text' && typeof paneId === 'string' && typeof message.text === 'string') {
            await herdr.sendText(paneId, message.text);
            await this.pushPaneOutput(paneId, { force: true });
            return;
        }
        if (type === 'send_keys' && typeof paneId === 'string' && Array.isArray(message.keys) && message.keys.length > 0) {
            await herdr.sendKeys(paneId, message.keys.map(String));
            await this.pushPaneOutput(paneId, { force: true });
            return;
        }
        if (type === 'refresh_topology') {
            await this.pollTopology();
            return;
        }
        this.send(socket, { type: 'error', message: `unknown message type: ${String(type)}` });
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
        const livePaneIds = new Set(panes.map((pane) => pane.pane_id));
        for (const paneId of this.lastPaneHtml.keys()) {
            if (!livePaneIds.has(paneId)) {
                this.lastPaneHtml.delete(paneId);
            }
        }
        const events = this.watcher.update(panes);
        for (const event of events) {
            this.broadcast({ type: 'agent_event', event });
        }
    }

    subscribedPaneIds() {
        return [...new Set(this.subscriptions.values())];
    }

    async pollSubscribedPanes() {
        const paneIds = this.subscribedPaneIds();
        await Promise.all(paneIds.map((paneId) => this.pushPaneOutput(paneId)));
    }

    async pushPaneOutput(paneId, { force = false } = {}) {
        let text;
        try {
            text = await herdr.readPane(paneId, { lines: this.config.readLines, format: 'ansi' });
        } catch (error) {
            this.broadcastToSubscribers(paneId, { type: 'error', message: `pane read failed: ${error.message}` });
            return;
        }
        const html = ansiToHtml(text);
        if (!force && this.lastPaneHtml.get(paneId) === html) {
            return;
        }
        this.lastPaneHtml.set(paneId, html);
        this.broadcastToSubscribers(paneId, { type: 'pane_output', paneId, html });
    }

    broadcastToSubscribers(paneId, payload) {
        for (const [socket, subscribedId] of this.subscriptions) {
            if (subscribedId === paneId) {
                this.send(socket, payload);
            }
        }
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
