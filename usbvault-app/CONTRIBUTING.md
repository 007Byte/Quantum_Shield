# Contributing to Quantum_Shield

Thank you for contributing to Quantum_Shield! This guide ensures consistency and maintains our high security and quality standards.

## Development Environment Setup

### Prerequisites

- Node.js 18+ (LTS)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd usbvault-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Copy environment file**
   ```bash
   cp .env.example .env
   ```

4. **Set up your development server**
   ```bash
   npm run web
   ```

For detailed setup, see [QUICKSTART.md](./QUICKSTART.md).

## Branch Naming

Use descriptive names with prefixes:

```
feature/auth-biometric          # New features
bugfix/vault-loading-crash      # Bug fixes
hotfix/security-token-expiry    # Critical hotfixes
refactor/api-client-types       # Code refactoring
docs/readme-update              # Documentation
test/auth-flow-e2e              # Test additions
chore/dependency-updates        # Maintenance
```

## Commit Messages

Follow Conventional Commits format:

```
type(scope): subject

body

footer
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code formatting (no logic changes)
- `refactor:` - Code reorganization
- `perf:` - Performance improvements
- `test:` - Test additions or updates
- `chore:` - Build, CI, dependencies
- `security:` - Security fixes

### Examples

```
feat(auth): implement SRP-6a login flow

Implements Secure Remote Password protocol for authentication.
Adds password strength meter and validation.

Fixes #123
```

```
fix(vault): resolve file upload timeout

Increase timeout to 30s and add retry logic.

Closes #456
```

```
security(crypto): upgrade to ML-KEM for key exchange

Migrate from X25519 to post-quantum ML-KEM algorithm.
Maintains backward compatibility via algorithm version field.

BREAKING CHANGE: Old keys require rotation
```

## Pull Request Process

### Before Submitting

> **Run the local QA/QC harness before every push.** `scripts/preflight.sh`
> mirrors the *exact* CI gates (Rust, Go, migrations, RN, E2E, security) on your
> machine, so you never discover a failure from a 25-minute CI run. A git
> **pre-push hook** runs it automatically — install it once with
> `make setup-hooks`. Full runbook: **[docs/QA_QC.md](../docs/QA_QC.md)**.

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make changes and test**
   ```bash
   npm run lint    # Check linting
   npm test        # Run tests
   npm run web     # Manual testing
   ```

3. **Commit with conventional messages**
   ```bash
   git add .
   git commit -m "feat(component): description"
   ```

4. **Run the pre-push QA/QC harness** (mirrors CI locally — see [docs/QA_QC.md](../docs/QA_QC.md))
   ```bash
   ../scripts/preflight.sh --changed   # only touched components; use --full before a PR
   ```

5. **Push to origin** (the pre-push git hook runs `preflight.sh --changed` automatically)
   ```bash
   git push origin feature/your-feature
   ```

### PR Description Template

```markdown
## Description
Brief description of changes and why they were made.

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Security fix
- [ ] Documentation update
- [ ] Breaking change

## Testing Performed
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Manual testing on Web
- [ ] Manual testing on iOS
- [ ] Manual testing on Android

## Checklist
- [ ] Code follows style guide
- [ ] Tests pass locally (npm test)
- [ ] No console errors/warnings
- [ ] TypeScript strict mode passes
- [ ] No security vulnerabilities introduced
- [ ] Documentation updated if needed

## Screenshots (if applicable)
Add screenshots for UI changes
```

### Code Review

All PRs require:
- ✅ 1+ maintainer approvals
- ✅ All CI checks passing
- ✅ Security review (for security-related changes)
- ✅ No unresolved conversations

## Code Style

### TypeScript

**Strict mode enabled** - All files must pass strict type checking:

```typescript
// Good
const handleLogin = async (email: string): Promise<void> => {
  const result = await api.login(email);
  if (result.success) {
    console.log('Logged in');
  }
};

// Bad - missing types
const handleLogin = async (email) => {
  const result = await api.login(email);
  // ...
};
```

### File Organization

```typescript
// 1. Imports
import { View } from 'react-native';
import { useRouter } from 'expo-router';

// 2. Types
interface Props {
  title: string;
}

// 3. Component
export function MyComponent({ title }: Props) {
  return <View />;
}

// 4. Styles
const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

### Naming Conventions

