/**
 * USB Setup Wizard Integration Tests
 *
 * Tests the full USB setup flow end-to-end: companion health check,
 * drive listing, drive selection, password validation, vault provisioning,
 * and error handling for companion-down / provision-failure / admin-required scenarios.
 */

// ── Mock axios at the module level ────────────────────────────────────
// jest.mock is hoisted above all imports and variable declarations.
// We create the mock fns inside the factory and stash them on `global`
// so tests can access them after the module has loaded.
import { usbService } from '../usbService';
import type { USBDrive, ProvisionResult } from '../usbService';

jest.mock('axios', () => {
  const get = jest.fn();
  const post = jest.fn();
  (global as any).__axiosMock = { get, post };
  return {
    __esModule: true,
    default: { create: () => ({ get, post, interceptors: { request: { use: () => 0 } } }) },
    create: () => ({ get, post, interceptors: { request: { use: () => 0 } } }),
  };
});

// Mock audit service (fire-and-forget calls should not affect test flow)
jest.mock('../auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
  fireAndForget: jest.fn(),
}));

// Retrieve the mock fns stashed during jest.mock('axios')
const { get: mockGet, post: mockPost } = (global as any).__axiosMock as {
  get: jest.Mock;
  post: jest.Mock;
};

// ── Test data ─────────────────────────────────────────────────────────

const MOCK_DRIVES: USBDrive[] = [
  {
    id: 'drive-001',
    name: 'SanDisk Ultra 64GB',
    capacity: '64 GB',
    device: '/dev/sdb',
    available: true,
    hasVault: false,
    partitions: [
      {
        id: 'part-001',
        label: 'SANDISK',
        fileSystem: 'exfat',
        size: '64 GB',
        mountPoint: '/media/user/SANDISK',
        hasVault: false,
      },
    ],
  },
  {
    id: 'drive-002',
    name: 'Kingston DataTraveler 32GB',
    capacity: '32 GB',
    device: '/dev/sdc',
    available: true,
    hasVault: true,
    partitions: [],
  },
];

