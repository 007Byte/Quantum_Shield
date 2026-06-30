import { formatFileSize, getFileIcon } from '@/utils/fileHelpers';

describe('utils/fileHelpers', () => {
  describe('formatFileSize', () => {
    it('reports bytes below 1 KB with a B suffix', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('reports kilobytes with one decimal at the boundary and above', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB');
    });

    it('reports megabytes with one decimal', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });

    it('reports gigabytes for sizes at or above 1 GiB', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
      expect(formatFileSize(1024 * 1024 * 1024 * 3.2)).toBe('3.2 GB');
    });
  });

  describe('getFileIcon', () => {
    it('maps document extensions to file-text', () => {
      expect(getFileIcon('report.pdf')).toBe('file-text');
      expect(getFileIcon('memo.doc')).toBe('file-text');
      expect(getFileIcon('memo.docx')).toBe('file-text');
    });

    it('maps spreadsheets to bar-chart-2 and slides to layers', () => {
      expect(getFileIcon('budget.xlsx')).toBe('bar-chart-2');
      expect(getFileIcon('data.xls')).toBe('bar-chart-2');
      expect(getFileIcon('deck.pptx')).toBe('layers');
    });

    it('maps archives to archive', () => {
      expect(getFileIcon('bundle.zip')).toBe('archive');
      expect(getFileIcon('bundle.tar')).toBe('archive');
      expect(getFileIcon('bundle.gz')).toBe('archive');
    });

    it('maps images to image and databases to database', () => {
      expect(getFileIcon('photo.png')).toBe('image');
      expect(getFileIcon('vector.svg')).toBe('image');
      expect(getFileIcon('dump.sql')).toBe('database');
    });

    it('maps text/markdown to edit-3', () => {
      expect(getFileIcon('notes.txt')).toBe('edit-3');
      expect(getFileIcon('README.md')).toBe('edit-3');
    });

    it('is case-insensitive on the extension', () => {
      expect(getFileIcon('SCAN.PDF')).toBe('file-text');
      expect(getFileIcon('Pic.JPEG')).toBe('image');
    });

    it('falls back to a generic file icon for unknown or missing extensions', () => {
      expect(getFileIcon('binary.exe')).toBe('file');
      expect(getFileIcon('noextension')).toBe('file');
      expect(getFileIcon('')).toBe('file');
    });
  });
});
