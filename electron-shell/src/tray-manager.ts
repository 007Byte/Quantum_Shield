/**
 * TrayManager — system tray icon with companion status and quick actions.
 *
 * Shows a tray icon with:
 *   - Companion status (running/crashed/stopped) with colored indicator
 *   - "Open USBVault" — focuses the main window
 *   - "Safe Eject USB" — placeholder for future USB ejection
 *   - "Quit" — graceful shutdown
 *
 * The tray icon updates when companion status changes (green dot = running,
 * amber = restarting, red = failed).
 */

import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { CompanionStatus } from './companion-manager';

export class TrayManager {
  private tray: Tray | null = null;
  private status: CompanionStatus = 'stopped';
  private port: number | null = null;
  private mainWindow: BrowserWindow | null = null;

  /**
   * Create the system tray icon and initial menu.
   */
  create(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;

    // Create a simple 16x16 tray icon
    // In production, use proper icon assets from assets/ directory
    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('USBVault Enterprise');
    this.tray.on('click', () => this.showWindow());
    this.updateMenu();
  }

  /**
   * Update tray when companion status changes.
   */
  updateStatus(status: CompanionStatus, port: number | null): void {
    this.status = status;
    this.port = port;
    this.updateMenu();

    // Update tooltip
    const statusText =
      status === 'running' ? 'Running' :
      status === 'starting' ? 'Starting...' :
      status === 'crashed' ? 'Restarting...' :
      status === 'failed' ? 'Service Failed' :
      'Stopped';
    this.tray?.setToolTip(`USBVault — ${statusText}`);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private showWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  private updateMenu(): void {
    if (!this.tray) return;

    const statusLabel =
      this.status === 'running' ? `✓ Companion Running (port ${this.port})` :
      this.status === 'starting' ? '⟳ Companion Starting...' :
      this.status === 'crashed' ? '⟳ Companion Restarting...' :
      this.status === 'failed' ? '✕ Companion Failed' :
      '○ Companion Stopped';

    const menu = Menu.buildFromTemplate([
      { label: 'USBVault Enterprise', enabled: false },
      { type: 'separator' },
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      {
        label: 'Open USBVault',
        click: () => this.showWindow(),
      },
      {
        label: 'Safe Eject USB',
        enabled: this.status === 'running',
        click: () => {
          // Send eject request to the renderer via the main window
          this.mainWindow?.webContents.send('usb:request-eject');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit USBVault',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  /**
   * Create a simple programmatic tray icon.
   * In production, replace with proper icon files for each platform.
   */
  private createTrayIcon(): Electron.NativeImage {
    // Try to load icon from assets directory first
    const iconPaths = [
      join(__dirname, '..', 'assets', 'tray-icon.png'),
      join(__dirname, '..', 'assets', 'icon.png'),
    ];

    for (const iconPath of iconPaths) {
      try {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
      } catch {
        // Try next path
      }
    }

    // Fallback: create a 16x16 shield icon programmatically via data URL
    // Purple shield on transparent background — matches USBVault brand
    const size = 16;
    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">
      <path d="M8 1L2 3.5V7.5C2 11.1 4.5 14.4 8 15C11.5 14.4 14 11.1 14 7.5V3.5L8 1Z" fill="#753CFF"/>
      <path d="M7 8.5L5.5 7L4.8 7.7L7 9.9L11.2 5.7L10.5 5L7 8.5Z" fill="white"/>
    </svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
    const fallback = nativeImage.createFromDataURL(dataUrl);
    return fallback.resize({ width: size, height: size });
  }
}