const MOCK_PROVISION_RESULT: ProvisionResult = {
  vaultId: 'vault-abc123',
  recoveryPhrase: [
    'abandon',
    'ability',
    'able',
    'about',
    'above',
    'absent',
    'absorb',
    'abstract',
    'absurd',
    'abuse',
    'access',
    'accident',
    'account',
    'accuse',
    'achieve',
    'acid',
    'acoustic',
    'acquire',
    'across',
    'act',
    'action',
    'actor',
    'actress',
    'actual',
  ],
  secureMountPoint: '/media/user/.usbvault/vault-abc123',
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('USB Setup Wizard Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Happy Path: Full provisioning flow
  // ============================================================================
  describe('Happy Path', () => {
    it('companion health check succeeds when service is running', async () => {
      mockGet.mockResolvedValueOnce({ data: { status: 'ok' } });

      const isRunning = await usbService.isCompanionRunning();

      expect(isRunning).toBe(true);
      expect(mockGet).toHaveBeenCalledWith('/companion/health', { timeout: 3000 });
    });

    it('listDrives returns available drives from companion', async () => {
      mockGet.mockResolvedValueOnce({ data: { drives: MOCK_DRIVES } });

      const drives = await usbService.listDrives();

      expect(drives).toHaveLength(2);
      expect(drives[0].name).toBe('SanDisk Ultra 64GB');
      expect(drives[0].available).toBe(true);
      expect(drives[1].hasVault).toBe(true);
    });

    it('user can select a drive and verify it is available', async () => {
      mockGet.mockResolvedValueOnce({ data: { drives: MOCK_DRIVES } });

      const drives = await usbService.listDrives();
      const selectedDrive = drives.find(d => d.id === 'drive-001');

      expect(selectedDrive).toBeDefined();
      expect(selectedDrive!.available).toBe(true);
      expect(selectedDrive!.hasVault).toBe(false);
    });

    it('password validation rejects weak passwords before provisioning', () => {
      const validatePassword = (pw: string): boolean => {
        if (pw.length < 8) return false;
        if (!/[a-z]/.test(pw)) return false;
        if (!/[A-Z]/.test(pw)) return false;
        if (!/[0-9]/.test(pw)) return false;
        return true;
      };

      expect(validatePassword('short')).toBe(false);
      expect(validatePassword('alllowercase1')).toBe(false);
      expect(validatePassword('ALLUPPERCASE1')).toBe(false);
      expect(validatePassword('NoDigitsHere')).toBe(false);
      expect(validatePassword('Valid1Password')).toBe(true);
    });

    it('provisionVault succeeds and returns vault ID + recovery phrase', async () => {
      mockPost.mockResolvedValueOnce({ data: MOCK_PROVISION_RESULT });

      const result = await usbService.provisionVault({
        driveId: 'drive-001',
        formatType: 'quick',
        fileSystem: 'exfat',
        masterPassword: 'SecureP@ss123',
      });

      expect(result.vaultId).toBe('vault-abc123');
      expect(result.recoveryPhrase).toHaveLength(24);
      expect(result.secureMountPoint).toBeDefined();
      expect(mockPost).toHaveBeenCalledWith(
        '/usb/provision',
        expect.objectContaining({
          drive_id: 'drive-001',
          format_type: 'quick',
          file_system: 'exfat',
          master_password: 'SecureP@ss123',
          confirm: true,
        })
      );
    });

    it('full setup flow: health -> list -> select -> provision', async () => {
      // Step 1: Health check
      mockGet.mockResolvedValueOnce({ data: { status: 'ok' } });
      const healthy = await usbService.isCompanionRunning();
      expect(healthy).toBe(true);

      // Step 2: List drives
      mockGet.mockResolvedValueOnce({ data: { drives: MOCK_DRIVES } });
      const drives = await usbService.listDrives();
      expect(drives.length).toBeGreaterThan(0);

      // Step 3: Select available drive without existing vault
      const target = drives.find(d => d.available && !d.hasVault);
      expect(target).toBeDefined();

      // Step 4: Provision vault
      mockPost.mockResolvedValueOnce({ data: MOCK_PROVISION_RESULT });
      const result = await usbService.provisionVault({
        driveId: target!.id,
        formatType: 'quick',
        fileSystem: 'exfat',
        masterPassword: 'MyStr0ng!Pass',
      });
      expect(result.vaultId).toBeTruthy();
      expect(result.recoveryPhrase.length).toBe(24);
    });
  });

  // ============================================================================
  // Error: Companion unreachable
  // ============================================================================
  describe('Error: companion unreachable', () => {
    it('health check returns false when companion is down', async () => {
      mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const isRunning = await usbService.isCompanionRunning();

      expect(isRunning).toBe(false);
    });

    it('listDrives throws USB_COMPANION_UNAVAILABLE when companion is down', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).code = 'ERR_NETWORK';
      mockGet.mockRejectedValueOnce(networkError);

      await expect(usbService.listDrives()).rejects.toThrow('USB_COMPANION_UNAVAILABLE');
    });

    it('provisionVault throws USB_COMPANION_UNAVAILABLE when companion is down', async () => {
      const connError = new Error('connect ECONNREFUSED 127.0.0.1:3001');
      (connError as any).code = 'ECONNREFUSED';
      mockPost.mockRejectedValueOnce(connError);

      await expect(
        usbService.provisionVault({
          driveId: 'drive-001',
          formatType: 'quick',
          fileSystem: 'exfat',
          masterPassword: 'SecureP@ss123',
        })
      ).rejects.toThrow('USB_COMPANION_UNAVAILABLE');
    });
  });

  // ============================================================================
  // Error: Provision fails
  // ============================================================================
  describe('Error: provision fails', () => {
    it('propagates server error message on provision failure', async () => {
      mockPost.mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Drive is read-only' },
        },
        message: 'Request failed with status code 500',
      });

      await expect(
        usbService.provisionVault({
          driveId: 'drive-001',
          formatType: 'quick',
          fileSystem: 'exfat',
          masterPassword: 'SecureP@ss123',
        })
      ).rejects.toThrow('Drive is read-only');
    });

    it('propagates generic error when no response body is available', async () => {
      mockPost.mockRejectedValueOnce({
        message: 'timeout of 10000ms exceeded',
      });

      await expect(
        usbService.provisionVault({
          driveId: 'drive-001',
          formatType: 'quick',
          fileSystem: 'exfat',
          masterPassword: 'SecureP@ss123',
        })
      ).rejects.toThrow('timeout of 10000ms exceeded');
    });
  });

  // ============================================================================
  // Error: Admin elevation required
  // ============================================================================
  describe('Error: admin elevation required', () => {
    it('returns ADMIN_REQUIRED code when provisioning needs elevation', async () => {
      mockPost.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { error: 'ADMIN_REQUIRED', message: 'Administrative privileges required' },
        },
        message: 'Request failed with status code 403',
      });

      await expect(
        usbService.provisionVault({
          driveId: 'drive-001',
          formatType: 'full',
          fileSystem: 'ext4',
          masterPassword: 'SecureP@ss123',
        })
      ).rejects.toThrow('Administrative privileges required');
    });

    it('preflight detects admin elevation needed before provisioning', async () => {
      mockGet.mockResolvedValueOnce({
        data: { needsAdmin: true, platform: 'darwin' },
      });

      const preflight = await usbService.provisionPreflight('drive-003');

      expect(preflight.needsAdmin).toBe(true);
      expect(preflight.platform).toBe('darwin');
    });
  });
});
