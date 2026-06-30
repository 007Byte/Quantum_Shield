/**
 * Unit tests for useFocusTrap.
 *
 * This hook is web-only and manipulates the real DOM (jsdom provides it under
 * the service-layer jest config). The genuine boundaries are:
 *   - Platform.OS  (must be 'web' for the effects to run)
 *   - document / DOM focus + keydown events
 *
 * We render the hook, attach its returned ref to a real container with
 * focusable children, and assert the Tab-cycling + Escape behavior.
 */
import { renderHook, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useFocusTrap } from '../useFocusTrap';

// Build a container with three focusable buttons and attach it to the ref.
function buildTrap(ref: { current: HTMLElement | null }) {
  const container = document.createElement('div');
  const first = document.createElement('button');
  first.textContent = 'first';
  const middle = document.createElement('button');
  middle.textContent = 'middle';
  const last = document.createElement('button');
  last.textContent = 'last';
  container.appendChild(first);
  container.appendChild(middle);
  container.appendChild(last);
  document.body.appendChild(container);
  ref.current = container;
  return { container, first, middle, last };
}

function pressTab(opts: { shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function pressEscape() {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe('useFocusTrap', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    (Platform as any).OS = 'web';
    // Clear the jsdom body via the node API (avoids innerHTML, which trips the
    // repo's Semgrep XSS rule even in tests).
    document.body.replaceChildren();
  });

  afterEach(() => {
    (Platform as any).OS = originalOS;
    document.body.replaceChildren();
  });

  it('is a no-op on native platforms (no listener registered)', () => {
    (Platform as any).OS = 'ios';
    const addSpy = jest.spyOn(document, 'addEventListener');
    const { result } = renderHook(() => useFocusTrap(true));
    expect(result.current.current).toBeNull();
    const keydownRegistrations = addSpy.mock.calls.filter(c => c[0] === 'keydown');
    expect(keydownRegistrations).toHaveLength(0);
    addSpy.mockRestore();
  });

  it('returns a ref and does nothing while inactive', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const { result } = renderHook(() => useFocusTrap(false));
    expect(result.current).toHaveProperty('current');
    const keydownRegistrations = addSpy.mock.calls.filter(c => c[0] === 'keydown');
    expect(keydownRegistrations).toHaveLength(0);
    addSpy.mockRestore();
  });

  it('wraps focus from the last element back to the first on Tab', () => {
    const { result, rerender } = renderHook(({ active }) => useFocusTrap(active), {
      initialProps: { active: false },
    });
    const { last, first } = buildTrap(result.current);

    // Activating registers the keydown listener.
    act(() => rerender({ active: true }));

    last.focus();
    expect(document.activeElement).toBe(last);

    let event!: KeyboardEvent;
    act(() => {
      event = pressTab();
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('wraps focus from the first element to the last on Shift+Tab', () => {
    const { result, rerender } = renderHook(({ active }) => useFocusTrap(active), {
      initialProps: { active: false },
    });
    const { first, last } = buildTrap(result.current);

    act(() => rerender({ active: true }));

    first.focus();
    expect(document.activeElement).toBe(first);

    let event!: KeyboardEvent;
    act(() => {
      event = pressTab({ shiftKey: true });
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('does not steal focus when Tab is pressed in the middle of the trap', () => {
    const { result, rerender } = renderHook(({ active }) => useFocusTrap(active), {
      initialProps: { active: false },
    });
    const { middle } = buildTrap(result.current);

    act(() => rerender({ active: true }));

    middle.focus();
    let event!: KeyboardEvent;
    act(() => {
      event = pressTab();
    });

    // Not at an edge → the hook lets the browser handle it (no preventDefault).
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(middle);
  });

  it('invokes onEscape and prevents default on Escape', () => {
    const onEscape = jest.fn();
    const { result, rerender } = renderHook(({ active }) => useFocusTrap(active, onEscape), {
      initialProps: { active: false },
    });
    buildTrap(result.current);

    act(() => rerender({ active: true }));

    let event!: KeyboardEvent;
    act(() => {
      event = pressEscape();
    });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('always uses the latest onEscape via the ref without re-registering', () => {
    const firstCb = jest.fn();
    const secondCb = jest.fn();
    const { result, rerender } = renderHook(({ active, cb }) => useFocusTrap(active, cb), {
      initialProps: { active: false, cb: firstCb },
    });
    buildTrap(result.current);

    act(() => rerender({ active: true, cb: firstCb }));
    // Swap the callback on a re-render while staying active.
    act(() => rerender({ active: true, cb: secondCb }));

    act(() => {
      pressEscape();
    });

    expect(firstCb).not.toHaveBeenCalled();
    expect(secondCb).toHaveBeenCalledTimes(1);
  });

  it('removes the keydown listener when deactivated', () => {
    const onEscape = jest.fn();
    const { result, rerender } = renderHook(({ active }) => useFocusTrap(active, onEscape), {
      initialProps: { active: false },
    });
    buildTrap(result.current);

    act(() => rerender({ active: true }));
    act(() => rerender({ active: false }));

    act(() => {
      pressEscape();
    });

    expect(onEscape).not.toHaveBeenCalled();
  });
});
