# ADR-012: Zustand Reactive Stores vs Qt Signals

## Status
Accepted

## Context
The V2.0 Fortress spec defines a Qt6/PySide6 GUI with `VaultController` using 28 Qt signals for inter-component communication. The Enterprise Edition is a web/mobile app using React Native, which requires a different state management approach.

## Decision
Enterprise uses **Zustand reactive stores** instead of Qt signals.

### Mapping: Qt Signals → Zustand Stores

| V2.0 Qt Signal | Enterprise Zustand Equivalent |
|----------------|-------------------------------|
| `vault_unlocked` | `vaultStore.isUnlocked` state change |
| `vault_locked` | `vaultStore.lockVault()` action |
| `file_added` / `file_deleted` | `vaultStore.addFile()` / `vaultStore.deleteFile()` |
| `provision_complete` | `vaultStore.createVault()` completion |
| `usb_detected` | `vaultStore.usbDrives` state (15s polling) |
| `theme_changed` | `themeStore.colorScheme` |
| `auth_failed` / `lockout_warning` | `authStore.error` / `authStore.failCount` |
| `progress_update` | Component-local `useState` (no global signal needed) |
| `error_occurred` | `useInAppModal().showError()` (imperative, not reactive) |

### Rationale
1. **React paradigm**: React's unidirectional data flow doesn't use signals — components subscribe to store slices and re-render automatically
2. **Performance**: Zustand's selector-based subscriptions (`useVaultStore(s => s.files)`) avoid unnecessary re-renders — more efficient than broadcasting signals to all listeners
3. **DevTools**: Zustand integrates with React DevTools for state inspection
4. **Persistence**: Zustand middleware handles localStorage/sessionStorage persistence transparently
5. **Type safety**: Full TypeScript typing on all store state and actions

## Consequences
- No 1:1 signal mapping — some Qt signals map to store state, others to imperative calls
- 7 Zustand stores replace 1 VaultController + 28 signals: `authStore`, `vaultStore`, `themeStore`, `sidebarStore`, `languageStore`, `offlineStore`, `syncStore`
- Component-local state used for ephemeral UI state (progress bars, form inputs)

## Implementation
- `usbvault-app/src/stores/` — All Zustand store definitions
