/**
 * AdminElevationModal — Full-screen overlay for OS admin password entry.
 *
 * Used whenever an operation requires elevated (root/admin) privileges
 * on the host machine (USB provisioning, zero-trace cleanup, drive reset).
 *
 * Pair with the `useAdminElevation` hook for state management.
 *
 * Design: dark glassmorphic style with purple/cyan accents, matching
 * the existing app design language.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { AdminElevationState } from '@/hooks/useAdminElevation';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// ── Props ──────────────────────────────────────────────────────────────

export interface AdminElevationModalProps {
  /** State from useAdminElevation() */
  state: AdminElevationState;
  /** Called when the user presses Authorize / Submit */
  onSubmit: () => void;
  /** Called when the user presses Cancel */
  onCancel: () => void;
  /** Called when the password text changes */
  onChangePassword: (text: string) => void;
  /** Override the default platform-specific description */
  description?: string;
  /** Label for the submit button (default: "Authorize") */
  submitLabel?: string;
  /** Bullet list of what admin access will do */
  itemsList?: string[];
  /** Placeholder for the password input (default: platform-based) */
  placeholder?: string;
}

// ── Platform helpers ───────────────────────────────────────────────────

function getDefaultDescription(platform: string): string {
  const p = platform.toLowerCase();
  if (p === 'macos' || p === 'darwin') {
    return 'Partitioning a USB drive requires administrator privileges. Enter your Mac login password to continue. This password is only used locally and is never stored.';
  }
  if (p === 'linux') {
    return 'This operation requires administrator privileges. Enter your password to continue. This password is only used locally and is never stored.';
  }
  if (p === 'windows') {
    return 'Administrator access is required. Approve the elevated access prompt to continue.';
  }
  return 'Administrator privileges are required. Enter your password to continue. This password is only used locally and is never stored.';
}

function getDefaultPlaceholder(platform: string): string {
  const p = platform.toLowerCase();
  if (p === 'macos' || p === 'darwin') return 'Mac login password';
  if (p === 'linux') return 'Password';
  if (p === 'windows') return 'Administrator password';
  return 'Password';
}

// ── Component ──────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;

export function AdminElevationModal({
  state,
  onSubmit,
  onCancel,
  onChangePassword,
  description,
  submitLabel = 'Authorize',
  itemsList,
  placeholder,
}: AdminElevationModalProps) {
  const { theme } = useTheme();
  const focusTrapRef = useFocusTrap(state.needed, onCancel);

  // Don't render if not needed
  if (!state.needed) return null;

  const descriptionText = description ?? getDefaultDescription(state.platform);
  const placeholderText = placeholder ?? getDefaultPlaceholder(state.platform);
  const showAttemptsWarning = state.attemptsRemaining < MAX_ATTEMPTS;
  const isLocked = state.attemptsRemaining <= 0;

  return (
    <View style={adminStyles.overlay} ref={focusTrapRef}>
      <View style={[adminStyles.modal, resolveLayerStyle(theme.L4.base)]}>
        {/* Header */}
        <View style={adminStyles.iconRow}>
          <Feather name="lock" size={28} color={theme.semantic.accentPrimary} />
          <Text style={[adminStyles.title, { color: theme.L4.base.text.primary }]}>
            Administrator Access Required
          </Text>
        </View>

        {/* Description */}
        <Text style={[adminStyles.description, { color: theme.L4.base.text.secondary }]}>
          {descriptionText}
        </Text>

        {/* Items list (what admin access will do) */}
        {itemsList && itemsList.length > 0 && (
          <View style={adminStyles.itemsList}>
            {itemsList.map((item, idx) => (
              <View key={idx} style={adminStyles.itemRow}>
                <Feather name="check-circle" size={14} color={theme.semantic.accentPrimary} />
                <Text style={[adminStyles.itemText, { color: theme.L4.base.text.secondary }]}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Error message */}
        {state.error && (
          <View style={adminStyles.errorBox}>
            <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
            <Text style={[adminStyles.errorText, { color: theme.semantic.danger }]}>
              {state.error}
            </Text>
          </View>
        )}

        {/* Attempts remaining warning */}
        {showAttemptsWarning && !isLocked && (
          <Text style={[adminStyles.attemptsText, { color: theme.semantic.warning }]}>
            {state.attemptsRemaining} attempt{state.attemptsRemaining !== 1 ? 's' : ''} remaining
          </Text>
        )}

        {/* Password input */}
        <TextInput
          style={[
            adminStyles.input,
            resolveLayerStyle(theme.L3.base),
            { color: theme.L3.base.text.primary },
          ]}
          placeholder={placeholderText}
          placeholderTextColor={theme.L3.base.text.muted}
          secureTextEntry
          value={state.password}
          onChangeText={onChangePassword}
          onSubmitEditing={onSubmit}
          autoFocus
          editable={!state.elevating && !isLocked}
          accessibilityLabel="Text input"
        />

        {/* Buttons */}
        <View style={adminStyles.buttonRow}>
          <Pressable
            style={[adminStyles.cancelBtn, resolveLayerStyle(theme.L3.base)]}
            onPress={onCancel}
            disabled={state.elevating}
            accessibilityRole="button"
          >
            <Text style={[adminStyles.cancelText, { color: theme.L3.base.text.secondary }]}>
              Cancel
            </Text>
          </Pressable>

          <Pressable
            style={[
              adminStyles.authorizeBtn,
              { backgroundColor: theme.semantic.accentPrimary },
              (state.elevating || isLocked) && { opacity: 0.6 },
            ]}
            onPress={onSubmit}
            disabled={state.elevating || isLocked}
            accessibilityRole="button"
          >
            {state.elevating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="shield" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={adminStyles.authorizeText}>{submitLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const adminStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    borderRadius: 16,
    padding: 28,
    width: 420,
    maxWidth: '90%',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },
  itemsList: {
    marginBottom: 16,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
  },
  attemptsText: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  authorizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  authorizeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
