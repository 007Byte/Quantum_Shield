# ADR-003: Expo SDK 50 + React Native for Mobile Clients

## Status: Accepted

## Date: 2024-02-01

## Context

QAV requires mobile support across iOS and Android with:

- Unified codebase for time-to-market
- Client-side encryption before transmission
- Secure key storage (iOS Keychain, Android KeyStore)
- Real-time sync and offline-first capability
- Push notifications and background processing

Options evaluated: Flutter, native Swift/Kotlin, Electron (web wrapper), raw React Native.

## Decision

**Expo SDK 50** with **React Native** for managed app development.

Key architecture:
- Managed Expo environment (eliminated custom native modules for MVP)
- `expo-secure-store` for key material storage
- `zustand` for offline-first state management with persistent middleware
- Custom JS bridge for Rust crypto via `react-native-turbomodule`
- EAS (Expo Application Services) for builds and OTA updates

## Alternatives Considered

1. **Flutter (Dart)**
   - Pros: Excellent performance, hot reload, single codebase, Google-backed
   - Cons: Smaller npm ecosystem, fewer cryptographic libraries, weaker TypeScript integration, new Dart learning curve

2. **Native Swift/Kotlin**
   - Pros: Maximum performance, platform-optimized UI
   - Cons: Two codebases (maintenance burden), longer development cycle, code duplication for business logic

3. **Electron (web wrapper)**
   - Pros: Web skills transfer, single codebase
   - Cons: Not mobile-native, larger app bundle, no access to OS-level crypto APIs, poor battery life

## Consequences

### Positive Outcomes

- Single TypeScript codebase for Android and iOS
- Expo managed environment eliminates native build complexity
- EAS seamless OTA updates for rapid iteration (critical for PQC rollout testing)
- JavaScript ecosystem rich with crypto libraries (`libsodium.js`, `tweetnacl-js`)
- Fast development velocity, excellent DX with Fast Refresh
- Built-in performance monitoring (EAS Analytics)

### Negative Outcomes

- Managed Expo prevents advanced native module customization (mitigated: all crypto can stay in Rust)
- Bundle size larger than native (30-50MB base)
- JavaScript garbage collection introduces unpredictable latency spikes (mitigated: crypto off main thread)
- JIT compilation on first app launch (optimized after 2-3 sessions)

## Implementation Notes

- Keychain/KeyStore access via `expo-secure-store` — no custom native modules required
- Crypto operations offloaded to `qav-crypto` Rust library via React Native JSI bridge
- Offline-first sync conflict resolution via Zustand + timestamp-based LWW (Last-Write-Wins)
- Push notifications via Expo Push Service (first 10k monthly free)
- OTA updates for non-binary changes via `expo-updates` (Expo EAS)
