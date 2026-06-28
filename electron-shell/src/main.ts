/**
 * USBVault Desktop — Electron Main Process
 *
 * Orchestrates:
 *   1. Companion service lifecycle (spawn, monitor, restart)
 *   2. BrowserWindow loading the Expo web export
 *   3. System tray with status and quick actions
 *   4. IPC bridge between renderer and main process
 *   5. Auto-updater for seamless updates
 *
 * Architecture:
 *   Main Process ──fork──▶ Companion (Node.js child process on localhost:PORT)
 *        │
 *        ├── BrowserWindow ──loads──▶ http://localhost:PORT (companion serves static)
 *        │        │
 *        │        └── preload.ts ──IPC──▶ Main Process
 *        │
 *        └── System Tray (status, eject, quit)
 */

import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import { CompanionManager } from './companion-manager';
import { TrayManager } from './tray-manager';
import { registerUSBHandlers } from './usb-ipc-adapter';

// ── Singleton refs ───────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
const companion = new CompanionManager();
const tray = new TrayManager();

// ── App lifecycle ────────────────────────────────────────────────────────

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window when second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  // Set up CSP for security
  // H-7 FIX: Removed 'unsafe-inline' and 'unsafe-eval' from script-src.
  // Scripts must come from 'self' only. Inline styles are still permitted in
  // style-src because React's CSS-in-JS relies on style injection.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' http://localhost:* ws://localhost:*; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' http://localhost:* ws://localhost:*;"
        ],
      },
    });
  });

  // Start companion first
  await startCompanion();

  // Create main window
  createMainWindow();

  // Set up system tray
  if (mainWindow) {
    tray.create(mainWindow);
    tray.updateStatus(companion.getStatus(), companion.getPort());
  }

  // Set up IPC handlers
  registerIpcHandlers();

  // Check for updates (non-blocking)
  if (app.isPackaged) {
    setupAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running in the tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', async () => {
  await companion.stop();
  tray.destroy();
});

// ── Window ───────────────────────────────────────────────────────────────

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Quantum_Shield',
    backgroundColor: '#0F0B1E', // Match app's OLED dark background
    show: false, // Show when ready to prevent flash
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Show window when content is ready (no white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app from the companion's static server
  const port = companion.getPort();
  if (port) {
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  } else {
    // Companion not ready yet — load a waiting page and retry
    mainWindow.loadURL('data:text/html,' + encodeURIComponent(getWaitingHTML()));
    waitForCompanionAndLoad();
  }

  // Handle window close — hide to tray on macOS, quit on other platforms
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open dev tools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/**
 * If the companion wasn't ready when the window was created,
 * poll until it's running and then navigate to it.
 */
async function waitForCompanionAndLoad(): Promise<void> {
  const maxWait = 30; // 30 seconds
  for (let i = 0; i < maxWait * 2; i++) {
    if (companion.getStatus() === 'running' && companion.getPort()) {
      mainWindow?.loadURL(`http://127.0.0.1:${companion.getPort()}`);
      return;
    }
    if (companion.getStatus() === 'failed') {
      mainWindow?.loadURL('data:text/html,' + encodeURIComponent(getErrorHTML()));
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  mainWindow?.loadURL('data:text/html,' + encodeURIComponent(getErrorHTML()));
}

// ── Companion ────────────────────────────────────────────────────────────

async function startCompanion(): Promise<void> {
  companion.on('status-changed', (status, detail) => {
    console.log(`[main] Companion status: ${status}${detail ? ` (${detail})` : ''}`);
    tray.updateStatus(status, companion.getPort());
    // Forward status to renderer
    mainWindow?.webContents.send('companion:status-changed', status, detail);
  });

  companion.on('port-assigned', (port) => {
    console.log(`[main] Companion port: ${port}`);
  });

  companion.on('log', (message) => {
    console.log(message);
  });

  await companion.start();
}

// ── IPC Handlers ─────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle('companion:get-port', () => companion.getPort());
  ipcMain.handle('companion:get-status', () => companion.getStatus());

  // CRIT-1 (F5): hand the renderer the bearer token so the HTTP client can
  // authenticate to the companion. Token value is never logged.
  ipcMain.handle('companion:get-token', () => companion.getAuthToken());

  /** Combined status query — returns status, port, and URL in one call. */
  ipcMain.handle('companion:status', () => {
    const port = companion.getPort();
    return {
      status: companion.getStatus(),
      port,
      url: port ? `http://localhost:${port}` : null,
    };
  });

  ipcMain.handle('companion:restart', async () => {
    await companion.stop();
    await companion.start();
    return { status: companion.getStatus() };
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  // Register USB IPC handlers (direct service calls, bypass HTTP)
  registerUSBHandlers();
}

// ── Auto-updater ─────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`);
    mainWindow?.webContents.send('updater:available', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`);
    mainWindow?.webContents.send('updater:downloaded', info.version);
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
  });

  // Check for updates every 4 hours
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);
}

// ── Inline HTML pages ────────────────────────────────────────────────────

function getWaitingHTML(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>USBVault</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0F0B1E; color: #F5F3FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center; height: 100vh;
    flex-direction: column; gap: 16px;
  }
  .spinner { width: 32px; height: 32px; border: 3px solid rgba(139,92,246,0.2); border-top-color: #8B5CF6;
    border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { font-size: 24px; font-weight: 600; color: #8B5CF6; }
  p { font-size: 14px; color: #B7B2D9; }
</style></head>
<body>
  <h1>USBVault</h1>
  <div class="spinner"></div>
  <p>Starting companion service...</p>
</body></html>`;
}

function getErrorHTML(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>USBVault — Error</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0F0B1E; color: #F5F3FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center; height: 100vh;
    flex-direction: column; gap: 16px; text-align: center; padding: 40px;
  }
  h1 { font-size: 24px; font-weight: 600; color: #EF4444; }
  p { font-size: 14px; color: #B7B2D9; max-width: 400px; line-height: 1.6; }
  button {
    background: #753CFF; color: white; border: none; padding: 10px 24px;
    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    margin-top: 8px;
  }
  button:hover { background: #8B5CF6; }
</style></head>
<body>
  <h1>Companion Service Failed</h1>
  <p>The USB Companion Service could not be started after multiple attempts. This usually means a port conflict or missing files.</p>
  <p>Check the application logs for details.</p>
  <button onclick="window.electronBridge?.restartCompanion().then(() => location.reload())">Retry</button>
</body></html>`;
}

// Set isQuitting flag on quit
app.on('before-quit', () => {
  isQuitting = true;
});
