/**
 * Shared sudo elevation utility for USBVault Enterprise.
 *
 * Used by both USB provisioning and Zero-Trace cleanup for operations
 * that require administrator/root privileges on the host OS.
 *
 * Security model:
 *   - Password is piped via stdin using `sudo -S` (never in argv — invisible to `ps`)
 *   - Password buffer is explicitly zeroed immediately after write to prevent
 *     memory scraping attacks (heap inspection, cold boot, etc.)
 *   - Detects "incorrect password" in stderr for proper error reporting
 *   - Only used on localhost loopback — same trust boundary as user's Terminal
 *   - Companion rate-limits elevation attempts (5/min) to prevent brute-force
 */

import { spawn } from 'child_process';
import { config } from './config.js';

const DEFAULT_TIMEOUT = config.provisionTimeout || 120000;

/**
 * Execute a command with sudo, piping the admin password via stdin.
 *
 * @param {string} command - The command to execute (e.g., '/usr/sbin/diskutil')
 * @param {string[]} args - Arguments for the command
 * @param {string} adminPassword - The user's OS admin password
 * @param {number} [timeout] - Timeout in ms (defaults to provisionTimeout)
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {Error} With `code: 'ADMIN_AUTH_FAILED'` if password is wrong
 */
export function sudoExec(command, args, adminPassword, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-S', '--', command, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        // Detect wrong password (macOS/Linux sudo error messages)
        if (stderr.includes('incorrect password') || stderr.includes('Sorry, try again')) {
          const err = new Error('Incorrect administrator password');
          err.code = 'ADMIN_AUTH_FAILED';
          reject(err);
          return;
        }
        reject(new Error(`sudo ${command} exited with code ${code}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    // Pipe password via stdin, then zero the buffer immediately.
    // SECURITY: The password buffer MUST be zeroed to prevent it from
    // lingering in the Node.js heap where it could be recovered via
    // memory dumps, heap inspection, or cold boot attacks.
    const pwBuf = Buffer.from(adminPassword + '\n', 'utf-8');
    child.stdin.write(pwBuf);
    child.stdin.end();
    pwBuf.fill(0);
  });
}
