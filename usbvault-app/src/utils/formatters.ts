export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * i18n-aware relative time formatter.
 * @param t - Translation function (from useLanguage().t). If omitted, falls back to English.
 * @param locale - BCP-47 locale string for absolute date formatting (e.g. 'de', 'es').
 */
export function formatDate(
  date: Date | string,
  t?: (key: string, opts?: Record<string, unknown>) => string,
  locale?: string,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  const tr = (key: string, count?: number) =>
    t ? t(key, { count }) : formatRelativeEnglish(key, count);

  if (seconds < 60) return tr('common.justNow');
  if (seconds < 3600) return tr('common.minutesAgo', Math.floor(seconds / 60));
  if (seconds < 86400) return tr('common.hoursAgo', Math.floor(seconds / 3600));
  if (seconds < 604800) return tr('common.daysAgo', Math.floor(seconds / 86400));

  return d.toLocaleDateString(locale || 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * i18n-aware relative time for ISO strings or pre-formatted relative strings.
 * Used by password list, vault table, activity feeds.
 */
export function formatRelativeTime(
  isoOrRelative: string,
  t?: (key: string, opts?: Record<string, unknown>) => string,
  locale?: string,
): string {
  // If it's already a relative string (no ISO markers), return as-is
  if (!isoOrRelative.includes('T') && !isoOrRelative.includes('-')) return isoOrRelative;
  return formatDate(isoOrRelative, t, locale);
}

/** English fallback when no translation function is provided */
function formatRelativeEnglish(key: string, count?: number): string {
  switch (key) {
    case 'common.justNow': return 'Just now';
    case 'common.minutesAgo': return `${count}m ago`;
    case 'common.hoursAgo': return `${count}h ago`;
    case 'common.daysAgo': return `${count}d ago`;
    case 'common.weeksAgo': return `${count}w ago`;
    default: return key;
  }
}

export function truncateFilename(name: string, maxLength: number = 30): string {
  if (name.length <= maxLength) return name;

  const ext = name.split('.').pop() || '';
  const nameWithoutExt = name.substring(0, name.length - ext.length - 1);
  const availableLength = maxLength - ext.length - 4; // 4 for "..."

  return nameWithoutExt.substring(0, availableLength) + '...' + (ext ? '.' + ext : '');
}

export function getFileTypeIcon(fileName: string): { emoji: string; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const typeMap: Record<string, { emoji: string; color: string }> = {
    // Documents
    pdf: { emoji: '📄', color: '#EF4444' },
    doc: { emoji: '📝', color: '#3B82F6' },
    docx: { emoji: '📝', color: '#3B82F6' },
    txt: { emoji: '📄', color: '#94A3B8' },
    xlsx: { emoji: '📊', color: '#10B981' },
    xls: { emoji: '📊', color: '#10B981' },
    csv: { emoji: '📊', color: '#10B981' },
    ppt: { emoji: '🎯', color: '#F59E0B' },
    pptx: { emoji: '🎯', color: '#F59E0B' },

    // Images
    jpg: { emoji: '🖼️', color: '#7C3AED' },
    jpeg: { emoji: '🖼️', color: '#7C3AED' },
    png: { emoji: '🖼️', color: '#7C3AED' },
    gif: { emoji: '🎬', color: '#7C3AED' },
    svg: { emoji: '🎨', color: '#7C3AED' },

    // Audio/Video
    mp3: { emoji: '🎵', color: '#EC4899' },
    mp4: { emoji: '🎬', color: '#EC4899' },
    mov: { emoji: '🎬', color: '#EC4899' },
    avi: { emoji: '🎬', color: '#EC4899' },
    wav: { emoji: '🎵', color: '#EC4899' },

    // Archives
    zip: { emoji: '📦', color: '#8B5CF6' },
    rar: { emoji: '📦', color: '#8B5CF6' },
    '7z': { emoji: '📦', color: '#8B5CF6' },
    tar: { emoji: '📦', color: '#8B5CF6' },

    // Code
    js: { emoji: '⚙️', color: '#F59E0B' },
    ts: { emoji: '⚙️', color: '#3B82F6' },
    tsx: { emoji: '⚙️', color: '#3B82F6' },
    py: { emoji: '🐍', color: '#3B82F6' },
    rs: { emoji: '🦀', color: '#CE422B' },
    go: { emoji: '🐹', color: '#00ADD8' },
  };

  return typeMap[ext] || { emoji: '📁', color: '#7C3AED' };
}
