# USBVault App — Architecture Rules

Rules enforced by ESLint `import/no-restricted-paths` and code review.

## Dependency Layers

```
L4: Screens    (src/app/)           → L3 + L2
L3: Components (src/components/)    → L2 + L1
L2: Hooks/Stores (src/hooks/, src/stores/) → L1
L1: Services   (src/services/)      → L0
L0: Utils/Types (src/utils/, src/types/, src/crypto/) → nothing above
```

**No upward imports. No cross-layer skipping (e.g., screens importing services directly — use hooks).**

Exceptions: `ShellLayout` and `Sidebar` may import stores (they're shell infrastructure).

## Feature Folder Convention

Any screen over ~300 LOC or with custom workflow logic:

```
src/features/<feature-name>/
  components/   — presentational components (props only, no store imports)
  hooks/        — feature-specific hooks (owns state + business logic)
  domain/       — types, config data, pure utility functions
```

Route file (`src/app/(tabs)/<name>.tsx`) becomes a thin orchestrator (<250 LOC).

### Stop conditions (feature is "done" when):
- Route file under 250 LOC (JSX logic, excluding StyleSheet)
- No inline modal definitions in route file
- No service imports directly in screen file (use hooks)
- Business logic in hooks, not components

## Store Design Rules

Stores may contain:
- Canonical shared state
- Pure state transitions (set/update/delete)
- Minimal derived data

Stores must NOT contain:
- DOM manipulation
- Screen-local UI state (wizard step, modal open, draft input, hover/expanded)
- Formatting helpers
- Cross-service orchestration (use hooks or use-cases)

### Split stores:
- `vaultListStore` — vault collection (normalized `byId` + `ids`)
- `activeVaultStore` — selected vault ID only
- `vaultSessionStore` — encryption keys (zero-filled on lock)

Legacy `vaultStore` is a compat layer — migrate consumers to sub-stores incrementally.

## Ephemeral UI State

Wizard step, modal open state, filters, draft form input, hover/expanded UI state **stay local** (`useState`) unless cross-screen persistence is explicitly required.

## List Handling

Any collection with lookup/update/delete behavior:
- Store as `byId: Record<string, T>` + `ids: string[]`
- O(1) lookup, O(1) update/delete
- Ordered list maintenance via `ids` array

Only use raw arrays for tiny, append-only, or render-only lists.

## Tab Configuration

All tab routes are defined in `src/app/(tabs)/tab-config.ts`:
- `VISIBLE_TABS` — shown in mobile tab bar
- `HIDDEN_SCREENS` — sidebar-only navigation
- `_layout.tsx` generates `<Tabs.Screen>` from config (no manual repetition)
