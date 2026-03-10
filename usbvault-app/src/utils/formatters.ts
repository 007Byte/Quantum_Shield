export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  // Format as "MMM DD, YYYY"
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
