import { ALGORITHMS, FILE_SYSTEMS, FORMAT_TYPES, INITIAL_STATE } from '../setup-usb.data';
import { STEP_KEYS } from '../setup-usb.types';

describe('setup-usb.data', () => {
  describe('ALGORITHMS', () => {
    it('offers the three encryption algorithms with badge colors', () => {
      expect(ALGORITHMS.map(a => a.id)).toEqual([
        'AES-256-GCM-SIV',
        'XChaCha20-Poly1305',
        'ML-KEM-1024 Hybrid',
      ]);
      expect(ALGORITHMS.map(a => a.tag)).toEqual(['Recommended', 'Fast', 'Quantum-Safe']);
      for (const algo of ALGORITHMS) {
        expect(algo.tagColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(algo.description).toBeTruthy();
        expect(algo.specs).toBeTruthy();
      }
    });
  });

  describe('FILE_SYSTEMS', () => {
    it('lists exfat as the only universal filesystem', () => {
      const universal = FILE_SYSTEMS.filter(fs => fs.category === 'universal');
      expect(universal.map(fs => fs.id)).toEqual(['exfat']);
    });

    it('marks apfs, ntfs and ext4 as platform-specific', () => {
      const platform = FILE_SYSTEMS.filter(fs => fs.category === 'platform').map(fs => fs.id);
      expect(platform).toEqual(['apfs', 'ntfs', 'ext4']);
    });

    it('gives every filesystem a name, description and platform icon', () => {
      for (const fs of FILE_SYSTEMS) {
        expect(fs.name).toBeTruthy();
        expect(fs.description).toBeTruthy();
        expect(fs.platforms).toBeTruthy();
        expect(fs.platformIcon).toBeTruthy();
      }
    });
  });

  describe('FORMAT_TYPES', () => {
    it('offers quick and full format options with distinct icons', () => {
      expect(FORMAT_TYPES.map(f => f.value)).toEqual(['quick', 'full']);
      const quick = FORMAT_TYPES.find(f => f.value === 'quick');
      const full = FORMAT_TYPES.find(f => f.value === 'full');
      expect(quick?.icon).toBe('zap');
      expect(full?.icon).toBe('shield');
      expect(quick?.labelKey).toBe('setupUsb.quickFormat');
      expect(full?.labelKey).toBe('setupUsb.fullFormat');
    });
  });

  describe('INITIAL_STATE', () => {
    it('defaults the wizard to step 0 with no drive selected', () => {
      expect(INITIAL_STATE.currentStep).toBe(0);
      expect(INITIAL_STATE.selectedDriveId).toBeNull();
    });

    it('defaults to a quick exFAT format with the recommended algorithm', () => {
      expect(INITIAL_STATE.formatType).toBe('quick');
      expect(INITIAL_STATE.fileSystem).toBe('exfat');
      expect(INITIAL_STATE.algorithm).toBe('AES-256-GCM-SIV');
    });

    it('starts with empty passwords hidden', () => {
      expect(INITIAL_STATE.password).toBe('');
      expect(INITIAL_STATE.passwordConfirm).toBe('');
      expect(INITIAL_STATE.showPassword).toBe(false);
      expect(INITIAL_STATE.showPasswordConfirm).toBe(false);
    });

    it('references a valid default algorithm and filesystem from the option tables', () => {
      expect(ALGORITHMS.some(a => a.id === INITIAL_STATE.algorithm)).toBe(true);
      expect(FILE_SYSTEMS.some(fs => fs.id === INITIAL_STATE.fileSystem)).toBe(true);
    });
  });
});

describe('setup-usb.types runtime constant', () => {
  it('STEP_KEYS enumerates the four wizard steps in order', () => {
    expect(STEP_KEYS).toEqual([
      'setupUsb.detectUsb',
      'setupUsb.formatOptions',
      'setupUsb.setMasterPassword',
      'setupUsb.initialize',
    ]);
    expect(STEP_KEYS).toHaveLength(4);
  });
});
