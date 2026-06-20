/**
 * Shared file utility helpers.
 *
 * Canonical implementations of formatFileSize and getFileIcon,
 * previously duplicated across encrypt-store, remove-file, and other screens.
 */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'file-text';
  if (['doc', 'docx'].includes(ext)) return 'file-text';
  if (['xls', 'xlsx'].includes(ext)) return 'bar-chart-2';
  if (['ppt', 'pptx'].includes(ext)) return 'layers';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'image';
  if (['sql', 'db'].includes(ext)) return 'database';
  if (['txt', 'md'].includes(ext)) return 'edit-3';
  return 'file';
}
