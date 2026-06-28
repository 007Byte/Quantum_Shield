# Quantum_Shield React Native App

## Overview

A cross-platform React Native mobile and desktop application for Quantum_Shield, featuring:

- **Post-Quantum Cryptography**: ML-KEM, ML-DSA, SLH-DSA via Rust FFI
- **Zero-Knowledge Security**: Password-based encryption without server-side access
- **SRP Authentication**: Secure Remote Password protocol for authentication
- **Responsive Design**: Cosmic purple/magenta theme adapted for all screen sizes
- **Platform Support**: iOS, Android, macOS, Windows, Linux, and tablets

## Project Structure

```
usbvault-app/
├── src/
│   ├── app/                          # Expo Router app directory
│   │   ├── _layout.tsx              # Root layout with auth check
│   │   ├── (auth)/                  # Authentication stack
│   │   │   ├── _layout.tsx          # Auth navigation layout
│   │   │   ├── login.tsx            # Login screen (SRP)
│   │   │   └── register.tsx         # Registration with password strength
│   │   └── (tabs)/                  # Main app with tab navigation
│   │       ├── _layout.tsx          # Tab navigation layout
│   │       ├── dashboard.tsx        # Main dashboard with hero section
│   │       ├── vault.tsx            # Vault management
│   │       ├── share.tsx            # Secure sharing interface
│   │       └── settings.tsx         # Account & security settings
│   │
│   ├── components/
│   │   ├── common/                  # Reusable UI components
│   │   │   ├── Button.tsx           # Variants: primary, secondary, danger, hero, magenta, link
│   │   │   ├── Card.tsx             # Glassmorphic container with optional glow
│   │   │   ├── Input.tsx            # Text input with labels, errors, search variant
│   │   │   └── Badge.tsx            # PQC and status badges
│   │   │
│   │   ├── vault/                   # Vault-specific components
│   │   │   ├── FileListItem.tsx     # File display with icons, dates, PQC badge
│   │   │   ├── SecurityScore.tsx    # Circular progress + checklist
│   │   │   └── SecurityOverview.tsx # Hexagonal radar chart visualization
│   │   │
│   │   └── share/                   # Sharing components
│   │       └── ContactListItem.tsx  # Contact with status badge
│   │
│   ├── services/
│   │   ├── api.ts                   # Axios-based API client with JWT refresh
│   │   └── auth.ts                  # SRP authentication & key management
│   │
│   ├── stores/
│   │   ├── authStore.ts            # Zustand: auth state & actions
│   │   └── vaultStore.ts           # Zustand: vault & file management
│   │
│   ├── crypto/
│   │   └── bridge.ts               # Rust FFI interface for crypto operations
│   │
│   ├── theme/
│   │   ├── colors.ts               # Cosmic purple/magenta design tokens
│   │   ├── typography.ts           # Platform-adaptive fonts
│   │   ├── spacing.ts              # Layout scale (4px - 48px)
│   │   └── index.ts                # Theme export
│   │
│   └── utils/
│       └── formatters.ts           # File size, dates, file type icons
│
├── app.json                         # Expo configuration
├── package.json                     # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration with path aliases
├── babel.config.js                 # Babel with module-resolver
├── .eslintrc.json                  # ESLint rules
├── .prettierrc.json                # Code formatting
└── .gitignore                      # Git exclusions
```

## Component Hierarchy

### Authentication Flow
```
_layout (Root)
└── (auth) Stack
    ├── login - Email + Password (SRP)
    └── register - Account creation with strength meter
```

### Main App Flow
```
_layout (Root)
└── (tabs) Tabs
    ├── dashboard - Hero section + file list + security overview
    ├── vault - Vault cards with import/export
    ├── share - Incoming/outgoing shares
    └── settings - Account, security, privacy, help
```

## Key Features

### 1. Authentication (src/services/auth.ts)
- **SRP Protocol**: Password never sent to server
- **Master Key**: Derived via Argon2id (Rust FFI)
- **In-Memory Storage**: Keys kept in memory, never persisted
- **Token Management**: Automatic refresh via API interceptors

### 2. Encryption (src/crypto/bridge.ts)
- **Key Derivation**: `deriveKey(password, salt) → Uint8Array`
- **Symmetric**: `encrypt/decrypt` with AES-256-GCM
- **Key Exchange**: X25519 + ChaCha20-Poly1305
- **Signing**: Ed25519 signatures
- **Post-Quantum**: ML-KEM, ML-DSA support ready

