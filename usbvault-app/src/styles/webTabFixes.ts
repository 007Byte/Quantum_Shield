/**
 * Web-only CSS fixes for React Navigation v7 tab scenes and hover states.
 *
 * These rules are injected once on mount via a <style> element. They fix:
 * 1. Inactive tab scene bleed-through (z-index:-1 doesn't hide transparent screens)
 * 2. Hover highlights for Pressable elements (RNW state.hovered doesn't fire)
 * 3. Light mode glass panel visibility overrides
 *
 * Extracted from (tabs)/_layout.tsx to keep the layout file focused on routing.
 */

export const WEB_TAB_FIX_STYLE_ID = 'usbvault-tab-scene-fix';

export const WEB_TAB_FIX_CSS = `
/* ── Initial-load transition suppression ─────────────────────────
   Prevents visual "glitch" where cards/buttons animate from default
   to final styles when CSS overrides kick in after first paint.
   The .loading class is added synchronously in the HTML <head> and
   removed ~80ms after React hydrates (see injectWebTabFixCSS). */
body.loading * {
  transition: none !important;
  animation: none !important;
}

/* ── Accessibility: prefers-reduced-motion ──────────────────────
   Disables all transitions and animations when the user has
   requested reduced motion in their OS settings. Per SKILL.md
   line 135: honour prefers-reduced-motion; opacity-only fallback. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}

/* Hide inactive tab scenes — React Nav v7 uses z-index:-1 to hide them,
   but they remain in the compositing layer and bleed through transparent
   backgrounds. display:none removes them from layout entirely. */
[style*="z-index: -1"],
[style*="z-index:-1"] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Legacy selector: some React Nav versions use opacity:0 + pointer-events:none */
[style*="pointer-events: none"][style*="opacity: 0"],
[style*="pointer-events:none"][style*="opacity:0"] {
  display: none !important;
}

/* ── Hover highlights ──────────────────────────────────────────────
   RNW Pressable doesn't attach pointer-enter/leave handlers in this
   build, so state.hovered never fires. Pure-CSS :hover rules restore
   the visual feedback the app was designed to have.

   Element inventory (audited across all screens):
     t23y2h  14px — Sidebar nav items, Encrypt algorithm cards
     1xfd6ze  8px — Section headers (FILES/VAULT/USB), Remove-file rows
     1867qdf 16px — CTA buttons (Go Premium, Encrypt New, Add Password)
     1q9bdsx 12px — Header bar buttons (Light, EN, notifications, User)
     16uyjmq 22px — Pill buttons (Save to Device, Encrypt Now, New Message)
     kdyh1x   6px — Small icon buttons (view, download, checkboxes)
     1dzdj1l 10px — File rows (Decrypt page), Launch buttons (Tools)
     6ncur5  18px — Tool cards (File Shredder, Hash Checker)
     NO-RADIUS     — Dashboard file rows, Help cards
   ───────────────────────────────────────────────────────────────── */

/* Smooth transitions for ALL interactive elements */
.r-cursor-1loqt21 {
  transition: filter 0.15s ease, background-color 0.15s ease,
              border-color 0.15s ease, box-shadow 0.15s ease,
              transform 0.15s ease !important;
}

/* ── TIER 1: Sidebar nav items + Encrypt algorithm cards (14px) ── */
.r-borderRadius-t23y2h.r-cursor-1loqt21[tabindex="0"]:hover {
  border-color: rgba(139,92,246,0.26) !important;
  background: linear-gradient(130deg, rgba(139,92,246,0.2), rgba(34,211,238,0.08)) !important;
  box-shadow: 0 0 16px rgba(139,92,246,0.3), 0 0 24px rgba(34,211,238,0.1) !important;
}

/* ── TIER 2: CTA / action buttons (16px) — Go Premium, Add Password ── */
.r-borderRadius-1867qdf.r-cursor-1loqt21[tabindex="0"]:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(139,92,246,0.45), 0 0 20px rgba(34,211,238,0.2) !important;
  filter: brightness(1.12);
}

/* ── TIER 2b: Pill buttons (22px) — Save to Device, Encrypt Now ── */
.r-borderRadius-16uyjmq.r-cursor-1loqt21[tabindex="0"]:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(139,92,246,0.3), 0 0 12px rgba(34,211,238,0.15) !important;
  filter: brightness(1.1);
}

/* ── TIER 3: Tool cards (18px) — File Shredder, Hash Checker ── */
.r-borderRadius-6ncur5.r-cursor-1loqt21[tabindex="0"]:hover {
  border-color: rgba(139,92,246,0.3) !important;
  background-color: rgba(139,92,246,0.08) !important;
  box-shadow: 0 0 20px rgba(139,92,246,0.25), 0 0 10px rgba(34,211,238,0.1) !important;
}

/* ── TIER 4: Section headers (8px with tabindex) ── */
.r-borderRadius-1xfd6ze.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(139,92,246,0.08) !important;
}

/* ── TIER 5: File / list rows ── */
/* Decrypt file rows (10px) */
.r-borderRadius-1dzdj1l.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(139,92,246,0.07) !important;
  border-color: rgba(139,92,246,0.2) !important;
}
/* Remove-file rows & vault rows (8px, no tabindex or tabindex=0) */
.r-borderRadius-1xfd6ze.r-cursor-1loqt21:hover {
  background-color: rgba(139,92,246,0.06) !important;
}
/* Dashboard file rows (no border-radius class) */
.r-cursor-1loqt21[tabindex="0"]:not([class*="r-borderRadius-"]):hover {
  background-color: rgba(139,92,246,0.05) !important;
}

/* ── TIER 6: Small icon buttons (6px) — view / download ── */
.r-borderRadius-kdyh1x.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(139,92,246,0.15) !important;
  transform: scale(1.12);
}

/* ── TIER 7: Header bar buttons (12px) — theme toggle, lang, user ── */
.r-borderRadius-1q9bdsx.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(139,92,246,0.1) !important;
}

/* ── TIER 8: Help cards (22px computed, no radius class) ── */
.r-cursor-1loqt21[tabindex="0"][class*="css-view"]:hover {
  filter: brightness(1.08);
}

/* ── Universal fallback — anything not caught above ── */
.r-cursor-1loqt21[tabindex="0"]:hover {
  filter: brightness(1.08);
}

/* ── Light mode inline-style background fixes ───────────────────
   Some components set background-color via inline style (webOnly),
   so class-based overrides can't reach them. Attribute selectors
   with !important override inline styles. */

[data-theme="light"] [style*="background-color: rgba(18, 12, 40"] {
  background-color: rgba(255,255,255,0.65) !important;
  border-color: rgba(139,92,246,0.18) !important;
}

[data-theme="light"] [style*="background-color: rgba(14, 10, 34"] {
  background-color: rgba(255,255,255,0.80) !important;
  border-color: rgba(139,92,246,0.18) !important;
}

[data-theme="light"] [style*="background-color: rgb(26, 15, 58)"],
[data-theme="light"] [style*="background-color: rgb(18, 10, 38)"],
[data-theme="light"] [style*="background-color: rgb(11, 6, 23)"] {
  background-color: #F3EFF8 !important;
}

[data-theme="light"] [style*="background-color: rgb(15, 11, 30)"],
[data-theme="light"] [style*="background-color: rgb(26, 21, 48)"] {
  background-color: #FFFFFF !important;
}

[data-theme="light"] [style*="background-color: rgb(37, 29, 64)"] {
  background-color: #F0ECF5 !important;
}

/* Reverse: dark mode fixes for inline light backgrounds */
[data-theme="dark"] [style*="background-color: rgba(255, 255, 255, 0.65)"] {
  background-color: rgba(18,12,40,0.65) !important;
}

[data-theme="dark"] [style*="background-color: rgba(255, 255, 255, 0.8)"] {
  background-color: rgba(14,10,34,0.74) !important;
}

/* ── Light mode glass panel visibility ────────────────────────────
   lightGlass.*Web styles use the CSS background shorthand (gradient)
   which resets background-color to transparent. On the lavender page
   background (#EDE8F5) these nearly-invisible gradients make panels
   disappear.
   IMPORTANT: Do NOT use a blanket [style*="backdrop-filter"] rule —
   the outermost ShellLayout wrapper also has backdrop-filter, and
   making it opaque hides the page background entirely. Instead,
   target each gradient angle individually. */

/* Section-level gradients (160deg) — content areas, algorithm panels.
   Keep semi-transparent so cosmic background-light.png shows through. */
[data-theme="light"] [style*="linear-gradient(160deg"] {
  background: linear-gradient(160deg, rgba(255,255,255,0.52), rgba(255,255,255,0.42)) !important;
  border: 1px solid rgba(139,92,246,0.15) !important;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5) !important;
}

/* Card-level gradients (145deg) — algorithm cards, action cards, file rows */
[data-theme="light"] [style*="linear-gradient(145deg"] {
  background: linear-gradient(145deg, rgba(255,255,255,0.48), rgba(255,255,255,0.35)) !important;
  border: 1px solid rgba(139,92,246,0.12) !important;
  box-shadow: 0 1px 8px rgba(0,0,0,0.03) !important;
}

/* CTA button gradients (135deg) — Go Premium, special buttons */
[data-theme="light"] [style*="linear-gradient(135deg"] {
  border: 1px solid rgba(139,92,246,0.18) !important;
}

/* Sidebar gradient (170deg) — keep slightly softer for depth */
[data-theme="light"] [style*="linear-gradient(170deg"] {
  background: linear-gradient(170deg, rgba(255,255,255,0.30), rgba(255,255,255,0.38), rgba(255,255,255,0.42)) !important;
  border-color: rgba(139,92,246,0.12) !important;
}

/* ── Light mode hover overrides ─────────────────────────────────
   In light mode the base panels are white/near-white, so we need
   stronger purple tints and visible box-shadows to be noticeable. */

/* TIER 1: Sidebar nav + Encrypt algo cards */
[data-theme="light"] .r-borderRadius-t23y2h.r-cursor-1loqt21[tabindex="0"]:hover {
  background: linear-gradient(130deg, rgba(124,58,237,0.18), rgba(6,182,212,0.08)) !important;
  border-color: rgba(124,58,237,0.35) !important;
  box-shadow: 0 2px 16px rgba(124,58,237,0.22), 0 0 24px rgba(6,182,212,0.10) !important;
}

/* TIER 2: CTA buttons */
[data-theme="light"] .r-borderRadius-1867qdf.r-cursor-1loqt21[tabindex="0"]:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(124,58,237,0.35), 0 0 18px rgba(6,182,212,0.15) !important;
  filter: brightness(0.92);
}

/* TIER 2b: Pill buttons */
[data-theme="light"] .r-borderRadius-16uyjmq.r-cursor-1loqt21[tabindex="0"]:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(124,58,237,0.28), 0 0 12px rgba(6,182,212,0.12) !important;
  filter: brightness(0.93);
}

/* TIER 3: Tool cards */
[data-theme="light"] .r-borderRadius-6ncur5.r-cursor-1loqt21[tabindex="0"]:hover {
  border-color: rgba(124,58,237,0.35) !important;
  background-color: rgba(124,58,237,0.10) !important;
  box-shadow: 0 3px 20px rgba(124,58,237,0.20), 0 0 12px rgba(6,182,212,0.08) !important;
}

/* TIER 4: Section headers */
[data-theme="light"] .r-borderRadius-1xfd6ze.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(124,58,237,0.10) !important;
}

/* TIER 5: File / list rows */
[data-theme="light"] .r-borderRadius-1dzdj1l.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(124,58,237,0.10) !important;
  border-color: rgba(124,58,237,0.25) !important;
  box-shadow: 0 1px 8px rgba(124,58,237,0.10) !important;
}
[data-theme="light"] .r-borderRadius-1xfd6ze.r-cursor-1loqt21:hover {
  background-color: rgba(124,58,237,0.09) !important;
}
[data-theme="light"] .r-cursor-1loqt21[tabindex="0"]:not([class*="r-borderRadius-"]):hover {
  background-color: rgba(124,58,237,0.08) !important;
  box-shadow: 0 1px 6px rgba(124,58,237,0.08) !important;
}

/* TIER 6: Icon buttons */
[data-theme="light"] .r-borderRadius-kdyh1x.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(124,58,237,0.18) !important;
  transform: scale(1.15);
  box-shadow: 0 2px 8px rgba(124,58,237,0.15) !important;
}

/* TIER 7: Header bar buttons */
[data-theme="light"] .r-borderRadius-1q9bdsx.r-cursor-1loqt21[tabindex="0"]:hover {
  background-color: rgba(124,58,237,0.12) !important;
  box-shadow: 0 1px 6px rgba(124,58,237,0.10) !important;
}

/* Universal fallback — light mode */
[data-theme="light"] .r-cursor-1loqt21[tabindex="0"]:hover {
  filter: brightness(0.93);
}
`;

