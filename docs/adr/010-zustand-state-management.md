# ADR-010: Zustand for React Native State Management

## Status: Accepted

## Date: 2024-03-08

## Context

QAV mobile client requires state management for:

- User authentication state (token, user profile, permissions)
- Vault list and current vault metadata
- Offline-first vault sync status
- Encryption key cache (avoid re-deriving on every access)
- Push notification subscriptions

Requirements:
- Persistent state across app restarts
- Offline-first capability (sync queue management)
- Minimal boilerplate (React Native development velocity)
- Type-safe (TypeScript with good DX)
- Small bundle size impact

Evaluated: Redux, MobX, Jotai, Recoil.

## Decision

Use **Zustand** for state management with:

1. **Core Stores** (modular architecture):
   - `useAuthStore` — user session, tokens, profile
   - `useVaultStore` — vault list, current vault, selected item
   - `useSyncStore` — sync queue, pending operations, last-sync timestamp
   - `useCryptoStore` — cached KEK/MEK, nonce counter

2. **Persistence**:
   - AsyncStorage adapter for encrypted state persistence
   - Selective hydration (never persist plaintext keys)
   - Conflict resolution via timestamp-based LWW (Last-Write-Wins)

3. **Offline-First Sync Queue**:
   - Store pending vault updates in queue with timestamp
   - Retry failed operations on connectivity restoration
   - Conflict detection: if server version newer, discard local change

## Alternatives Considered

1. **Redux**
   - Pros: Mature, large ecosystem, time-travel debugging
   - Cons: Boilerplate (actions, reducers, selectors), overkill for this use case, larger bundle

2. **MobX (Observables)**
   - Pros: Minimal boilerplate, reactive updates, good for real-time
   - Cons: Learning curve (observable pattern), debuggability harder, less TypeScript-friendly

3. **Jotai (Atom-based)**
   - Pros: Minimal API, suspend-ready, similar to Zustand
   - Cons: Smaller ecosystem, less proven in production, similar complexity to Zustand

## Consequences

### Positive Outcomes

- Minimal boilerplate vs Redux (single store, no actions/reducers)
- TypeScript-first design (excellent type inference)
- Small bundle size impact (<10KB gzipped)
- Excellent DevTools support (time-travel debugging)
- Straightforward persistence middleware (built-in)
- Easy testing (pure functions, no context API)

### Negative Outcomes

- Smaller ecosystem vs Redux (fewer integrations)
- Learning curve for Redux-experienced developers
- Middleware system less flexible than Redux (mitigated: simple for our use case)
- Performance: no built-in selector memoization (mitigated: manual useMemo for expensive selects)

## Implementation Notes

- Store structure in `src/stores/`:
  ```
  export const useAuthStore = create<AuthState>((set) => ({
    token: null,
    user: null,
    setToken: (token) => set({ token }),
    logout: () => set({ token: null, user: null }),
  }))
  ```

- Persistence via `zustand/middleware`:
  ```
  create<AuthState>(
    persist(
      (set) => ({ /* store logic */ }),
      {
        name: 'auth-store',
        storage: AsyncStorage,
        partialize: (state) => ({ user: state.user }), // exclude sensitive data
      }
    )
  )
  ```

- Sync queue operations:
  - Queue format: `{ id, operation: 'create'|'update'|'delete', vaultId, payload, createdAt }`
  - On connectivity restore: replay queue with optimistic updates
  - Conflict resolution: server version timestamp > local timestamp → discard local

- Offline state cache strategy:
  - MEK cached in `useCryptoStore` (in-memory, not persisted)
  - Vault list persisted (read-only cache, refreshed on sync)
  - Current user profile persisted with 1-hour TTL

- Testing: Zustand stores easily testable with `create()` returning mock store
