// PH4-FIX: Refactored Passwords Screen - thin orchestrator with extracted components
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCallback } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing, dashboardColors, webOnlyTransition } from '@/components/dashboard2/styles';
import { usePasswords } from '@/hooks/usePasswords';
import { PasswordSearch } from '@/components/passwords/PasswordSearch';
import { PasswordList } from '@/components/passwords/PasswordList';
import { PasswordForm } from '@/components/passwords/PasswordForm';
import { PasswordImport } from '@/components/passwords/PasswordImport';

export default function PasswordsScreen() {
  const { modal, showAlert, showSuccess, showError, showConfirm } = useInAppModal();

  const {
    passwords,
    isLoading,
    searchQuery,
    setSearchQuery,
    editingId,
    setEditingId,
    formData,
    setFormData,
    copyFeedback,
    importProgress,
    setImportProgress,
    importResult,
    setImportResult,
    filteredEntries,
    openAddModal,
    openEditModal,
    generatePassword,
    savePassword,
    copyPassword,
    deletePassword,
    validateAndPrepareImport,
    performImport,
    getStrengthColor,
  } = usePasswords();

  // Modal visibility states
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);

  const handleOpenAddModal = useCallback(() => {
    openAddModal();
    setShowAddModal(true);
  }, [openAddModal]);

  const handleCloseAddModal = useCallback(() => {
    setShowAddModal(false);
    setEditingId(null);
    setFormData({ title: '', username: '', password: '', url: '', category: '' });
  }, [setEditingId, setFormData]);

  const handleSavePassword = useCallback(async () => {
    const result = await savePassword();
    if (result.success) {
      showSuccess('Success', editingId ? 'Password updated' : 'Password added');
      handleCloseAddModal();
    } else {
      showError('Error', result.error || 'Failed to save password');
    }
  }, [savePassword, editingId, showSuccess, showError, handleCloseAddModal]);

  const handleCopyPassword = useCallback(
    async (passwordText: string, entryId: string) => {
      const success = await copyPassword(passwordText, entryId);
      if (!success) {
        showError('Error', 'Failed to copy to clipboard');
      }
    },
    [copyPassword, showError],
  );

  const handleDeletePassword = useCallback(
    (entryId: string, title: string) => {
      showConfirm(
        `Delete '${title}'?`,
        'This password will be permanently deleted.',
        async () => {
          const result = await deletePassword(entryId);
          if (result.success) {
            showAlert('Deleted', `${title} has been removed`);
          } else {
            showError('Error', 'Failed to delete password');
          }
        },
        'Delete',
        'destructive',
      );
    },
    [deletePassword, showAlert, showError, showConfirm],
  );

  const handleImportFile = useCallback(
    (content: string, fileName: string) => {
      const validation = validateAndPrepareImport(content);
      if (!validation.valid) {
        showError('Import Error', validation.error);
        return;
      }

      const countHint =
        validation.estimatedCount && validation.estimatedCount > 0 ? ` (~${validation.estimatedCount} entries)` : '';

      showConfirm(
        `Import from ${validation.formatName}?`,
        `Detected ${validation.formatName} format${countHint}. Passwords will be encrypted and added to your vault.`,
        async () => {
          const result = await performImport(content, validation.format || 'auto', fileName);

          if (result.success) {
            if (result.result?.errors && result.result.errors.length > 0) {
              showError('Import Errors', result.result.errors.join('\n'));
            } else {
              showSuccess(
                'Import Complete',
                `${result.result?.imported} passwords imported${result.result?.duplicates && result.result.duplicates > 0 ? `, ${result.result.duplicates} duplicates skipped` : ''}.`,
              );
            }
            setShowImportModal(false);
          } else {
            showError('Import Failed', result.error || 'Unknown error');
          }
        },
        'Import',
      );
    },
    [validateAndPrepareImport, performImport, showError, showSuccess, showConfirm],
  );

  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportResult(null);
    setImportProgress(null);
  }, [setImportResult, setImportProgress]);

  return (
    <ShellLayout>
      <InAppModal config={modal} />
      <View style={styles.contentWrapper}>
        {/* Header with Title */}
        <View style={styles.header}>
          <Text style={styles.title}>Password Manager</Text>
        </View>

        {/* Search Bar */}
        <PasswordSearch searchQuery={searchQuery} onSearchChange={setSearchQuery} />

        {/* Action Buttons Row */}
        <View style={styles.actionRow}>
          <Pressable
            style={(state: any) => [styles.addButton, webOnlyTransition, state.hovered && styles.addButtonHover]}
            onPress={handleOpenAddModal}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addButtonText}>Add Password</Text>
          </Pressable>

          <Pressable
            style={(state: any) => [styles.importButton, webOnlyTransition, state.hovered && styles.importButtonHover]}
            onPress={() => setShowImportModal(true)}
          >
            <Feather name="download" size={18} color="#22D3EE" />
            <Text style={styles.importButtonText}>Import</Text>
          </Pressable>
        </View>

        {/* Password Entries List - Use PasswordList component with empty state handling */}
        {filteredEntries.length === 0 && !isLoading && passwords.length === 0 ? (
          <PasswordList
            entries={[]}
            isLoading={false}
            copyFeedback={copyFeedback}
            onCopyPassword={handleCopyPassword}
            onEditPassword={(entry) => {
              openEditModal(entry);
              setShowAddModal(true);
            }}
            onDeletePassword={handleDeletePassword}
            onAddClick={handleOpenAddModal}
            getStrengthColor={getStrengthColor}
          />
        ) : filteredEntries.length === 0 && !isLoading && passwords.length > 0 ? (
          <View style={styles.noSearchResults}>
            <Feather name="search" size={48} color={dashboardColors.textSecondary} />
            <Text style={styles.noSearchText}>No passwords match your search</Text>
          </View>
        ) : (
          <PasswordList
            entries={filteredEntries}
            isLoading={isLoading}
            copyFeedback={copyFeedback}
            onCopyPassword={handleCopyPassword}
            onEditPassword={(entry) => {
              openEditModal(entry);
              setShowAddModal(true);
            }}
            onDeletePassword={handleDeletePassword}
            onAddClick={handleOpenAddModal}
            getStrengthColor={getStrengthColor}
          />
        )}
      </View>

      {/* Add/Edit Password Modal */}
      <PasswordForm
        visible={showAddModal}
        isEditing={!!editingId}
        formData={formData}
        onFormChange={setFormData}
        onClose={handleCloseAddModal}
        onSave={handleSavePassword}
        onGeneratePassword={generatePassword}
      />

      {/* Import Passwords Modal */}
      <PasswordImport
        visible={showImportModal}
        importProgress={importProgress}
        importResult={importResult}
        onClose={handleCloseImportModal}
        onFileSelect={handleImportFile}
      />
    </ShellLayout>
  );
}

// Import React for useState
import React from 'react';

const styles = StyleSheet.create({
  contentWrapper: {
    paddingTop: dashboardSpacing.lg,
  },
  header: {
    marginBottom: dashboardSpacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    letterSpacing: -0.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: dashboardSpacing.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    ...webOnly({
      background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
      boxShadow: '0 0 20px rgba(168,85,247,0.5), 0 0 40px rgba(124,58,237,0.3)',
      cursor: 'pointer',
    }),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  addButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(34,211,238,0.08)',
    ...webOnly({ cursor: 'pointer' }),
  },
  importButtonHover: {
    borderColor: 'rgba(34,211,238,0.6)',
    backgroundColor: 'rgba(34,211,238,0.15)',
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 20px rgba(34,211,238,0.3), 0 0 40px rgba(34,211,238,0.15)',
    }),
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22D3EE',
  },
  noSearchResults: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.md,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 30,
    paddingVertical: 50,
    marginHorizontal: dashboardSpacing.md,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  noSearchText: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
  },
});

// Import webOnly utility
import { webOnly } from '@/utils/webStyle';
