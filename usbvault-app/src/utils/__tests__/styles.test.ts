import { mergeStyles } from '@/utils/styles';

describe('utils/styles - mergeStyles', () => {
  it('merges multiple style objects into one flat object', () => {
    const result = mergeStyles([
      { padding: 16, margin: 0 },
      { margin: 8, backgroundColor: '#1e293b' },
    ]);
    expect(result).toEqual({ padding: 16, margin: 8, backgroundColor: '#1e293b' });
  });

  it('lets later styles override earlier ones', () => {
    const result = mergeStyles([{ backgroundColor: '#000000' }, { backgroundColor: '#ffffff' }]);
    expect(result.backgroundColor).toBe('#ffffff');
  });

  it('filters out falsy conditional styles', () => {
    const isActive = false;
    const isHovered = true;
    const result = mergeStyles([
      { opacity: 1 },
      isActive && { opacity: 0.5 },
      null,
      undefined,
      isHovered && { borderWidth: 2 },
    ]);
    expect(result).toEqual({ opacity: 1, borderWidth: 2 });
  });

  it('returns an empty object when given only falsy values', () => {
    expect(mergeStyles([false, null, undefined])).toEqual({});
  });

  it('returns an empty object for an empty array', () => {
    expect(mergeStyles([])).toEqual({});
  });

  it('produces a new object rather than mutating an input', () => {
    const base = { padding: 4 };
    const result = mergeStyles([base, { margin: 2 }]);
    expect(result).not.toBe(base);
    expect(base).toEqual({ padding: 4 });
  });
});
