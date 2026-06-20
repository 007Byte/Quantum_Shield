---
name: usbvault-design
description: "Master design skill for USBVault Enterprise. Synthesized from Anthropic frontend-design, UI/UX Pro Max, taste-skill, ClaudeKit, and platform-design-skills. Covers visual design, typography, color, layout, animation, accessibility, and code quality. Apply whenever building or modifying ANY user-facing interface."
---

# USBVault Enterprise — Master Design Skill

Apply this skill whenever the task changes how a feature **looks, feels, moves, or is interacted with**. This includes new pages, components, refactors, reviews, and style decisions.

---

## 1. Design Philosophy

**Commit to a bold, intentional aesthetic.** Every output must read as a $150k agency build, not a template with nice fonts. The key is commitment to a clear conceptual direction executed with precision.

**Three tunable dials** (set per project or page):
- **DESIGN_VARIANCE** (default 7/10): 1-3 = symmetrical grids. 4-7 = overlapping, varied aspect ratios. 8-10 = masonry, fractional grids, massive empty zones.
- **MOTION_INTENSITY** (default 6/10): 1-3 = CSS hover only. 4-7 = cubic-bezier transitions, stagger cascades. 8-10 = scroll-triggered reveals, Framer Motion hooks.
- **VISUAL_DENSITY** (default 4/10): 1-3 = Art Gallery (huge whitespace). 4-7 = normal app. 8-10 = Cockpit (tiny paddings, monospace numbers).

**USBVault brand direction:** Dark luxury cyberpunk. Ethereal glass aesthetic with OLED-depth blacks, mesh gradients, backdrop-blur. Deep purple/cyan accents — but used with restraint, not neon excess.

---

## 2. Typography

### Required
- **Display font:** Space Grotesk, Geist, Clash Display, Satoshi, or Plus Jakarta Sans. NEVER Inter, Roboto, Arial, Open Sans, or system fonts for headlines.
- **Body font:** Inter or Geist for body text only (where legibility trumps personality).
- **Monospace:** Geist Mono, JetBrains Mono, SF Mono for code/data.
- **Base size:** 16px minimum body. Line-height 1.5-1.75 for body.
- **Max line length:** 65-75 characters (`max-w-[65ch]`).
- **Type scale:** Consistent (12, 14, 16, 18, 24, 32, 48).
- **Weight hierarchy:** Bold (700) headlines, SemiBold (600) subheads, Medium (500) labels, Regular (400) body.
- **Tracking:** Negative for large headers (`tracking-tighter`), neutral for body, positive for small caps/labels (`tracking-widest`).
- **Tabular figures:** `font-variant-numeric: tabular-nums` for numbers, prices, data columns.
- **Fluid type:** Use `clamp()` for responsive sizing.