### 3. Design System
- **Colors**: Dark backgrounds (#0F0B1E), purple accents (#7C3AED), magenta (#EC4899)
- **Typography**: SF Pro (iOS), Roboto (Android), Inter (Web)
- **Spacing**: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px
- **Responsive**: Tablet detection with conditional rendering

### 4. State Management
- **Zustand Stores**: Lightweight, functional approach
- **Auth Store**: Login, register, logout, check auth
- **Vault Store**: Load vaults, manage files, create/delete
- **Persistent**: Tokens in SecureStore, master key in memory

### 5. API Integration (src/services/api.ts)
- **Base URL**: `process.env.EXPO_PUBLIC_API_URL`
- **JWT Auth**: Bearer token in Authorization header
- **Auto-Refresh**: 401 interceptor with token refresh
- **SRP Endpoints**: `/auth/srp/init`, `/auth/srp/verify`
- **Vault Endpoints**: `/vaults`, `/blobs/upload-url`, `/shares`

## File Descriptions

### Theme Files
| File | Purpose |
|------|---------|
| `colors.ts` | 16 color tokens matching cosmic purple mockup |
| `typography.ts` | Font families, sizes (xs-hero), weights |
| `spacing.ts` | 8 spacing scale values |

### Component Files
| File | Purpose |
|------|---------|
| `Button.tsx` | 6 variants with loading/disabled states |
| `Card.tsx` | Container with glassmorphism & glow |
| `Input.tsx` | Text/password/search with validation |
| `Badge.tsx` | Status indicators (pqc, success, warning, danger) |
| `FileListItem.tsx` | File display with icon, size, date, PQC badge |
| `SecurityScore.tsx` | Circular SVG progress + checklist |
| `SecurityOverview.tsx` | Hexagonal radar chart (6 axes) |
| `ContactListItem.tsx` | Contact with avatar, status badge |

### Service Files
| File | Purpose |
|------|---------|
| `api.ts` | Axios client with SRP & vault endpoints |
| `auth.ts` | SRP login/register, master key derivation |
| `bridge.ts` | Rust FFI wrapper (crypto operations) |

### Screen Files
| File | Purpose |
|------|---------|
| `login.tsx` | SRP login + biometric/FIDO2 options |
| `register.tsx` | Account creation with password strength |
| `dashboard.tsx` | Hero section + file list + security |
| `vault.tsx` | Vault cards + import/export |
| `share.tsx` | Incoming/outgoing shares + FAB |
| `settings.tsx` | Account, security, privacy, help sections |

## Installation & Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI

### Installation
```bash
cd usbvault-app
npm install

# or with yarn
yarn install
```

### Environment
```bash
cp .env.example .env
# Edit .env with your API_URL and other config
```

### Running

**Web (Development)**
```bash
npm run web
```

**Android**
```bash
npm run android
```

**iOS**
```bash
npm run ios
```

**All Platforms**
```bash
npm start
```

## Development

### TypeScript
- Strict mode enabled
- Path aliases: `@/*`, `@components/*`, etc.
- All components fully typed

### Code Quality
- ESLint with React Native plugin
- Prettier auto-formatting
- `npm run lint` to check

### Testing
- Jest configuration in place
- Run: `npm test`

## Security Considerations

### Password Handling
- Never sent in plaintext
- SRP protocol for authentication
- Derived to master key via Argon2id (Rust)

### Key Storage
- Master key: In-memory only
- Tokens: Secure storage (SecureStore)
- Private keys: Encrypted + hardware storage capable

### API Security
- HTTPS only (enforced in app.json)
- JWT tokens with refresh
- CORS headers on backend

### Crypto
- AES-256-GCM for files
- X25519 for key exchange
- Ed25519 for signatures
- Rust FFI for all operations (not JS)

## Deployment

### iOS
- Use Apple Developer account
- Build with Expo EAS: `eas build --platform ios`
- Sign with certificate

### Android
- Use Google Play Developer account
- Build with Expo EAS: `eas build --platform android`
- Sign with keystore

### Web
- Static hosting (Vercel, Netlify)
- Build: `expo build:web`
- Deploy dist/ folder

## Dependencies

### Core
- `react-native` 0.73.0
- `expo` 50.0.0
- `expo-router` 3.4.0

### UI
- `react-native-svg` - Charts & icons
- `react-native-linear-gradient` - Gradient backgrounds
- `react-native-reanimated` - Smooth animations

### Navigation
- `@react-navigation/*` - Tab & drawer navigation
- `react-native-gesture-handler` - Touch interactions
- `react-native-screens` - Native screen management

### State
- `zustand` 4.5.0 - Lightweight state management

### API & Auth
- `axios` 1.6.0 - HTTP client
- `expo-secure-store` 12.8.0 - Secure token storage
- `expo-local-authentication` 13.6.0 - Biometric auth

### Types
- `typescript` 5.3.0
- `@types/react` 18.2.0
- `@types/react-native` 0.73.0

## Future Enhancements

1. **Hardware Integration**
   - USB vault import/export
   - FIDO2 security key support
   - NFC payments

2. **Advanced Crypto**
   - Post-quantum algorithm implementation
   - Hardware key storage
   - Multi-signature support

3. **Collaboration**
   - Real-time file sharing
   - Version control
   - Team management

4. **Mobile Optimization**
   - Offline support with sync
   - Push notifications
   - Background operations

5. **Analytics**
   - Security audit logs
   - Usage metrics
   - Performance monitoring

## Support

For issues or questions:
1. Check documentation in security whitepaper
2. Contact: support@usbvault.io
3. GitHub issues (if open source)

## License

Quantum_Shield - Proprietary Software