/**
 * Force-refresh the webTabFixes stylesheet on theme toggle.
 * Removes and re-injects the <style> element so the browser re-evaluates
 * all [data-theme] attribute selectors against the updated attribute.
 */
export function refreshWebTabFixCSS(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(WEB_TAB_FIX_STYLE_ID);
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.id = WEB_TAB_FIX_STYLE_ID;
  style.textContent = WEB_TAB_FIX_CSS;
  document.head.appendChild(style);
}

/**
 * Injects or refreshes the web-only CSS <style> element.
 * Call once on mount; returns a cleanup function that removes the element.
 *
 * Also manages the `body.loading` class that suppresses transitions during
 * the initial render cycle. The class is added synchronously here (before
 * the CSS rules apply) and removed after a short delay so the first paint
 * is glitch-free.
 */
export function injectWebTabFixCSS(): (() => void) | undefined {
  if (typeof document === 'undefined') return undefined;

  // The `body.loading` class is added at module level in _layout.tsx
  // (before React renders) so transitions are suppressed from the very
  // first paint. We just need to inject the CSS rule and schedule removal.
  document.body.classList.add('loading'); // ensure present in case of hot-reload

  const existing = document.getElementById(WEB_TAB_FIX_STYLE_ID);
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.id = WEB_TAB_FIX_STYLE_ID;
  style.textContent = WEB_TAB_FIX_CSS;
  document.head.appendChild(style);

  // Remove loading class after two animation frames — enough for the
  // browser to composite the final layout without animating transitions.
  const rafId = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('loading');
    });
  });

  return () => {
    cancelAnimationFrame(rafId);
    document.body.classList.remove('loading');
    const el = document.getElementById(WEB_TAB_FIX_STYLE_ID);
    if (el) el.remove();
  };
}