### Banned
- All-caps subheaders everywhere. Mix case styles.
- Orphaned words on last line — use `text-wrap: balance`.
- Body text in pure black (#000000) — use off-black (#111, #1a1a2e).
- Text < 12px for body content.

---

## 3. Color & Theme

### USBVault Palette
- **Background:** #09040f (landing), #0F0B1E (app). Never pure #000000.
- **Purple accent:** #753cff (primary), #8B5CF6 (hover). ONE accent — do not scatter multiple saturated colors.
- **Cyan accent:** #22D3EE (secondary highlight, used sparingly).
- **Text:** #F5F3FF (primary), #B7B2D9 (secondary), #64748B (muted).
- **Glass:** rgba(18,12,40,0.65) bg + blur(18px) + rgba(139,92,246,0.35) border.

### Rules
- **Max 1 accent color** per surface. Saturation < 80%.
- **Semantic tokens only** — never raw hex in components. Use CSS variables or theme tokens.
- **Tint all shadows** to match background hue. No generic black shadows.
- **Stick to one gray family** — all grays consistently warm OR cool, never both.
- **Dark mode:** desaturated/lighter tonal variants, NOT inverted. Elevation-based tonal mapping, not pure black surfaces.
- **Contrast:** 4.5:1 normal text (AA), 3:1 large text/UI components. Test BOTH light and dark modes separately.
- **`prefers-contrast: more`** support for Windows High Contrast.

### Banned
- Pure #000000 backgrounds — use off-black, tinted darks.
- Oversaturated neon accents. Desaturate to blend.
- AI Purple/Blue glow aesthetic as default — use with taste and restraint.
- Mixing warm and cool grays in the same project.
- Random dark sections in a light-mode page (or vice versa).

---

## 4. Layout & Spacing

### Required
- **4pt/8dp spacing system:** 4, 8, 12, 16, 24, 32, 48, 64.
- **Mobile-first:** Base styles for smallest viewport, layer with `min-width`.
- **Breakpoints:** 375 / 768 / 1024 / 1440.
- **Container:** `max-w-7xl mx-auto` (~1280px) or `max-w-[1400px]`.
- **Viewport stability:** NEVER `h-screen`. ALWAYS `min-h-[100dvh]`.
- **Grid over flex-math:** NEVER `w-[calc(33%-1rem)]`. ALWAYS `grid grid-cols-1 md:grid-cols-3 gap-6`.
- **Section padding:** `py-16 md:py-24` standard. Increase for hero/CTA.
- **Z-index scale:** 0 / 10 / 20 / 40 / 100 / 1000. No arbitrary z-9999.
- **Safe areas:** Respect notch, Dynamic Island, home indicator, fixed nav bars.
- **Bottom padding > top padding** for optical balance.
- **Pin buttons to bottom** in card groups. Feature lists start at same vertical position.

### Breaking the Grid (DESIGN_VARIANCE > 4)
- Avoid centered Hero/H1 — try split-screen (50/50), left-aligned, asymmetric whitespace.
- Three-equal-card-columns is the MOST GENERIC AI layout. Replace with 2-col zig-zag, asymmetric grid, horizontal scroll, masonry.
- Use offset margins, mixed aspect ratios, left-aligned headers over centered content.
- Negative margins for layering and depth.
- Vary border-radius: tighter on inner elements, softer on containers.

### Cards
- Cards ONLY when elevation communicates hierarchy. Otherwise use `border-t`, `divide-y`, or negative space.
- Double-Bezel technique: outer shell (subtle bg, hairline border, padding, large radius) + inner core (its own bg, inner highlight shadow, smaller radius).
- Card borders: `1px solid` at very low opacity (0.06-0.15). Not harsh lines.

### Banned
- Horizontal scroll on mobile.
- Fixed px container widths.
- `user-scalable=no` or `maximum-scale=1`.
- Content without max-width constraint on desktop.

---

## 5. Animation & Motion

### Timing
- **Micro-interactions:** 150-300ms.
- **Complex transitions:** ≤400ms. Never >500ms.
- **Easing:** ease-out for entering, ease-in for exiting. Never linear for UI.
- **Spring physics preferred:** `type: "spring", stiffness: 100, damping: 20`.
- **Exit faster than enter:** 60-70% of enter duration.
- **Stagger:** 30-50ms per item (UI/UX Pro Max standard).

### Patterns
- **One orchestrated page load** with staggered reveals creates more delight than scattered micro-interactions.
- **Scroll-triggered reveals:** Framer Motion `whileInView` with `viewport={{ once: true }}`. Use IntersectionObserver, NEVER `window.addEventListener('scroll')` for reveals.
- **Hover states:** Subtle scale (0.95-1.05), shadow shift, color transition. Every interactive element needs hover + active feedback.
- **Card hover:** `whileHover={{ y: -4, scale: 1.01 }}` with tinted shadow amplification.
- **FAQ/Accordion:** AnimatePresence + layout prop for smooth height animation.
- **Perpetual micro-animations:** Pulse, float, shimmer — but isolated in own Client Components, memoized, with cleanup.

### Performance
- Only animate `transform` and `opacity`. NEVER `top`, `left`, `width`, `height`.
- `will-change` sparingly — only on actively animating elements, remove after.
- Blur effects (`backdrop-filter`) only on fixed/sticky elements. NEVER on scrolling containers.
- Grain/noise overlays: exclusively on fixed `pointer-events-none` pseudo-elements.
- Perpetual animations: MUST be memoized (React.memo) and isolated. Never trigger parent re-renders.

### Accessibility
- ALWAYS respect `prefers-reduced-motion`. Disable animations, simplify to opacity-only.
- Animations must be interruptible — user tap/gesture cancels immediately.
- Never block user input during animation.
- No flashing > 3 times per second (seizure risk, WCAG SC 2.3.1).

### Banned
- Instant state changes (0ms transitions).
- Decorative-only animation with no meaning.
- Mixing GSAP and Framer Motion in same component tree.
- `useState` for continuous animations — use `useMotionValue`/`useTransform`.

---

## 6. Glass Morphism & Effects

### Techniques
- **True glassmorphism:** `backdrop-filter: blur(18px)` + 1px inner border (`border-white/10`) + subtle inner shadow (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`) for edge refraction.
- **Gradient borders:** Animated shimmer via `::before` pseudo-element with `background-size: 200%` + `animation: shimmer`.
- **Mesh gradients:** Animated gradient orbs for ambient atmosphere. CSS `@keyframes` (compositor thread), not Framer.
- **Noise/grain overlay:** SVG turbulence filter on fixed pseudo-element, opacity 0.02-0.04.
- **Tinted shadows:** Carry hue of background, not pure black. `shadow-[0_20px_40px_-15px_rgba(117,60,255,0.15)]`.
- **Spotlight borders:** Card borders that illuminate dynamically under cursor position.

### Rules
- Orbs: max 3-5 per section. `will-change: transform`. `pointer-events: none`.
- Orbs positioned WITHIN sections (not at edges) to avoid visible color banding.
- Section transitions should be seamless — no hard borders between sections. Use the same background color throughout, let orbs provide variation.
- Glass borders at very low opacity — should feel like light catching an edge, not a visible box.

### Banned
- Visible hard lines between page sections. Sections should flow seamlessly.
- `border-t` between sections — use gradient fades or shared background.
- Orbs at section edges creating color bands at boundaries.
- Heavy drop shadows (shadow-md, shadow-lg, shadow-xl) without tinting.

---

## 7. Accessibility (CRITICAL)

### Required (Non-Negotiable)
- **Semantic HTML:** `<main>`, `<nav>`, `<header>`, `<footer>`, `<article>`, `<section>`, `<dialog>`. Never `<div onclick>`.
- **Heading hierarchy:** h1-h6 in order, no skipping. One h1 per page.
- **Color contrast:** 4.5:1 normal text, 3:1 large text/UI, 3:1 focus indicators (WCAG 2.2).
- **Focus indicators:** `:focus-visible` with 3px outline, 2px offset. Never remove focus rings.
- **Keyboard navigation:** All interactive elements via Tab. Focus trap in modals. Never tabindex > 0.
- **Skip navigation:** "Skip to main content" link.
- **Alt text:** Informative for content images, `alt=""` for decorative, `aria-hidden="true"` for decorative SVGs.
- **ARIA labels:** On icon-only buttons. Prefer visible text over ARIA.
- **Touch targets:** 44x44px minimum (48x48dp Android). 24px spacing between.
- **Form labels:** Programmatically associated via `<label for>`. Never placeholder as sole label.
- **Error messages:** Near the field, state cause + fix. `aria-describedby` linking.
- **Reduced motion:** `prefers-reduced-motion` fully respected.
- **Dynamic Type / text scaling:** Supported up to 200% without breakage.
- **Color not sole indicator:** Always add icon/text alongside color meaning.

### Banned
- `<div>` or `<span>` as buttons without role/keyboard handling.
- Emoji as structural icons — use SVG (Phosphor, Heroicons, Lucide).
- `user-scalable=no`.
- Color-only state indication.
- Missing focus rings.
- Placeholder-only form labels.

---

## 8. Anti-Patterns (The "AI Slop" Checklist)

If your output has ANY of these, it fails the quality bar:

### Visual
- [ ] Inter/Roboto/Arial as headline font
- [ ] Pure #000000 background
- [ ] Neon outer glows
- [ ] Oversaturated gradient text on large headers
- [ ] Three-equal-card-columns layout
- [ ] Everything centered and symmetrical
- [ ] Heavy default Tailwind shadows (shadow-md/lg/xl)
- [ ] Mixing warm and cool grays
- [ ] Hard visible borders between page sections
- [ ] Flat design with zero texture or depth

### Content
- [ ] "Lorem ipsum" anywhere
- [ ] Generic names: "John Doe", "Sarah Chan"
- [ ] Fake round numbers: 99.99%, 50%, 10,000+
- [ ] Filler words: "Elevate", "Seamless", "Unleash", "Next-Gen", "Cutting-Edge"
- [ ] "Oops!" error messages
- [ ] Exclamation marks in success messages
- [ ] Title Case On Every Header

### Technical
- [ ] `height: 100vh` instead of `min-height: 100dvh`
- [ ] No max-width container on desktop
- [ ] Animating `top/left/width/height`
- [ ] `window.addEventListener('scroll')` for reveals (use IntersectionObserver)
- [ ] No `prefers-reduced-motion` support
- [ ] Missing favicon
- [ ] No skip-to-content link
- [ ] Dead links (`href="#"`) in production
- [ ] Div soup instead of semantic HTML
- [ ] Arbitrary z-index values (z-9999)
- [ ] Import hallucinations (packages not in package.json)
- [ ] `// ...rest of code` or `// TODO` in delivered code

---

## 9. Code Quality

### React / Next.js
- TypeScript strict mode. No `any` type.
- `"use client"` only on components that need browser APIs. Keep server components where possible.
- Lazy load heavy components: `React.lazy()` + `<Suspense>`.
- `useCallback` for handlers passed to children. `useMemo` for expensive computations.
- Feature directory structure: `api/`, `components/`, `hooks/`, `helpers/`, `types/`.
- Check `package.json` before importing ANY library. Never assume availability.
- RSC Safety: global state only in Client Components.
- Tailwind version awareness: Check v3 vs v4 syntax. v4 uses `@theme inline` in CSS, not `tailwind.config.ts`.

### CSS / Tailwind
- Utility-first. Extract only for true repetition.
- Mobile-first responsive (`sm:`, `md:`, `lg:`, `xl:`).
- Design tokens via CSS custom properties for consistency.
- No dynamic class names that break purging.
- Standardize breakpoints.
- Logical properties (`margin-inline-start`, not `margin-left`) for RTL support.
- `rem` for font sizes, never `px` for body text.

### Performance
- `font-display: swap` for web fonts.
- Explicit image dimensions to prevent CLS.
- Preconnect/preload critical resources.
- Code-split by route/feature.
- Virtualize lists with 50+ items.
- Debounce high-frequency events (scroll, resize, input): 300-500ms.

### Output Quality
- Treat every task as production-critical. Partial output = broken output.
- BANNED in code: `// ...`, `// rest of code`, `// TODO`, `/* ... */`.
- No skeleton when full implementation was requested.
- If approaching token limit: write to clean breakpoint, then note pause.

---

## 10. Pre-Delivery Checklist

Before shipping ANY UI work, verify:

- [ ] Display font is not Inter/Roboto/Arial for headlines
- [ ] Max 1 accent color per surface, saturation < 80%
- [ ] All text contrast >= 4.5:1 in both modes
- [ ] Touch targets >= 44px, spacing >= 24px between
- [ ] `min-h-[100dvh]` not `h-screen`
- [ ] Max-width container on desktop content
- [ ] 4/8pt spacing rhythm throughout
- [ ] Heading hierarchy: h1 -> h2 -> h3, no skips
- [ ] Skip-to-content link present
- [ ] `prefers-reduced-motion` respected
- [ ] All interactive elements have hover + active + focus states
- [ ] No hard borders between page sections
- [ ] Semantic HTML (section, nav, main, footer, article)
- [ ] ARIA labels on icon-only buttons
- [ ] Form labels programmatically associated
- [ ] Animations use only transform/opacity
- [ ] No layout shift (CLS) on load
- [ ] Empty, loading, and error states handled
- [ ] Mobile layout verified at 375px
- [ ] Desktop layout verified at 1440px
- [ ] Build passes with zero errors
- [ ] Overall impression: premium, intentional, unforgettable
