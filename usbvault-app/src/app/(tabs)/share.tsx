import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { shareService, ShareRequest } from '@/services/shareService';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/hooks/useLanguage';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonCard } from '@/components/common/SkeletonLoader';

import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';

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
  return (
    email
      .split('@')[0]
      .split('.')
      .map(p => p.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2) || '??'
  );
}

function emailToColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function buildDisplayItems(
  shares: ShareRequest[],
  direction: 'outgoing' | 'incoming',
  _userEmail: string
): ShareDisplayItem[] {
  const grouped = new Map<string, ShareRequest[]>();
  for (const s of shares) {
    const key = direction === 'outgoing' ? s.recipientEmail : s.senderEmail;
    const arr = grouped.get(key) || [];
    arr.push(s);
    grouped.set(key, arr);
  }
  const items: ShareDisplayItem[] = [];
  for (const [email, reqs] of grouped) {
    const activeReqs = reqs.filter(r => r.status === 'accepted');
    const pendingReqs = reqs.filter(r => r.status === 'pending');
    const status: 'active' | 'pending' | 'revoked' =
      activeReqs.length > 0 ? 'active' : pendingReqs.length > 0 ? 'pending' : 'revoked';
    items.push({
      id: email,
      name: email.split('@')[0],
      email,
      status,
      initials: emailToInitials(email),
      avatarColor: emailToColor(email),
      sharedFiles: reqs.filter(r => r.status !== 'revoked' && r.status !== 'rejected').length,
      shareIds: reqs.map(r => r.id),
    });
  }
  return items;
}

