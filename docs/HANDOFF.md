# Quantum_Shield — Claude Hand-Off Document

**Last Updated:** March 19, 2026
**Purpose:** Bring any new Claude session up to speed on the current state of the project, active work, design standards, and critical context.

---

## CRITICAL: Read the Design Skill First

Before making ANY UI/UX changes, you MUST read and follow:

```
.claude/skills/SKILL.md
```

This is the master design skill synthesized from 5 industry-standard sources. It contains binding rules for typography, color, layout, animation, accessibility, glass morphism, and anti-patterns. Every UI change must comply with this skill. The root `CLAUDE.md` references it.

---

## Project Structure

```
Enterprise_Version/
├── usbvault-app/          ← React Native + Expo (iOS/Android/Web) — the MAIN APP
├── usbvault-server/       ← Go backend API (PostgreSQL, Redis, S3)
├── usbvault-crypto/       ← Rust FFI cryptographic core
├── usb-companion/         ← Node.js local USB bridge service
├── landing/               ← Next.js 16 marketing landing page (SEPARATE from app)
├── .claude/skills/SKILL.md ← MASTER DESIGN SKILL — always reference this
├── CLAUDE.md              ← Root project instructions
└── docs/                  ← Documentation including this file
```

### Tech Stacks
| Subsystem | Stack |
|-----------|-------|
| App | React Native, Expo Router, TypeScript, Tailwind (NativeWind), Zustand |
| Landing | Next.js 16, React 19, Tailwind CSS v4, Framer Motion 12, TypeScript |
| Server | Go, Chi router, PostgreSQL, Redis, S3/MinIO |
| Crypto | Rust, FFI/JSI bindings |

---

## Current State of Work

### What's Done
1. **Tools screen** — fully functional with 14 tools (8 navigation + 6 inline utilities)
2. **Landing page** — complete 10-section marketing page with animations, scroll effects, glass morphism
3. **Design skill** — comprehensive SKILL.md with 10 sections of binding design rules
4. **App design system overhaul** — glass borders reduced, shadows tinted, display font added, accessibility fixed
5. **App light mode** — ultra-sheer Apple-style frosted glass implemented on dashboard
6. **Accessibility pass** — focus-visible, ARIA labels, touch targets, semantic roles across shell components

### What's In Progress
- **Light mode polish** — Dashboard is done, but the new ultra-sheer glass + color contrast fixes need to be rolled out to ALL other screens (Settings partially done, but needs the latest glass values; Tools, Premium, Vault, and all other tab screens still need the treatment)
- **Light mode color contrast** — The darker cyan palette (`#0E7490`), darker text secondary (`#4A3D6B`), and theme-aware status colors have been set at the palette/proxy level so they cascade automatically, but individual screens may have hardcoded colors that bypass the proxy

### What's Not Started
- **Scroll-driven frame animation** — The `ScrollAnimationPlaceholder` exists in the landing page but real AI-generated USB deconstruction frames haven't been created yet. Components `ScrollAnimation.tsx` and `ScrollFrameCanvas.tsx` are ready for when frames are available.
- **Landing page deployment** — Built but not deployed. Configured for static export (`output: 'export'`).
- **Other locale translations** — Many new i18n keys were added to `en.json` but `es.json`, `fr.json`, `de.json` may be missing the new keys (tools section was added to all, but topBar and rightRail keys may only be in en.json).

---

## Design System — Key Facts

### Fonts
- **Display:** Space Grotesk (loaded via Google Fonts CSS import in `global.css`, applied via `displayFont` from `theme/typography.ts`)
- **Body:** Inter (system default)
- **Monospace:** Geist Mono / JetBrains Mono

### Color Architecture
The app has a **proxy-based color system** in `usbvault-app/src/components/dashboard2/styles.ts`:
- `dashboardColors` is a JavaScript Proxy that reads the current theme from the Zustand store on every property access
- Changing a value in `darkDashboardColors` or `lightDashboardColors` automatically cascades to all 45+ consuming files
- Light mode overrides for glass/cards/panels are in the `lightGlass` export object

