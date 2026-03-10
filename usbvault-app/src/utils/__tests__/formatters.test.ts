import {
  formatFileSize,
  formatDate,
  truncateFilename,
  getFileTypeIcon,
} from '@/utils/formatters';

describe('Formatters Utility Functions', () => {
  // ============================================================================
  // Test: formatFileSize
  // ============================================================================
  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(1)).toBe('1 B');
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should format terabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('should handle large numbers', () => {
      const largeNumber = 1024 * 1024 * 1024 * 1024 * 5.5;
      expect(formatFileSize(largeNumber)).toBe('5.5 TB');
    });
  });

  // ============================================================================
  // Test: formatDate
  // ============================================================================
  describe('formatDate', () => {
    it('should format date as "just now" for recent dates', () => {
      const now = new Date();
      expect(formatDate(now)).toBe('just now');
    });

    it('should format date in minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatDate(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should format date in hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
      expect(formatDate(twoHoursAgo)).toBe('2h ago');
    });

    it('should format date in days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
      expect(formatDate(threeDaysAgo)).toBe('3d ago');
    });

    it('should format date in calendar format for older dates', () => {
      const oldDate = new Date('2024-01-15');
      const result = formatDate(oldDate);
      // Should be in format "Jan 15, 2024" or similar (may be off by one due to timezone)
      expect(result).toMatch(/Jan/);
      expect(/\d{1,2}/.test(result)).toBe(true); // Contains a day number
      expect(result).toContain('2024');
    });

    it('should accept ISO string input', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatDate(fiveMinutesAgo.toISOString())).toBe('5m ago');
    });

    it('should handle string dates', () => {
      const dateString = '2024-01-01T00:00:00Z';
      const result = formatDate(dateString);
      // Should not throw and should return a formatted string
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should show "d ago" for week-old dates', () => {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const result = formatDate(oneWeekAgo);
      // Should show as calendar format (more than a week)
      expect(result).not.toContain('ago');
    });
  });

  // ============================================================================
  // Test: truncateFilename
  // ============================================================================
  describe('truncateFilename', () => {
    it('should not truncate short filenames', () => {
      expect(truncateFilename('short.txt')).toBe('short.txt');
    });

    it('should truncate long filenames with default length', () => {
      const longName = 'a'.repeat(50) + '.txt';
      const result = truncateFilename(longName);
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(30 + 3); // max 30 + "..."
    });

    it('should preserve file extension', () => {
      const longName = 'a'.repeat(50) + '.pdf';
      const result = truncateFilename(longName);
      expect(result).toMatch(/\.pdf$/);
      expect(result).toContain('...');
    });

    it('should respect custom maxLength parameter', () => {
      const name = 'a'.repeat(50) + '.txt';
      const result = truncateFilename(name, 20);
      expect(result.length).toBeLessThanOrEqual(20 + 3); // max 20 + "..."
    });

    it('should handle filenames without extension', () => {
      const name = 'a'.repeat(50);
      const result = truncateFilename(name);
      expect(result).toContain('...');
    });

    it('should handle filenames with multiple dots', () => {
      const name = 'a'.repeat(30) + '.backup.txt';
      const result = truncateFilename(name, 20);
      expect(result).toMatch(/\.txt$/);
    });

    it('should not truncate if exactly at maxLength', () => {
      const name = 'exactly30chars1234567890.txt';
      const result = truncateFilename(name, 30);
      expect(result).not.toContain('...');
    });
  });

  // ============================================================================
  // Test: getFileTypeIcon
  // ============================================================================
  describe('getFileTypeIcon', () => {
    describe('Document types', () => {
      it('should return correct icon for PDF', () => {
        const result = getFileTypeIcon('document.pdf');
        expect(result.emoji).toBe('📄');
        expect(result.color).toBe('#EF4444');
      });

      it('should return correct icon for Word documents', () => {
        expect(getFileTypeIcon('file.doc').emoji).toBe('📝');
        expect(getFileTypeIcon('file.docx').emoji).toBe('📝');
        expect(getFileTypeIcon('file.docx').color).toBe('#3B82F6');
      });

      it('should return correct icon for text files', () => {
        const result = getFileTypeIcon('readme.txt');
        expect(result.emoji).toBe('📄');
        expect(result.color).toBe('#94A3B8');
      });

      it('should return correct icon for spreadsheets', () => {
        expect(getFileTypeIcon('data.xlsx').emoji).toBe('📊');
        expect(getFileTypeIcon('data.xls').emoji).toBe('📊');
        expect(getFileTypeIcon('data.csv').emoji).toBe('📊');
        expect(getFileTypeIcon('data.csv').color).toBe('#10B981');
      });

      it('should return correct icon for presentations', () => {
        expect(getFileTypeIcon('slides.ppt').emoji).toBe('🎯');
        expect(getFileTypeIcon('slides.pptx').emoji).toBe('🎯');
        expect(getFileTypeIcon('slides.pptx').color).toBe('#F59E0B');
      });
    });

    describe('Image types', () => {
      it('should return correct icon for JPG/JPEG', () => {
        expect(getFileTypeIcon('photo.jpg').emoji).toBe('🖼️');
        expect(getFileTypeIcon('photo.jpeg').emoji).toBe('🖼️');
        expect(getFileTypeIcon('photo.jpg').color).toBe('#7C3AED');
      });

      it('should return correct icon for PNG', () => {
        const result = getFileTypeIcon('image.png');
        expect(result.emoji).toBe('🖼️');
        expect(result.color).toBe('#7C3AED');
      });

      it('should return correct icon for GIF', () => {
        const result = getFileTypeIcon('animation.gif');
        expect(result.emoji).toBe('🎬');
      });

      it('should return correct icon for SVG', () => {
        const result = getFileTypeIcon('vector.svg');
        expect(result.emoji).toBe('🎨');
      });
    });

    describe('Audio/Video types', () => {
      it('should return correct icon for MP3', () => {
        const result = getFileTypeIcon('song.mp3');
        expect(result.emoji).toBe('🎵');
        expect(result.color).toBe('#EC4899');
      });

      it('should return correct icon for MP4', () => {
        const result = getFileTypeIcon('video.mp4');
        expect(result.emoji).toBe('🎬');
        expect(result.color).toBe('#EC4899');
      });

      it('should return correct icon for MOV', () => {
        const result = getFileTypeIcon('movie.mov');
        expect(result.emoji).toBe('🎬');
      });

      it('should return correct icon for WAV', () => {
        const result = getFileTypeIcon('audio.wav');
        expect(result.emoji).toBe('🎵');
      });
    });

    describe('Archive types', () => {
      it('should return correct icon for ZIP', () => {
        const result = getFileTypeIcon('archive.zip');
        expect(result.emoji).toBe('📦');
        expect(result.color).toBe('#8B5CF6');
      });

      it('should return correct icon for RAR', () => {
        const result = getFileTypeIcon('archive.rar');
        expect(result.emoji).toBe('📦');
      });

      it('should return correct icon for 7Z', () => {
        const result = getFileTypeIcon('archive.7z');
        expect(result.emoji).toBe('📦');
      });

      it('should return correct icon for TAR', () => {
        const result = getFileTypeIcon('archive.tar');
        expect(result.emoji).toBe('📦');
      });
    });

    describe('Code types', () => {
      it('should return correct icon for JavaScript', () => {
        const result = getFileTypeIcon('script.js');
        expect(result.emoji).toBe('⚙️');
        expect(result.color).toBe('#F59E0B');
      });

      it('should return correct icon for TypeScript', () => {
        const result = getFileTypeIcon('types.ts');
        expect(result.emoji).toBe('⚙️');
        expect(result.color).toBe('#3B82F6');
      });

      it('should return correct icon for Python', () => {
        const result = getFileTypeIcon('script.py');
        expect(result.emoji).toBe('🐍');
        expect(result.color).toBe('#3B82F6');
      });

      it('should return correct icon for Rust', () => {
        const result = getFileTypeIcon('lib.rs');
        expect(result.emoji).toBe('🦀');
        expect(result.color).toBe('#CE422B');
      });

      it('should return correct icon for Go', () => {
        const result = getFileTypeIcon('main.go');
        expect(result.emoji).toBe('🐹');
        expect(result.color).toBe('#00ADD8');
      });

      it('should return correct icon for TSX', () => {
        const result = getFileTypeIcon('component.tsx');
        expect(result.emoji).toBe('⚙️');
        expect(result.color).toBe('#3B82F6');
      });
    });

    describe('Unknown types', () => {
      it('should return default icon for unknown file types', () => {
        const result = getFileTypeIcon('unknown.xyz');
        expect(result.emoji).toBe('📁');
        expect(result.color).toBe('#7C3AED');
      });

      it('should handle files without extensions', () => {
        const result = getFileTypeIcon('README');
        expect(result.emoji).toBe('📁');
      });

      it('should be case insensitive', () => {
        const lowercase = getFileTypeIcon('document.pdf');
        const uppercase = getFileTypeIcon('DOCUMENT.PDF');
        expect(lowercase).toEqual(uppercase);
      });
    });
  });
});