function ShareScreen() {
  const { t } = useLanguage();
  const { modal, showAlert, showSuccess, showError, showConfirm, showPrompt } = useInAppModal();
  const files = useVaultListStore(s => s.files);
  const userEmail = useAuthStore(s => s.email) || 'user@usbvault.local';

  const [outgoing, setOutgoing] = useState<ShareDisplayItem[]>([]);
  const [incoming, setIncoming] = useState<ShareDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshShares = useCallback(() => {
    const allShares = shareService.getAllShares();
    const out = allShares.filter(s => s.senderEmail === userEmail);
    const inc = allShares.filter(s => s.recipientEmail === userEmail);
    setOutgoing(buildDisplayItems(out, 'outgoing', userEmail));
    setIncoming(buildDisplayItems(inc, 'incoming', userEmail));
    setIsLoading(false);
  }, [userEmail]);

  useEffect(() => {
    refreshShares();
  }, [refreshShares]);

  const handleShareNewFile = () => {
    showPrompt(
      t('share.shareNewFile'),
      [{ key: 'email', label: t('share.recipientEmail'), placeholder: t('share.enterEmail') }],
      values => {
        const email = values.email?.trim();
        if (!email) return;

        // Build file list from vault store
        const fileOptions =
          files.length > 0
            ? files.slice(0, 5).map(f => ({ text: f.name, fileId: f.id }))
            : [
                { text: t('share.demoFile1'), fileId: 'demo-1' },
                { text: t('share.demoFile2'), fileId: 'demo-2' },
                { text: t('share.demoFile3'), fileId: 'demo-3' },
              ];

        showAlert(t('share.selectFile'), t('share.chooseFile'), [
          { text: t('share.cancel'), onPress: () => {} },
          ...fileOptions.map(f => ({
            text: f.text,
            onPress: () => handleConfirmShare(f.fileId, f.text, email),
          })),
        ]);
      },
      t('share.shareButton')
    );
  };

  const handleConfirmShare = (fileId: string, fileName: string, recipientEmail: string) => {
    showConfirm(
      `${t('share.shareWith')} '${fileName}' with ${recipientEmail}?`,
      t('share.shareDescription'),
      async () => {
        try {
          // Generate a demo file key (32 random bytes)
          const fileKey = new Uint8Array(32);
          if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(fileKey);
          }
          await shareService.shareFile(fileId, fileName, userEmail, recipientEmail, fileKey);
          refreshShares();
          showSuccess(
            t('share.shared'),
            `"${fileName}" ${t('share.sharedWith')} ${recipientEmail}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('share.shareFailed');
          showError(t('share.shareFailed'), msg);
        }
      },
      t('share.shareButton')
    );
  };

  const handleRevokeAccess = (contact: ShareDisplayItem) => {
    showConfirm(
      `${t('share.revokeAccess')} ${contact.name}?`,
      t('share.revokeDescription'),
      async () => {
        try {
          for (const shareId of contact.shareIds) {
            await shareService.revokeShare(shareId);
          }
          refreshShares();
          showSuccess(t('share.accessRevoked'), `${contact.name} ${t('share.noLongerAccess')}`);
        } catch (err) {
          showError(t('share.error'), t('share.failedToRevoke'));
        }
      },
      t('share.revokeBtn')
    );
  };

  const handleViewFiles = (contact: ShareDisplayItem) => {
    const allShares = shareService.getAllShares();
    const contactShares = allShares.filter(
      s =>
        (s.recipientEmail === contact.email || s.senderEmail === contact.email) &&
        s.status !== 'revoked' &&
        s.status !== 'rejected'
    );
    const fileList = contactShares.map(s => s.fileName).join(', ');
    showAlert(`${t('share.filesSharedWith')} ${contact.name}`, fileList || t('share.noFiles'));
  };

  const handleAcceptShare = async (contact: ShareDisplayItem) => {
    try {
      const allShares = shareService.getAllShares();
      const pendingShares = allShares.filter(
        s =>
          s.senderEmail === contact.email &&
          s.recipientEmail === userEmail &&
          s.status === 'pending'
      );
      for (const s of pendingShares) {
        await shareService.acceptShare(s.id);
      }
      refreshShares();
      showSuccess(t('share.accepted'), `${t('share.youAccepted')} ${contact.name}`);
    } catch {
      showError(t('share.error'), t('share.failedToAccept'));
    }
  };

  const handleRejectShare = async (contact: ShareDisplayItem) => {
    try {
      const allShares = shareService.getAllShares();
      const pendingShares = allShares.filter(
        s =>
          s.senderEmail === contact.email &&
          s.recipientEmail === userEmail &&
          s.status === 'pending'
      );
      for (const s of pendingShares) {
        await shareService.rejectShare(s.id);
      }
      refreshShares();
      showSuccess(t('share.rejected'), `${t('share.youRejected')} ${contact.name}`);
    } catch {
      showError(t('share.error'), t('share.failedToReject'));
    }
  };

  const activeContacts = outgoing.filter(c => c.status === 'active');
  const pendingContacts = incoming.filter(c => c.status === 'pending');

  return (
    <View style={styles.screen}>
      <InAppModal config={modal} />
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle} accessibilityRole="header">
                  {t('share.pageTitle')}
                </Text>
                <Text style={styles.pageSubtitle}>{t('share.pageSubtitle')}</Text>
              </View>

              {/* Loading State */}
              {isLoading ? (
                <View style={{ gap: 12 }}>
                  <SkeletonCard lines={3} />
                  <SkeletonCard lines={3} />
                  <SkeletonCard lines={2} />
                </View>
              ) : activeContacts.length === 0 && pendingContacts.length === 0 ? (
                <EmptyState
                  icon="users"
                  title={t('empty.share')}
                  description={t('empty.shareDescription')}
                  actionLabel={t('share.shareNewFile')}
                  onAction={handleShareNewFile}
                />
              ) : (
                <>
                  {/* Active Shares Section */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle} accessibilityRole="header">
                        {t('share.activeShares')}
                      </Text>
                      <Text style={styles.sectionCount}>{activeContacts.length}</Text>
                    </View>
                    <View style={styles.sectionContent}>
                      {activeContacts.length > 0 ? (
                        <View style={styles.contactsList}>
                          {activeContacts.map(contact => (
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
                                  accessibilityRole="button"
                                  style={(state: any) => [
                                    styles.actionButton,
                                    state.hovered && styles.actionButtonHover,
                                  ]}
                                  onPress={() => handleViewFiles(contact)}
                                >
                                  <Text style={styles.actionButtonText}>
                                    {t('share.filesCount', { count: contact.sharedFiles })}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  style={(state: any) => [
                                    styles.revokeButton,
                                    state.hovered && styles.revokeButtonHover,
                                  ]}
                                  onPress={() => handleRevokeAccess(contact)}
                                >
                                  <Text style={styles.revokeButtonText}>
                                    {t('share.revokeBtn')}
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyStateText}>{t('share.noActiveShares')}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Pending Requests Section */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle} accessibilityRole="header">
                        {t('share.pendingRequests')}
                      </Text>
                      <Text style={styles.sectionCount}>{pendingContacts.length}</Text>
                    </View>
                    <View style={styles.sectionContent}>
                      {pendingContacts.length > 0 ? (
                        <View style={styles.contactsList}>
                          {pendingContacts.map(contact => (
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
                                  accessibilityRole="button"
                                  style={(state: any) => [
                                    styles.acceptButton,
                                    state.hovered && styles.acceptButtonHover,
                                  ]}
                                  onPress={() => handleAcceptShare(contact)}
                                >
                                  <Text style={styles.acceptButtonText}>{t('share.accept')}</Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  style={(state: any) => [
                                    styles.rejectButton,
                                    state.hovered && styles.rejectButtonHover,
                                  ]}
                                  onPress={() => handleRejectShare(contact)}
                                >
                                  <Text style={styles.rejectButtonText}>{t('share.reject')}</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyStateText}>{t('share.noPendingRequests')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </>
              )}

              {/* Share New File Button */}
              <Pressable
                style={(state: any) => [
                  styles.shareButton,
                  state.hovered && styles.shareButtonHover,
                ]}
                onPress={handleShareNewFile}
                accessibilityRole="button"
              >
                <Feather name="share-2" size={18} color="#FFFFFF" />
                <Text style={styles.shareButtonText}>{t('share.shareNewFile')}</Text>
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
      background:
        'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
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
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderColor: '#7C3AED',
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
    color: '#7C3AED',
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

export default withErrorBoundary(ShareScreen, 'Share');
