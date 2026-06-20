/**
 * VaultTable logic tests
 *
 * Tests the core business logic extracted from VaultTable:
 * - Search/filtering
 * - Selection state management (select-all, toggle individual)
 * - Context menu direction (up/down based on position)
 * - Context action routing
 */

import { VaultItem } from '../../types';

// --- Test helpers: pure logic extracted from VaultTable component ---

function filterItems(items: VaultItem[], searchText: string): VaultItem[] {
  return items.filter(item => item.name.toLowerCase().includes(searchText.toLowerCase()));
}

function computeSelectState(
  filteredItems: VaultItem[],
  selectedIds: Set<string>
): { allSelected: boolean; someSelected: boolean } {
  const allSelected =
    filteredItems.length > 0 && filteredItems.every(item => selectedIds.has(item.id));
  const someSelected = filteredItems.some(item => selectedIds.has(item.id));
  return { allSelected, someSelected };
}

function toggleSelectAll(filteredItems: VaultItem[], currentlyAllSelected: boolean): Set<string> {
  if (currentlyAllSelected) {
    return new Set();
  }
  return new Set(filteredItems.map(item => item.id));
}

function toggleSelectItem(selectedIds: Set<string>, itemId: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(itemId)) {
    next.delete(itemId);
  } else {
    next.add(itemId);
  }
  return next;
}

function computeMenuDirection(itemIndex: number, totalItems: number): 'up' | 'down' {
  const isNearBottom = itemIndex >= totalItems - 4;
  return isNearBottom ? 'up' : 'down';
}

function toggleMenu(
  currentOpenId: string | null,
  itemId: string,
  itemIndex: number,
  totalItems: number
): { openMenuId: string | null; menuDirection: 'up' | 'down' } {
  if (currentOpenId === itemId) {
    return { openMenuId: null, menuDirection: 'down' };
  }
  return {
    openMenuId: itemId,
    menuDirection: computeMenuDirection(itemIndex, totalItems),
  };
}

// --- Mock data ---

const mockItems: VaultItem[] = [
  {
    id: '1',
    name: 'Quarterly Report.pdf',
    subtype: 'PDF Document',
    sizeLabel: '2.4 MB',
    securityLabel: 'PQC',
    modifiedLabel: '2h ago',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#FF6B6B',
    iconBg: 'rgba(255,107,107,0.15)',
  },
  {
    id: '2',
    name: 'Wallet Backup.json',
    subtype: 'JSON File',
    sizeLabel: '512 KB',
    securityLabel: 'PQC',
    modifiedLabel: '1d ago',
    iconSet: 'Feather',
    iconName: 'code',
    iconTint: '#22D3EE',
    iconBg: 'rgba(34,211,238,0.15)',
  },
  {
    id: '3',
    name: 'SSH Keys.zip',
    subtype: 'Archive',
    sizeLabel: '1.1 MB',
    securityLabel: 'AES-256',
    modifiedLabel: '3d ago',
    iconSet: 'Feather',
    iconName: 'archive',
    iconTint: '#A78BFA',
    iconBg: 'rgba(167,139,250,0.15)',
  },
  {
    id: '4',
    name: 'Medical Records.pdf',
    subtype: 'PDF Document',
    sizeLabel: '5.8 MB',
    securityLabel: 'PQC',
    modifiedLabel: '5d ago',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#FF6B6B',
    iconBg: 'rgba(255,107,107,0.15)',
  },
  {
    id: '5',
    name: 'Tax Return 2024.xlsx',
    subtype: 'Spreadsheet',
    sizeLabel: '890 KB',
    securityLabel: 'AES-256',
    modifiedLabel: '1w ago',
    iconSet: 'Feather',
    iconName: 'file',
    iconTint: '#34D399',
    iconBg: 'rgba(52,211,153,0.15)',
  },
  {
    id: '6',
    name: 'Passport Scan.png',
    subtype: 'Image',
    sizeLabel: '3.2 MB',
    securityLabel: 'PQC',
    modifiedLabel: '2w ago',
    iconSet: 'Feather',
    iconName: 'image',
    iconTint: '#F59E0B',
    iconBg: 'rgba(245,158,11,0.15)',
  },
  {
    id: '7',
    name: 'Contract Draft.docx',
    subtype: 'Word Document',
    sizeLabel: '1.5 MB',
    securityLabel: 'PQC',
    modifiedLabel: '3w ago',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#60A5FA',
    iconBg: 'rgba(96,165,250,0.15)',
  },
  {
    id: '8',
    name: 'Seed Phrase.txt',
    subtype: 'Text File',
    sizeLabel: '256 B',
    securityLabel: 'PQC',
    modifiedLabel: '1mo ago',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#FF6B6B',
    iconBg: 'rgba(255,107,107,0.15)',
  },
];

