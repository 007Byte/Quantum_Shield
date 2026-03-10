import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { shareService, ShareRequest } from '@/services/shareService';
import { useVaultStore } from '@/stores/vaultStore';
import { useAuthStore } from '@/stores/authStore';

import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
} from '@/components/dashboard2/styles';

interface ShareDisplayItem {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'pending' | 'revoked';
  initials: string;
  avatarColor: string;
  sharedFiles: number;
  shareIds: string[];
}

const AVATAR_COLORS = ['#8B5CF6', '#06B6D4', '#A78BFA', '#F59E0B'];

function emailToInitials(email: string): string {
  return email
    .split('@')[0]
    .split('.')
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2) || '??';
}

function emailToColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function buildDisplayItems(shares: ShareRequest[], direction: 'outgoing' | 'incoming', _userEmail: string): ShareDisplayItem[] {
  const grouped = new Map<string, ShareRequest[]>();
  for (const s of shares) {
    const key = direction === 'outgoing' ? s.recipientEmail : s.senderEmail;
    const arr = grouped.get(key) || [];
    arr.push(s);
    grouped.set(key, arr);
  }
  const items: ShareDisplayItem[] = [];
  for (const [email, reqs] of grouped) {
    const activeReqs = reqs.filter((r) => r.status === 'accepted');
    const pendingReqs = reqs.filter((r) => r.status === 'pending');
    const status: 'active' | 'pending' | 'revoked' =
      activeReqs.length > 0 ? 'active' : pendingReqs.length > 0 ? 'pending' : 'revoked';
    items.push({
      id: email,
      name: email.split('@')[0],
      email,
      status,
      initials: emailToInitials(email),
      avatarColor: emailToColor(email),
      sharedFiles: reqs.filter((r) => r.status !== 'revoked' && r.status !== 'rejected').length,
      shareIds: reqs.map((r) => r.id),
    });
  }
  return items;
}

