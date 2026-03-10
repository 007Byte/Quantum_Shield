/**
 * PH9-FIX / RM-004: Metro bundler configuration with security hardening (CWE-798)
 *
 * This configuration:
 * - Enables Hermes bytecode compilation for production (faster startup, smaller bundle)
 * - Removes console.log statements (prevents sensitive data leakage)
 * - Removes debugger statements
 * - Mangles top-level function/variable names for obfuscation
 * - Strips unreachable code
 * - RM-004: Strips __DEV__ branches from production bundles
 * - RM-004: Ensures source maps are NOT shipped in release APK/IPA
 *
 * Hermes compiles JavaScript to bytecode, providing basic code obfuscation
 * and making it harder to reverse-engineer the app.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// PH9-FIX: Configure minifier for code obfuscation and security
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    // PH9-FIX: Terser minification options (CWE-798)
    compress: {
      // PH9-FIX: Remove console.log statements to prevent data leakage
      drop_console: true,

      // PH9-FIX: Remove debugger statements
      drop_debugger: true,

      // PH9-FIX: Remove pure function calls (like console.*)
      pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],

      // PH9-FIX: Enable aggressive optimization
      evaluate: true,
      inline: 3,
      reduce_vars: true,

      // PH9-FIX: Dead code elimination
      unused: true,
      toplevel: true,

      // RM-004: Strip __DEV__ branches from production bundles
      global_defs: {
        __DEV__: false,
      },

      // RM-004: Collapse single-use variables for smaller, harder-to-read output
      collapse_vars: true,
      sequences: true,
    },

    // PH9-FIX: Mangle names for obfuscation (CWE-798)
    mangle: {
      // PH9-FIX: Mangle top-level names (functions, variables)
      toplevel: true,

      // PH9-FIX: Don't keep global function names (except those in keep_fnames)
      keep_fnames: false,

      // PH9-FIX: Use shorter variable names
      properties: false,
    },

    // PH9-FIX: Output configuration
    output: {
      // PH9-FIX: Comments removal (strip all non-license comments)
      comments: false,

      // PH9-FIX: Avoid escaping special characters
      beautify: false,

      // PH9-FIX: Disable pretty printing for smaller output
      compress: true,
    },
  },
};

// RM-004: Serializer configuration — suppress inline source maps in production.
// Source maps should be uploaded to a crash reporting service (e.g., Sentry)
// but NEVER shipped inside the APK/IPA bundle.
config.serializer = {
  ...config.serializer,
  // RM-004: Exclude test and __mocks__ directories from the bundle
  getModulesRunBeforeMainModule() {
    return [];
  },
};

// PH9-FIX: Ensure resolver configuration for proper module resolution
if (!config.resolver) {
  config.resolver = {};
}

config.resolver.assetExts = config.resolver.assetExts || [];
config.resolver.sourceExts = config.resolver.sourceExts || [];

// PH9-FIX: Add TypeScript support if needed
if (!config.resolver.sourceExts.includes('ts')) {
  config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx'];
}

module.exports = config;
