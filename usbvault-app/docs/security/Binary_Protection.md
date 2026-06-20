# Binary Protection & Code Obfuscation — Verification

## Hermes Bytecode Compilation

**Status: ENABLED**

Configured in `app.json`:
```json
"jsEngine": "hermes"
```

Hermes compiles JavaScript to **Hermes bytecode (.hbc)** at build time.
This means the shipped APK/IPA does **not** contain readable JavaScript source.
Instead, it contains binary bytecode that is significantly harder to reverse-engineer
than plain JS or even minified JS.

## JavaScript Minification & Obfuscation

**Status: ENABLED (aggressive)**

Configured in `metro.config.js` with Terser options:

| Feature                     | Setting              | Effect                                              |
|-----------------------------|----------------------|-----------------------------------------------------|
| Console removal             | `drop_console: true` | All `console.*` calls stripped from production       |
| Debugger removal            | `drop_debugger: true`| No debugger breakpoints in production                |
| Name mangling               | `mangle.toplevel: true` | Function/variable names replaced with short tokens |
| Dead code elimination       | `unused: true`       | Unreachable code removed                             |
| `__DEV__` stripping         | `global_defs.__DEV__: false` | Dev-only code paths removed              |
| Variable collapsing         | `collapse_vars: true`| Single-use vars inlined                              |
| Comments removal            | `comments: false`    | No source comments in output                         |
| Beautification disabled     | `beautify: false`    | Compact, unreadable output                           |

## Source Map Protection

Source maps are **NOT shipped** inside the APK/IPA bundle.
They are uploaded to Sentry for crash symbolication only.

Configured via `metro.config.js` serializer settings.

## Runtime Protections

| Protection              | Module                                | Status  |
|-------------------------|---------------------------------------|---------|
| Jailbreak/root detection| `src/services/security/deviceIntegrity.ts` | Active  |
| Debug detection         | `src/services/security/deviceIntegrity.ts` | Active  |
| Screenshot prevention   | `src/services/security/screenProtection.ts`| Active  |
| Auto-lock on background | `src/services/security/autoLock.ts`   | Active  |
| Clipboard auto-clear    | `src/services/security/appProtection.ts` | Active  |
| Certificate pinning     | `src/services/security/certificatePinning.ts` | Active |
| Biometric auth          | `src/services/auth.ts`                | Active  |

## Summary

The production binary is protected by multiple layers:
1. **Hermes bytecode** — JS compiled to binary bytecode, not shipped as readable source
2. **Terser minification** — names mangled, dead code removed, console calls stripped
3. **No inline source maps** — maps uploaded to Sentry only, never in the APK/IPA
4. **Runtime integrity checks** — jailbreak, root, debugger, and tamper detection
5. **Data leakage prevention** — screenshot blocking, clipboard clearing, auto-lock
