/**
 * CompanionManager — spawns, monitors, and restarts the USB Companion Service.
 *
 * The companion runs as a child process of Electron's main process.
 * If it crashes, the manager restarts it automatically (up to MAX_RESTARTS).
 * The manager selects an available port, writes it to a .companion-port file,
 * and exposes it via getPort() for the renderer and tray.
 *
 * Lifecycle:
 *   start() → spawn companion → health check → ready
 *   crash   → auto-restart (up to 5 times) → emit 'status-changed'
 *   stop()  → graceful SIGTERM → force SIGKILL after 5s
 */

import { ChildProcess, fork } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { app } from 'electron';

// ── Configuration ────────────────────────────────────────────────────────
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1500;
const HEALTH_CHECK_INTERVAL_MS = 500;
const HEALTH_CHECK_MAX_ATTEMPTS = 30;  // 15 seconds
const PORT_RANGE_START = 3001;
const PORT_RANGE_END = 3010;

export type CompanionStatus = 'stopped' | 'starting' | 'running' | 'crashed' | 'failed';

export interface CompanionManagerEvents {
  'status-changed': (status: CompanionStatus, detail?: string) => void;
  'port-assigned': (port: number) => void;
  'log': (message: string) => void;
}

export class CompanionManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private status: CompanionStatus = 'stopped';
  private restartCount = 0;
  private stopping = false;
  private companionDir: string;
  private portFilePath: string;
  // CRIT-1 (F5): bearer token shared with the companion out-of-band via env.
  // Generated once per app run; passed to every spawn (incl. restarts) so the
  // token is stable for the lifetime of the renderer. NEVER logged.
  private readonly authToken: string;

  constructor() {
    super();
    // Strong random token, URL-safe so it can travel as a Bearer credential.
    this.authToken = randomBytes(32).toString('base64url');
    // In packaged app: resources are in app.getPath('exe')/../Resources/companion
    // In dev: resources are at ../usb-companion relative to the electron-shell
    if (app.isPackaged) {
      this.companionDir = join(process.resourcesPath, 'companion');
    } else {
      this.companionDir = join(__dirname, '..', '..', 'usb-companion');
    }
    this.portFilePath = join(this.companionDir, '.companion-port');
  }

  // ── Public API ───────────────────────────────────────────────────────

  getPort(): number | null { return this.port; }
  getStatus(): CompanionStatus { return this.status; }
  getRestartCount(): number { return this.restartCount; }

  /**
   * The bearer token the companion expects on every /usb/* request.
   * Exposed to the renderer (via IPC) so the HTTP client can authenticate.
   * SECURITY: the value is never written to logs.
   */
  getAuthToken(): string { return this.authToken; }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return;

    this.stopping = false;
    this.restartCount = 0;
    await this.spawnCompanion();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.killProcess();
    this.cleanupPortFile();
    this.setStatus('stopped');
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private setStatus(status: CompanionStatus, detail?: string) {
    this.status = status;
    this.emit('status-changed', status, detail);
  }

  private log(message: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [companion] ${message}`;
    this.emit('log', line);
  }

  /**
   * Find an available port by attempting to bind a temporary TCP server.
   * Much more reliable than parsing lsof/netstat output.
   */
  private async findAvailablePort(): Promise<number> {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      const available = await new Promise<boolean>((resolve) => {
        const server = createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
          server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
      });
      if (available) return port;
    }
    throw new Error(`No available port in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
  }

  /**
   * Check if the companion health endpoint is responding.
   */
  private healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.port}/health`,
        { timeout: 2000 },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk; });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              resolve(data?.status === 'ok');
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  /**
   * Wait for the companion to become healthy, polling at intervals.
   */
  private async waitForHealth(): Promise<boolean> {
    for (let i = 0; i < HEALTH_CHECK_MAX_ATTEMPTS; i++) {
      if (this.stopping) return false;
      if (await this.healthCheck()) return true;
      // Check if process died during startup
      if (this.process && this.process.exitCode !== null) return false;
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    return false;
  }

  private async spawnCompanion(): Promise<void> {
    this.setStatus('starting');

    // Find available port
    try {
      this.port = await this.findAvailablePort();
      this.log(`Assigned port: ${this.port}`);
      this.emit('port-assigned', this.port);
    } catch (err: any) {
      this.log(`Port allocation failed: ${err.message}`);
      this.setStatus('failed', 'No available port');
      return;
    }

    // Write port file for any external tools that need to discover it
    try {
      writeFileSync(this.portFilePath, String(this.port), 'utf-8');
    } catch {
      // Non-fatal — port file is a convenience
    }

    // Verify companion directory exists
    const serverJs = join(this.companionDir, 'src', 'server.js');
    if (!existsSync(serverJs)) {
      this.log(`Companion not found at: ${serverJs}`);
      this.setStatus('failed', 'Companion service files not found');
      return;
    }

    // Spawn the companion as a child process
    this.log(`Spawning companion from: ${this.companionDir}`);
    this.process = fork(serverJs, [], {
      cwd: this.companionDir,
      env: {
        ...process.env,
        USB_COMPANION_PORT: String(this.port),
        USB_STANDALONE_MODE: 'true',
        NODE_ENV: 'production',
        // CRIT-1 (F5): hand the companion the bearer token out-of-band so it
        // skips token-file generation and trusts only this value. Never logged.
        USBVAULT_COMPANION_TOKEN: this.authToken,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      silent: true,
    });

    // Capture stdout/stderr for logging
    this.process.stdout?.on('data', (data: Buffer) => {
      this.log(`[stdout] ${data.toString().trim()}`);
    });
    this.process.stderr?.on('data', (data: Buffer) => {
      this.log(`[stderr] ${data.toString().trim()}`);
    });

    // Handle unexpected exit
    this.process.on('exit', (code, signal) => {
      if (this.stopping) return;
      this.log(`Companion exited (code: ${code}, signal: ${signal})`);
      this.handleCrash();
    });

    this.process.on('error', (err) => {
      this.log(`Companion process error: ${err.message}`);
      if (!this.stopping) this.handleCrash();
    });

    // Wait for health check
    const healthy = await this.waitForHealth();
    if (healthy) {
      this.log('Companion is healthy');
      this.restartCount = 0; // Reset on successful start
      this.setStatus('running');
    } else if (!this.stopping) {
      this.log('Health check failed after startup');
      await this.killProcess();
      this.handleCrash();
    }
  }

  private async handleCrash(): Promise<void> {
    if (this.stopping) return;

    this.restartCount++;
    this.setStatus('crashed', `Restart ${this.restartCount}/${MAX_RESTARTS}`);
    this.log(`Crash detected (attempt ${this.restartCount}/${MAX_RESTARTS})`);

    if (this.restartCount >= MAX_RESTARTS) {
      this.log('Max restarts exceeded — giving up');
      this.setStatus('failed', `Crashed ${MAX_RESTARTS} times`);
      return;
    }

    // Delay before restart
    await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));
    if (!this.stopping) {
      await this.spawnCompanion();
    }
  }

  private async killProcess(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    this.process = null;

    return new Promise((resolve) => {
      const forceKill = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        resolve();
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(forceKill);
        resolve();
      });

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(forceKill);
        resolve();
      }
    });
  }

  private cleanupPortFile(): void {
    try {
      if (existsSync(this.portFilePath)) {
        unlinkSync(this.portFilePath);
      }
    } catch { /* ignore */ }
  }
}