- **Components**: PascalCase (`MyComponent.tsx`)
- **Functions**: camelCase (`fetchUser()`)
- **Constants**: UPPER_SNAKE_CASE (`API_URL`)
- **Types/Interfaces**: PascalCase (`UserProfile`)
- **Private functions**: Leading underscore (`_helper()`)

### Formatting

- **ESLint**: `npm run lint`
- **Prettier**: `npx prettier --write src/`
- **Line length**: 100 characters (max)
- **Tabs**: 2 spaces
- **Quotes**: Single quotes for JS/TS

## Testing Requirements

### Coverage Target: 70%+

```bash
npm test -- --coverage
```

### Test Structure

```typescript
// src/__tests__/utils.test.ts
import { formatFileSize } from '@/utils/formatters';

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });

  it('handles edge cases', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-1)).toThrow();
  });
});
```

### Test Requirements for PRs

- ✅ New features require unit tests
- ✅ Bug fixes should include regression tests
- ✅ Security changes require security tests
- ✅ At least 70% code coverage

## Security Guidelines

### Password & Key Handling

- **Never log passwords or keys** - Even in debug mode
- **Use SecureStore** - Not AsyncStorage for tokens
- **Keep keys in memory only** - Never persist to disk
- **Validate all input** - Client and server validation
- **No hardcoded credentials** - Use environment variables

### API Security

- **HTTPS only** - Enforce in `app.json`
- **No sensitive data in URLs** - Use POST body
- **Validate certificates** - Implement pinning
- **JWT token rotation** - Refresh on 401

### Code Review Checklist for Security

Before approving any PR:

- [ ] No hardcoded secrets or credentials
- [ ] No sensitive data logged
- [ ] No SQL injection vulnerabilities
- [ ] No XSS or injection attacks
- [ ] Dependencies updated and audited
- [ ] No unsafe cryptographic functions
- [ ] Proper error handling (no stack traces)
- [ ] Input validation present
- [ ] HTTPS enforced in API calls
- [ ] No unencrypted PII storage

## Documentation

### JSDoc Comments

```typescript
/**
 * Encrypts file data using AES-256-GCM.
 *
 * @param fileData - Raw file bytes to encrypt
 * @param masterKey - Derived master encryption key
 * @returns Encrypted file as Uint8Array
 * @throws CryptoError if encryption fails
 *
 * @remarks
 * Uses Rust FFI for secure crypto operations.
 * Master key must be 32 bytes for AES-256.
 */
export async function encryptFile(
  fileData: Uint8Array,
  masterKey: Uint8Array
): Promise<Uint8Array> {
  // Implementation
}
```

### README Updates

- Update README.md for new features
- Update QUICKSTART.md for new workflows
- Add examples in comments

### Component Documentation

```typescript
/**
 * Button - Versatile button component with multiple variants.
 *
 * @param variant - Visual style: 'primary' | 'secondary' | 'danger' | 'hero' | 'magenta' | 'link'
 * @param onPress - Callback when button is pressed
 * @param disabled - Disable button interaction
 * @param loading - Show loading spinner
 *
 * @remarks
 * Automatically adjusts size and styling based on platform.
 * Use `loading` prop to prevent double-clicks during async operations.
 */
```

## Performance

### Optimization Tips

1. **Memoize components** - Use `React.memo()` for expensive renders
2. **Lazy load routes** - Expo Router does this automatically
3. **Debounce inputs** - Use lodash-es for search/filter
4. **Cache API calls** - Use Zustand for state, not repeated fetches
5. **Optimize images** - Compress before upload
6. **Use FlatList** - For long lists, not ScrollView
7. **Avoid inline functions** - Define outside JSX

### Profiling

```bash
# React Native Debugger
npm run web -- --verbose

# Check bundle size
expo build:web && npm run web
```

## Release Process

### Version Numbering

Follow Semantic Versioning: `MAJOR.MINOR.PATCH`

- `MAJOR` - Breaking changes
- `MINOR` - New features (backward compatible)
- `PATCH` - Bug fixes

### Steps

1. Update version in `package.json`
2. Add entry to `CHANGELOG.md`
3. Create commit: `chore(release): bump v1.2.3`
4. Create git tag: `git tag v1.2.3`
5. Push: `git push && git push --tags`
6. Build and deploy via CI/CD

## Getting Help

- **Questions?** Open a discussion issue
- **Bug reports?** Include reproduction steps
- **Security issue?** Email security@usbvault.com
- **Documentation?** Improve existing docs

---

Thank you for contributing to Quantum_Shield! Your work helps keep user data secure.