export default function ShareScreen() {
  const { modal, showAlert, showSuccess, showError, showConfirm, showPrompt } = useInAppModal();
  const { files } = useVaultStore();
  const userEmail = useAuthStore((s) => s.email) || 'user@usbvault.local';

  const [outgoing, setOutgoing] = useState<ShareDisplayItem[]>([]);
  const [incoming, setIncoming] = useState<ShareDisplayItem[]>([]);

  const refreshShares = useCallback(() => {
    const allShares = shareService.getAllShares();
    const out = allShares.filter((s) => s.senderEmail === userEmail);
    const inc = allShares.filter((s) => s.recipientEmail === userEmail);
    setOutgoing(buildDisplayItems(out, 'outgoing', userEmail));
    setIncoming(buildDisplayItems(inc, 'incoming', userEmail));
  }, [userEmail]);

  useEffect(() => {
    refreshShares();
  }, [refreshShares]);

  const handleShareNewFile = () => {
    showPrompt(
      'Share New File',
      [{ key: 'email', label: 'Recipient Email', placeholder: 'Enter email address' }],
      (values) => {
        const email = values.email?.trim();
        if (!email) return;

        // Build file list from vault store
        const fileOptions = files.length > 0
          ? files.slice(0, 5).map((f) => ({ text: f.name, fileId: f.id }))
          : [
              { text: 'Document.pdf', fileId: 'demo-1' },
              { text: 'Report.xlsx', fileId: 'demo-2' },
              { text: 'Presentation.pptx', fileId: 'demo-3' },
            ];

        showAlert(
          'Select File',
          'Choose a file to share securely',
          [
            { text: 'Cancel', onPress: () => {} },
            ...fileOptions.map((f) => ({
              text: f.text,
              onPress: () => handleConfirmShare(f.fileId, f.text, email),
            })),
          ],
        );
      },
      'Share',
    );
  };

  const handleConfirmShare = (fileId: string, fileName: string, recipientEmail: string) => {
    showConfirm(
      `Share '${fileName}' with ${recipientEmail}?`,
      'The file key will be encrypted with X25519 public-key cryptography.',
      async () => {
        try {
          // Generate a demo file key (32 random bytes)
          const fileKey = new Uint8Array(32);
          if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(fileKey);
          }
          await shareService.shareFile(fileId, fileName, userEmail, recipientEmail, fileKey);
          refreshShares();
          showSuccess('Shared', `"${fileName}" shared securely with ${recipientEmail}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Share failed';
          showError('Share Failed', msg);
        }
      },
      'Share',
    );
  };

  const handleRevokeAccess = (contact: ShareDisplayItem) => {
    showConfirm(
      `Revoke access for ${contact.name}?`,
      'They will no longer have access to shared files.',
      async () => {
        try {
          for (const shareId of contact.shareIds) {
            await shareService.revokeShare(shareId);
          }
          refreshShares();
          showSuccess('Access Revoked', `${contact.name} no longer has access to your files.`);
        } catch (err) {
          showError('Error', 'Failed to revoke access');
        }
      },
      'Revoke',
    );
  };

  const handleViewFiles = (contact: ShareDisplayItem) => {
    const allShares = shareService.getAllShares();
    const contactShares = allShares.filter(
      (s) =>
        (s.recipientEmail === contact.email || s.senderEmail === contact.email) &&
        s.status !== 'revoked' && s.status !== 'rejected',
    );
    const fileList = contactShares.map((s) => s.fileName).join(', ');
    showAlert(`Files shared with ${contact.name}`, fileList || 'No files');
  };

  const handleAcceptShare = async (contact: ShareDisplayItem) => {
    try {
      const allShares = shareService.getAllShares();
      const pendingShares = allShares.filter(
        (s) => s.senderEmail === contact.email && s.recipientEmail === userEmail && s.status === 'pending',
      );
      for (const s of pendingShares) {
        await shareService.acceptShare(s.id);
      }
      refreshShares();
      showSuccess('Accepted', `You accepted the share from ${contact.name}`);
    } catch {
      showError('Error', 'Failed to accept share');
    }
  };

  const handleRejectShare = async (contact: ShareDisplayItem) => {
    try {
      const allShares = shareService.getAllShares();
      const pendingShares = allShares.filter(
        (s) => s.senderEmail === contact.email && s.recipientEmail === userEmail && s.status === 'pending',
      );
      for (const s of pendingShares) {
        await shareService.rejectShare(s.id);
      }
      refreshShares();
      showSuccess('Rejected', `You rejected the share from ${contact.name}`);
    } catch {
      showError('Error', 'Failed to reject share');
    }
  };

  const activeContacts = outgoing.filter((c) => c.status === 'active');
  const pendingContacts = incoming.filter((c) => c.status === 'pending');

  return (
    <View style={styles.screen}>
      <InAppModal config={modal} />
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle}>Secure Share</Text>
                <Text style={styles.pageSubtitle}>Manage secure file sharing with your contacts</Text>
              </View>

              {/* Active Shares Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Active Shares</Text>
                  <Text style={styles.sectionCount}>{activeContacts.length}</Text>
                </View>
                <View style={styles.sectionContent}>
                  {activeContacts.length > 0 ? (
                    <View style={styles.contactsList}>
                      {activeContacts.map((contact) => (
                        <View key={contact.id} style={styles.contactItem}>
                          <View style={styles.contactLeftContent}>
                            <View
                              style={[
                                styles.contactAvatar,
                                { backgroundColor: contact.avatarColor },
                              ]}
                            >
                              <Text style={styles.contactInitials}>{contact.initials}</Text>
                            </View>
                            <View style={styles.contactInfo}>
                              <Text style={styles.contactName}>{contact.name}</Text>
                              <Text style={styles.contactEmail}>{contact.email}</Text>
                            </View>
                          </View>
                          <View style={styles.contactActions}>
                            <Pressable
                              style={(state: any) => [styles.actionButton, state.hovered && styles.actionButtonHover]}
                              onPress={() => handleViewFiles(contact)}
                            >
                              <Text style={styles.actionButtonText}>Files ({contact.sharedFiles})</Text>
                            </Pressable>
                            <Pressable
                              style={(state: any) => [styles.revokeButton, state.hovered && styles.revokeButtonHover]}
                              onPress={() => handleRevokeAccess(contact)}
                            >
                              <Text style={styles.revokeButtonText}>Revoke</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No active shares yet</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Pending Requests Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Pending Requests</Text>
                  <Text style={styles.sectionCount}>{pendingContacts.length}</Text>
                </View>
                <View style={styles.sectionContent}>
                  {pendingContacts.length > 0 ? (
                    <View style={styles.contactsList}>
                      {pendingContacts.map((contact) => (
                        <View key={contact.id} style={styles.contactItem}>
                          <View style={styles.contactLeftContent}>
                            <View
                              style={[
                                styles.contactAvatar,
                                { backgroundColor: contact.avatarColor },
                              ]}
                            >
                              <Text style={styles.contactInitials}>{contact.initials}</Text>
                            </View>
                            <View style={styles.contactInfo}>
                              <Text style={styles.contactName}>{contact.name}</Text>
                              <Text style={styles.contactEmail}>{contact.email}</Text>
                            </View>
                          </View>
                          <View style={styles.contactActions}>
                            <Pressable
                              style={(state: any) => [styles.acceptButton, state.hovered && styles.acceptButtonHover]}
                              onPress={() => handleAcceptShare(contact)}
                            >
                              <Text style={styles.acceptButtonText}>Accept</Text>
                            </Pressable>
                            <Pressable
                              style={(state: any) => [styles.rejectButton, state.hovered && styles.rejectButtonHover]}
                              onPress={() => handleRejectShare(contact)}
                            >
                              <Text style={styles.rejectButtonText}>Reject</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No pending requests</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Share New File Button */}
              <Pressable style={(state: any) => [styles.shareButton, state.hovered && styles.shareButtonHover]} onPress={handleShareNewFile}>
                <Feather name="share-2" size={18} color="#FFFFFF" />
                <Text style={styles.shareButtonText}>Share New File</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentArea: {
    paddingRight: 10,
  },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 15,
    color: dashboardColors.textSecondary,
  },
  section: {
    marginBottom: dashboardSpacing.lg,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.textSecondary,
  },
  sectionContent: {
    borderRadius: dashboardLayout.radiusXl,
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    overflow: 'hidden',
  },
  contactsList: {
    gap: 0,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.25)',
    ...webOnly({ transition: 'all 0.2s ease' }),
  },
  contactLeftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: dashboardSpacing.md,
    flexShrink: 0,
  },
  contactInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
  },
  contactEmail: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    marginLeft: dashboardSpacing.md,
  },
  actionButton: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(34,211,238,0.2)',
    borderColor: dashboardColors.cyan,
    borderWidth: 1,
  },
  actionButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },
  acceptButton: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  acceptButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  acceptButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  rejectButton: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  rejectButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  rejectButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  revokeButton: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  revokeButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  revokeButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  emptyState: {
    paddingVertical: dashboardSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    marginTop: dashboardSpacing.md,
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)',
      boxShadow: '0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(6,182,212,0.3)',
      cursor: 'pointer',
    }),
  },
  shareButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
