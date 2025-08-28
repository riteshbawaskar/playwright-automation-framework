#!/usr/bin/env node
// scripts/dev-server.js - Development server with hot reload

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const path = require('path');

class DevServer {
  constructor(options = {}) {
    this.options = {
      port: 3000,
      host: 'localhost',
      watch: true,
      autoReload: true,
      ...options
    };
    
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.clients = new Set();
  }

  async start() {
    this.setupMiddleware();
    this.setupWebSocket();
    
    if (this.options.watch) {
      this.setupFileWatcher();
    }
    
    return new Promise((resolve) => {
      this.server.listen(this.options.port, this.options.host, () => {
        console.log(`🌐 Dev server running at http://${this.options.host}:${this.options.port}`);
        console.log(`📁 Serving files from: ${process.cwd()}`);
        if (this.options.watch) {
          console.log('👀 File watching enabled');
        }
        resolve();
      });
    });
  }

  setupMiddleware() {
    // Serve static files
    this.app.use('/static', express.static('electron-app/renderer'));
    this.app.use('/core', express.static('core'));
    this.app.use('/output', express.static('output'));
    
    // API endpoints
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    this.app.get('/api/files/:type', (req, res) => {
      const type = req.params.type;
      const fs = require('fs');
      const glob = require('glob');
      
      let pattern;
      switch (type) {
        case 'tests':
          pattern = 'output/tests/**/*.spec.{js,ts}';
          break;
        case 'page-objects':
          pattern = 'output/page-objects/**/*.{js,ts}';
          break;
        case 'recordings':
          pattern = 'output/recordings/**/*.json';
          break;
        default:
          return res.status(400).json({ error: 'Invalid file type' });
      }
      
      glob(pattern, (err, files) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ files });
      });
    });
    
    // Default route
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'electron-app/renderer/index.html'));
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log('🔌 Client connected');
      
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('🔌 Client disconnected');
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });
    });
  }

  handleWebSocketMessage(ws, message) {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'subscribe':
        ws.subscriptions = message.channels || [];
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  setupFileWatcher() {
    const watcher = chokidar.watch([
      'electron-app/**/*',
      'core/**/*',
      'cli/**/*',
      'templates/**/*',
      'output/**/*'
    ], {
      ignored: /node_modules|\.git|dist|build/,
      persistent: true
    });
    
    watcher.on('change', (filePath) => {
      console.log(`📝 File changed: ${filePath}`);
      this.broadcast({
        type: 'file-changed',
        path: filePath,
        timestamp: Date.now()
      });
      
      if (this.options.autoReload) {
        this.broadcast({ type: 'reload' });
      }
    });
    
    watcher.on('add', (filePath) => {
      console.log(`📄 File added: ${filePath}`);
      this.broadcast({
        type: 'file-added',
        path: filePath,
        timestamp: Date.now()
      });
    });
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    });
  }

  async stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('🛑 Dev server stopped');
        resolve();
      });
    });
  }
}

// Start server if called directly
if (require.main === module) {
  const server = new DevServer({
    port: process.env.PORT || 3000,
    watch: true,
    autoReload: true
  });
  
  server.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

module.exports = DevServer;