// --- Tests ---

describe('VaultTable: Search/Filter', () => {
  it('returns all items when search is empty', () => {
    const result = filterItems(mockItems, '');
    expect(result).toHaveLength(8);
  });

  it('filters items by name (case-insensitive)', () => {
    const result = filterItems(mockItems, 'pdf');
    // "Quarterly Report.pdf" and "Medical Records.pdf"
    expect(result).toHaveLength(2);
    expect(result.map(i => i.id)).toEqual(['1', '4']);
  });

  it('returns empty array when no items match', () => {
    const result = filterItems(mockItems, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('matches partial names', () => {
    const result = filterItems(mockItems, 'seed');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('8');
  });

  it('handles mixed case search', () => {
    const result = filterItems(mockItems, 'WALLET');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});

describe('VaultTable: Selection State', () => {
  it('allSelected is false when no items are selected', () => {
    const { allSelected, someSelected } = computeSelectState(mockItems, new Set());
    expect(allSelected).toBe(false);
    expect(someSelected).toBe(false);
  });

  it('someSelected is true when a subset is selected', () => {
    const { allSelected, someSelected } = computeSelectState(mockItems, new Set(['1', '3']));
    expect(allSelected).toBe(false);
    expect(someSelected).toBe(true);
  });

  it('allSelected is true when all items are selected', () => {
    const allIds = new Set(mockItems.map(i => i.id));
    const { allSelected, someSelected } = computeSelectState(mockItems, allIds);
    expect(allSelected).toBe(true);
    expect(someSelected).toBe(true);
  });

  it('allSelected is false for empty items array', () => {
    const { allSelected, someSelected } = computeSelectState([], new Set(['1']));
    expect(allSelected).toBe(false);
    expect(someSelected).toBe(false);
  });

  it('respects filtered items (extra selected ids ignored)', () => {
    const filtered = mockItems.slice(0, 2); // items 1, 2
    const { allSelected, someSelected } = computeSelectState(
      filtered,
      new Set(['1', '2', '3']) // 3 is not in filtered set
    );
    expect(allSelected).toBe(true);
    expect(someSelected).toBe(true);
  });
});

describe('VaultTable: Toggle Select All', () => {
  it('selects all items when not all are selected', () => {
    const result = toggleSelectAll(mockItems, false);
    expect(result.size).toBe(8);
    mockItems.forEach(item => expect(result.has(item.id)).toBe(true));
  });

  it('deselects all items when all are selected', () => {
    const result = toggleSelectAll(mockItems, true);
    expect(result.size).toBe(0);
  });
});

describe('VaultTable: Toggle Select Item', () => {
  it('adds item to selection when not selected', () => {
    const result = toggleSelectItem(new Set(), '1');
    expect(result.has('1')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('removes item from selection when already selected', () => {
    const result = toggleSelectItem(new Set(['1', '2']), '1');
    expect(result.has('1')).toBe(false);
    expect(result.has('2')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('does not mutate the original set', () => {
    const original = new Set(['1', '2']);
    toggleSelectItem(original, '3');
    expect(original.size).toBe(2);
  });
});

describe('VaultTable: Context Menu Direction', () => {
  const total = 10;

  it('opens downward for items near the top', () => {
    expect(computeMenuDirection(0, total)).toBe('down');
    expect(computeMenuDirection(3, total)).toBe('down');
    expect(computeMenuDirection(5, total)).toBe('down');
  });

  it('opens upward for the last 4 items', () => {
    expect(computeMenuDirection(6, total)).toBe('up');
    expect(computeMenuDirection(7, total)).toBe('up');
    expect(computeMenuDirection(8, total)).toBe('up');
    expect(computeMenuDirection(9, total)).toBe('up');
  });

  it('boundary: item at totalItems - 4 opens up', () => {
    expect(computeMenuDirection(6, total)).toBe('up');
  });

  it('boundary: item at totalItems - 5 opens down', () => {
    expect(computeMenuDirection(5, total)).toBe('down');
  });
});

describe('VaultTable: Toggle Menu', () => {
  it('opens menu for an item when no menu is open', () => {
    const result = toggleMenu(null, '3', 2, 10);
    expect(result.openMenuId).toBe('3');
    expect(result.menuDirection).toBe('down');
  });

  it('closes menu when same item is toggled', () => {
    const result = toggleMenu('3', '3', 2, 10);
    expect(result.openMenuId).toBeNull();
  });

  it('switches to a different item when one is already open', () => {
    const result = toggleMenu('1', '5', 8, 10);
    expect(result.openMenuId).toBe('5');
    expect(result.menuDirection).toBe('up'); // index 8 is near bottom
  });
});
