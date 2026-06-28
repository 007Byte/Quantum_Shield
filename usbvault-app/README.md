# Quantum_Shield React Native App

A production-ready, cross-platform React Native application for secure file encryption and vault management with post-quantum cryptography (PQC) support.

## Project Description

Quantum_Shield is an enterprise-grade file encryption vault built with React Native, offering:

- **Post-Quantum Cryptography (PQC)** - ML-KEM, ML-DSA, SLH-DSA via Rust FFI for future-proof encryption
- **Zero-Knowledge Architecture** - Password-based encryption with no server-side access to sensitive data
- **SRP-6a Authentication** - Secure Remote Password protocol prevents password transmission
- **Cross-Platform** - Native iOS/Android + macOS, Windows, Linux, and web platforms
- **Responsive Design** - Adaptive UI for phones, tablets, and desktops with cosmic purple/magenta theme

## Key Features

- **Encryption/Decryption** - AES-256-GCM symmetric encryption with X25519 key exchange
- **Secure Sharing** - Share encrypted files with contacts using zero-knowledge protocols
- **Auto-Lock** - Automatically locks vault after inactivity or when app goes to background
- **Hardware Integration Ready** - USB vault import/export, FIDO2 security key support
- **Security Dashboard** - Real-time security monitoring with hexagonal radar charts
- **Password Strength Meter** - Visual feedback during account registration

## Prerequisites

- **Node.js** 18+ (LTS)
- **npm** or yarn
- **Expo CLI** - Install with `npm install -g expo-cli`
- **Git** - For version control

### Platform-Specific Requirements

- **iOS**: macOS with Xcode installed
- **Android**: Android Studio with emulator setup
- **Web**: Modern web browser

## Quick Start

### 1. Clone & Install

```bash
git clone <repository-url> usbvault-app
cd usbvault-app
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API_URL:
# EXPO_PUBLIC_API_URL=https://your-api.example.com
```

### 3. Run Development Server

```bash
# Web (fastest for development)
npm run web

# iOS simulator (macOS only)
npm run ios

# Android emulator
npm run android

# Physical device via Expo Go
npm start
```

Visit `http://localhost:19006` for web development.

## Architecture Overview

The app follows a modular, layered architecture:

- **Screens** (`src/app/`) - Expo Router file-based routing (auth stack + main tabs)
- **Components** (`src/components/`) - Reusable UI components with variants
- **Services** (`src/services/`) - API client, authentication, device integrity
- **State** (`src/stores/`) - Zustand stores for auth and vault state
- **Crypto** (`src/crypto/`) - Rust FFI bridge for encryption operations
- **Theme** (`src/theme/`) - Design tokens (colors, typography, spacing)

For detailed architecture, see [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md).

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | React Native + Expo | 0.73.0 / 50.0.0 |
| Language | TypeScript | 5.3.0 |
| Navigation | Expo Router | 3.4.0 |
| State | Zustand | 4.5.0 |
| HTTP | Axios | 1.6.0 |
| UI | React Native SVG, Linear Gradient | 14.1.0, 2.8.3 |
| Crypto | Rust FFI Bridge | Native module |
| Storage | Expo Secure Store | 12.8.0 |
| Auth | Expo Local Authentication | 13.8.0 |

## Security Implementation

### Authentication

- **SRP-6a Protocol** - Password never transmitted to server
- **Master Key Derivation** - Argon2id hashing (Rust, not JS)
- **Secure Token Storage** - JWT tokens in device secure storage
- **Auto Token Refresh** - Automatic 401 interceptor handling

### Encryption

- **Symmetric** - AES-256-GCM for file encryption
- **Key Exchange** - X25519 elliptic curve
- **Digital Signatures** - Ed25519 signatures
- **Post-Quantum Ready** - ML-KEM, ML-DSA support via Rust FFI
- **Rust FFI Only** - No JavaScript crypto in production

### Data Protection

- **Auto-Lock** - 5-minute inactivity timeout (configurable)
- **Clipboard Clearing** - Auto-clear sensitive data after 30 seconds
- **Screenshot Prevention** - Native platform-specific prevention
- **Device Integrity Checks** - Jailbreak/root detection
- **Certificate Pinning** - TLS certificate pinning support

## Development Workflow

### Common Tasks

**Add a New Screen**

```bash
# 1. Create in src/app/(tabs)/newscreen.tsx
# 2. Register in src/app/(tabs)/_layout.tsx
# 3. Use SafeAreaView + ScrollView for layout
```

**Add a Component**

```typescript
// src/components/common/NewComponent.tsx
import { View, StyleSheet } from 'react-native';

export function NewComponent() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

**Style with Theme**

```typescript
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgPrimary,
    padding: spacing.lg,
  },
  title: {
    ...typography.displayXl,
    color: colors.textPrimary,
  },
});
```

### Code Quality

```bash
# Check TypeScript
npx tsc --noEmit

# Lint
npm run lint

# Format
npx prettier --write src/

# Test
npm test
```

## Setup Guide

See [QUICKSTART.md](./QUICKSTART.md) for:
- Detailed installation steps
- Running on all platforms
- Common debugging techniques
- Performance optimization tips
- Security best practices

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development environment setup
- Branch naming conventions
- Commit message format
- PR process and code review checklist
- Testing requirements
- Security guidelines

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for all version history and feature releases.

## Security & Support

For security vulnerabilities, please report privately:
- Email: security@usbvault.com
- Security whitepaper available upon request

## License

Quantum_Shield - Proprietary Software. All rights reserved.

Copyright (c) 2026 Quantum_Shield Inc.

---

**Ready to develop?** Start with [QUICKSTART.md](./QUICKSTART.md) then review [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for full architecture details.
