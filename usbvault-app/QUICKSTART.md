# Quantum Armor Vault (QAV) App - Quick Start Guide

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Update .env with your API URL
# EXPO_PUBLIC_API_URL=https://your-api.example.com
```

## Running the App

### Development (Web)
```bash
npm run web
# Opens http://localhost:19006 with Expo Web
```

### iOS Simulator
```bash
npm run ios
# Requires macOS + Xcode
```

### Android Emulator
```bash
npm run android
# Requires Android Studio + emulator setup
```

### Physical Device
```bash
npm start
# Scan QR code with Expo Go app (iOS/Android)
```

## Project Organization

### Core Directories

**src/app/** - Screen routes (Expo Router)
- `(auth)` - Login & registration screens
- `(tabs)` - Main app with tabs (Dashboard, Vault, Share, Settings)

**src/components/** - Reusable UI components
- `common/` - Button, Card, Input, Badge
- `vault/` - FileListItem, SecurityScore, SecurityOverview
- `share/` - ContactListItem

**src/services/** - API & authentication
- `api.ts` - HTTP client with JWT refresh
- `auth.ts` - SRP login, key derivation, logout

**src/stores/** - Zustand state management
- `authStore.ts` - Authentication state
- `vaultStore.ts` - Vault & file state

**src/crypto/** - Cryptography bridge
- `bridge.ts` - Rust FFI interface for encryption/decryption

**src/theme/** - Design tokens
- `colors.ts` - Cosmic purple/magenta palette
- `typography.ts` - Font families & sizes
- `spacing.ts` - Layout scale

## Key Files to Know

### Authentication Flow
```
src/services/auth.ts        Login/register with SRP
src/stores/authStore.ts     State management
src/app/(auth)/login.tsx    Login UI
src/app/(auth)/register.tsx Registration UI
```

### Main App Screens
```
src/app/(tabs)/dashboard.tsx    Hero + file list + security overview
src/app/(tabs)/vault.tsx        Vault management
src/app/(tabs)/share.tsx        Share management
src/app/(tabs)/settings.tsx     Settings & account
```

### Components
```
src/components/common/Button.tsx        - 6 variants
src/components/common/Card.tsx          - Glassmorphic container
src/components/common/Input.tsx         - Text/password inputs
src/components/vault/FileListItem.tsx   - File display
```

## Common Tasks

### Add a New Screen
1. Create file in `src/app/(tabs)/newscreen.tsx`
2. Add to tab navigation in `src/app/(tabs)/_layout.tsx`
3. Implement with SafeAreaView + ScrollView

### Add a New Component
1. Create file in `src/components/common/NewComponent.tsx`
2. Export from component directory
3. Use in screens with `import { NewComponent } from '@/components/common/NewComponent'`

### Use the Authentication Store
```typescript
import { useAuthStore } from '@/stores/authStore';

export default function MyScreen() {
  const { isAuthenticated, email } = useAuthStore();
  const login = useAuthStore((state) => state.login);

  return <View>{/* ... */}</View>;
}
```

### Call the API
```typescript
import * as api from '@/services/api';

// Get user info
const user = await api.getUserInfo();

// Get vaults
const vaults = await api.listVaults();

// Create vault
const vaultId = await api.createVault({
  name: "My Vault",
  encryptedMetadata: base64EncodedData
});
```

### Use Crypto Bridge
```typescript
import * as crypto from '@/crypto/bridge';

// Derive key from password
const key = await crypto.deriveKey(password, salt);

// Encrypt file
const encrypted = await crypto.encrypt(0, key, fileData);

// Decrypt file
const plaintext = await crypto.decrypt(0, key, encryptedData);
```

### Style Components
```typescript
import { StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.displayXl,
    color: colors.textPrimary,
  },
});
```

## Theme Colors

```typescript
// Primary backgrounds
colors.bgPrimary    // #0F0B1E (main background)
colors.bgSecondary  // #1A1530 (cards, headers)
colors.bgTertiary   // #251D40

// Accents
colors.accentPrimary       // #7C3AED (purple)
colors.accentSecondary     // #EC4899 (magenta)
colors.accentTertiary      // #06B6D4 (cyan)

// Text
colors.textPrimary   // #FFFFFF
colors.textSecondary // #94A3B8
colors.textMuted     // #64748B

// Status
colors.success  // #10B981
colors.warning  // #F59E0B
colors.danger   // #EF4444
```

## Debugging

### Console Logs
```bash
# Watch console in Expo
npx expo --version
npm run web -- --verbose
```

### React Native Debugger
1. Install: https://github.com/jhen0409/react-native-debugger
2. Run your app with Expo
3. Open debugger at http://localhost:8081

### TypeScript Errors
```bash
# Check for type errors
npx tsc --noEmit
```

### Lint & Format
```bash
# Check linting
npm run lint

# Fix formatting
npx prettier --write src/
```

## Testing

### Run Tests
```bash
npm test
```

### Example Test
```typescript
// src/__tests__/utils.test.ts
import { formatFileSize } from '@/utils/formatters';

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });
});
```

## Performance Tips

1. **Memoize Components**: Use `React.memo()` for expensive renders
2. **Optimize Images**: Compress before upload
3. **Lazy Load Routes**: Expo Router does this automatically
4. **Debounce Input**: Use `lodash-es` for search/filter
5. **Cache API Calls**: Use Zustand for state, not repeated fetches

## Security Best Practices

1. **Never hardcode API keys** - Use environment variables
2. **Keep secrets in SecureStore** - Not AsyncStorage
3. **Master key in memory only** - Never persist to disk
4. **Validate all input** - On both client and server
5. **Use HTTPS only** - Enforce in app.json

## Troubleshooting

### "Module not found" error
- Check import path uses `@/` aliases
- Verify file exists at that path
- Run `npm install` again

### "API 401 Unauthorized"
- Token refresh failed
- User needs to login again
- Check `.env` for correct API_URL

### Crypto operations failing
- Make sure Rust FFI is properly configured
- Check native module linking
- Use fallback JS crypto for development only

### App won't start
1. Clear cache: `rm -rf node_modules && npm install`
2. Clear Expo cache: `npx expo start -c`
3. Delete `.expo` folder: `rm -rf .expo`
4. Restart development server

## Resources

- **React Native**: https://reactnative.dev
- **Expo**: https://docs.expo.dev
- **Expo Router**: https://expo.github.io/router
- **Zustand**: https://github.com/pmndrs/zustand
- **TypeScript**: https://www.typescriptlang.org

## Next Steps

1. Set up your Go backend server
2. Configure Rust crypto core with FFI bindings
3. Test SRP authentication flow
4. Implement file upload/download
5. Deploy to iOS/Android via EAS Build

## Support

For detailed documentation, see `PROJECT_STRUCTURE.md`

Questions? Check the security whitepaper or contact support@usbvault.com
