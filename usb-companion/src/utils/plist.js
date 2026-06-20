/**
 * macOS Plist Parser — uses plutil (built-in) to convert XML plist to JSON.
 *
 * Security:
 *   - Uses spawn (no shell) — plutil arguments are static constants
 *   - Plist data is fed via stdin pipe, never as a CLI argument
 *   - 5-second timeout prevents hangs
 */

import { spawn } from 'node:child_process';

/**
 * Parse an XML plist string into a JavaScript object.
 * Uses macOS built-in `plutil` — no npm dependencies needed.
 *
 * @param {string} plistXml - Raw XML plist string (e.g. from diskutil output)
 * @returns {Promise<Object>} Parsed JavaScript object
 */
export function parsePlist(plistXml) {
  return new Promise((resolve, reject) => {
    const child = spawn('plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`plutil exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Failed to parse plutil JSON output: ${err.message}`));
      }
    });

    // Feed plist XML via stdin and close
    child.stdin.write(plistXml);
    child.stdin.end();
  });
}