**Light mode glass formula (current spec):**
```
Fill:     rgba(255,255,255, 0.04)   — barely visible tint
Border:   rgba(255,255,255, 0.15)   — white edge catch
Shadow:   0 0 15px rgba(139,92,246, 0.08)  — purple halo glow
          inset 0 1px 0 rgba(255,255,255, 0.08) — top highlight
Blur:     backdrop-filter: blur(20px)
```

**Light mode color overrides (applied at palette level):**
- `textPrimary`: `#1A1528` (dark, readable on glass)
- `textSecondary`: `#4A3D6B` (darker than original `#6B6189`)
- `cyan`: `#0E7490` (dark teal, was `#06B6D4` which was invisible)
- `green`: `#16A34A` (stays as-is)

### Key Style Files
| File | Purpose |
|------|---------|
| `usbvault-app/src/components/dashboard2/styles.ts` | Master style system — colors, glass, shadows, light overrides |
| `usbvault-app/src/theme/colors.ts` | Secondary color system (used by non-dashboard components) |
| `usbvault-app/src/theme/typography.ts` | Display font, type scale, font tokens |
| `usbvault-app/src/components/settings/styles.ts` | Settings-specific styles + `settingsLight` overrides |
| `landing/src/app/globals.css` | Landing page Tailwind v4 theme tokens, glass utilities, keyframes |

---

## Known Issues / Technical Debt

1. **Dual color systems** — `theme/colors.ts` and `dashboard2/styles.ts` define overlapping colors. Non-dashboard screens that import from `colors.ts` may not match the dashboard palette. Long-term fix: consolidate into one source of truth.

2. **4 pre-existing TypeScript errors** — in `crypto/native.ts` (unused vars), `appProtection.test.ts` (unused import), `vaultStore.ts` (type mismatch). These predate all recent work and are unrelated.

3. **i18n incomplete for non-English locales** — New `topBar` and `rightRail` keys were added to `en.json` only. The `tools` section was added to all 4 locales. Need to add the topBar/rightRail keys to es/fr/de.

4. **Settings light mode** — The 7 settings section components have `isLight` checks using `settingsLight` overrides, but these were created before the ultra-sheer glass values were finalized. The `settingsLight` object in `settings/styles.ts` may need updating to match the latest `lightGlass` values in `dashboard2/styles.ts`.

5. **Landing page hydration** — `GlobalStarField` and Hero's `StarField` use `useEffect` + `useState` (client-only) to avoid hydration mismatch from `Math.random()`. If adding new random elements, follow the same pattern.

---

## Ralph Loop Methodology

The user requires the **Ralph loop** (Plan/Execute/Check/Adjust) for all multi-step work. This means:
- **Plan:** State what you'll do before doing it
- **Execute:** Do the work (use parallel agents where possible)
- **Check:** Verify the work (TypeScript check, visual review, test)
- **Adjust:** Fix anything that failed the check

Always use `TodoWrite` to track progress through Ralph loops. Mark tasks as completed as you go, not in batches.

---

## How to Run

### App (web)
```bash
cd usbvault-app
npm run web
# Opens at localhost:8081
```

### Landing Page
```bash
cd landing
npm run dev
# Opens at localhost:3000
```

### TypeScript Check (App)
```bash
cd usbvault-app
npx tsc --noEmit --pretty
# Should show only 4 pre-existing errors
```

### Landing Build
```bash
cd landing
npm run build
# Static export to landing/out/
```

---

## Priority Next Steps

1. **Roll out ultra-sheer glass to remaining app screens** — Apply the dashboard's light mode glass spec to Tools, Premium, Vault, and all other tab screens. The palette-level changes (text colors, cyan) already cascade, but per-screen `isLight && lightGlass.xxx` application may be needed.

2. **Generate USB deconstruction frames** — Use AI video tool (Kling, Runway) to create 100-150 WebP frames of USB vault deconstructing to quantum level. Extract with ffmpeg. Swap `ScrollAnimationPlaceholder` for `ScrollAnimation` component.

3. **Complete i18n** — Add missing topBar/rightRail translation keys to es.json, fr.json, de.json.

4. **Consolidate color systems** — Merge `theme/colors.ts` into `dashboard2/styles.ts` proxy system, or create a unified theme provider.

5. **Test accessibility** — Tab-navigate through every screen, verify VoiceOver/screen reader announces correctly, verify all touch targets >= 44px.
