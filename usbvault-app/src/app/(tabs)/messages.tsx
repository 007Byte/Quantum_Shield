import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { messageService } from '@/services/messageService';
import { useAuthStore } from '@/stores/authStore';

import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyGlowTier3,
} from '@/components/dashboard2/styles';

interface DisplayConversation {
  id: string;
  contact: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

interface DisplayMessage {
  id: string;
  text: string;
  sender: 'user' | 'contact';
  timestamp: string;
  encrypted: boolean;
}

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

export default function MessagesScreen() {
  const { modal, showAlert, showPrompt, showError, dismiss } = useInAppModal();
  const userEmail = useAuthStore((s) => s.email) || 'user@usbvault.local';

  const [conversations, setConversations] = useState<DisplayConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);

  const refreshConversations = useCallback(() => {
    const convs = messageService.getConversations(userEmail);
    setConversations(
      convs.map((c) => ({
        id: c.id,
        contact: c.participantEmail,
        lastMessage: c.lastMessagePreview,
        timestamp: formatTimestamp(c.lastMessageAt),
        unread: c.unreadCount > 0,
      })),
    );
  }, [userEmail]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const msgs = messageService.getMessages(conversationId);
    const decrypted: DisplayMessage[] = [];
    for (const msg of msgs) {
      let text = '[Encrypted]';
      let encrypted = true;
      try {
        text = await messageService.decryptMessage(msg, userEmail);
        encrypted = false;
      } catch {
        // Show as encrypted if decryption fails
        try {
          // Try with sender's key for demo mode
          text = await messageService.decryptMessage(msg, msg.recipientEmail);
          encrypted = false;
        } catch {
          text = '[Encrypted — unable to decrypt]';
        }
      }
      decrypted.push({
        id: msg.id,
        text,
        sender: msg.senderEmail === userEmail ? 'user' : 'contact',
        timestamp: formatTimestamp(msg.createdAt),
        encrypted,
      });

      // Mark incoming messages as read
      if (msg.recipientEmail === userEmail && !msg.readAt) {
        messageService.markAsRead(msg.id);
      }
    }
    setDisplayMessages(decrypted);
  }, [userEmail]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
    } else {
      setDisplayMessages([]);
    }
  }, [selectedConversationId, loadMessages]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const conversationMessages = displayMessages;

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversationId || !selectedConversation) return;

    try {
      await messageService.sendMessage(userEmail, selectedConversation.contact, messageInput.trim());
      setMessageInput('');
      // Refresh
      await loadMessages(selectedConversationId);
      refreshConversations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      showError('Send Failed', msg);
    }
  };

  const handleMessageOptions = (messageId: string) => {
    showAlert('Message Options', 'Choose an action', [
      {
        text: 'Copy',
        onPress: () => {
          const msg = displayMessages.find((m) => m.id === messageId);
          if (msg && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(msg.text).catch(() => {});
          }
          showAlert('Copied to clipboard');
          dismiss();
        },
      },
      {
        text: 'Delete',
        onPress: () => {
          messageService.deleteMessage(messageId);
          if (selectedConversationId) {
            loadMessages(selectedConversationId);
          }
          refreshConversations();
          dismiss();
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => dismiss() },
    ]);
  };

  const handleNewMessage = () => {
    showPrompt(
      'New Encrypted Message',
      [{ key: 'recipient', label: 'Recipient Email', placeholder: 'Enter recipient email' }],
      async (values) => {
        const recipientEmail = values.recipient?.trim();
        if (!recipientEmail) return;

        // Send a placeholder to create the conversation
        try {
          const msg = await messageService.sendMessage(userEmail, recipientEmail, 'Hello! 👋');
          refreshConversations();
          setSelectedConversationId(msg.conversationId);
          await loadMessages(msg.conversationId);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Failed';
          showError('Error', errMsg);
        }
      },
      'Create',
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <InAppModal config={modal} />
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentWrapper}>
              {/* Header with Title */}
              <View style={styles.header}>
                <View style={styles.headerRow}>
                  <Text style={styles.title}>Secure Messages</Text>
                  <Pressable style={(state: any) => [styles.newMessageButton, state.hovered && styles.newMessageButtonHover]} onPress={handleNewMessage}>
                    <Feather name="plus" size={18} color="#fff" />
                    <Text style={styles.newMessageButtonText}>New Message</Text>
                  </Pressable>
                </View>
              </View>

              {/* Two-Column Layout */}
              <View style={styles.messagesContainer}>
                {/* Left Column: Conversation List */}
                <View style={styles.threadList}>
                  <Text style={styles.columnTitle}>Conversations</Text>
                  <View style={styles.threadItems}>
                    {conversations.length === 0 && (
                      <View style={styles.emptyConversations}>
                        <Feather name="message-circle" size={32} color="rgba(139,92,246,0.35)" />
                        <Text style={styles.emptyConversationsText}>No conversations yet</Text>
                        <Text style={styles.emptyConversationsSub}>Start a new encrypted message</Text>
                      </View>
                    )}
                    {conversations.map((conversation) => (
                      <Pressable
                        key={conversation.id}
                        style={(state: any) => [
                          styles.threadItem,
                          glassPanelBase,
                          webOnlyGlass,
                          webOnlyGlowTier3,
                          selectedConversationId === conversation.id && styles.threadItemActive,
                          state.hovered && styles.threadItemHover,
                        ]}
                        onPress={() => setSelectedConversationId(conversation.id)}
                      >
                        {/* Avatar */}
                        <View style={[styles.avatar, { backgroundColor: dashboardColors.purple }]}>
                          <Text style={styles.avatarText}>{conversation.contact.charAt(0)}</Text>
                        </View>

                        {/* Thread Info */}
                        <View style={styles.threadInfo}>
                          <Text style={styles.senderName}>{conversation.contact}</Text>
                          <Text style={styles.preview} numberOfLines={1}>
                            {conversation.lastMessage || 'No messages yet'}
                          </Text>
                        </View>

                        {/* Time & Unread Badge */}
                        <View style={styles.threadMeta}>
                          <Text style={styles.time}>{conversation.timestamp}</Text>
                          {conversation.unread && (
                            <View style={styles.unreadBadge}>
                              <Text style={styles.unreadText}>1</Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Right Column: Message Detail View */}
                <View style={styles.messageDetail}>
                  {selectedConversation ? (
                    <>
                      {/* Message Header */}
                      <View style={[styles.messageHeader, glassPanelBase, webOnlyGlass]}>
                        <View style={styles.detailHeaderContent}>
                          <View style={[styles.avatarLarge, { backgroundColor: dashboardColors.cyan }]}>
                            <Text style={styles.avatarTextLarge}>{selectedConversation.contact.charAt(0)}</Text>
                          </View>
                          <View style={styles.detailHeaderInfo}>
                            <Text style={styles.detailSenderName}>{selectedConversation.contact}</Text>
                            <Text style={styles.detailTime}>{selectedConversation.timestamp}</Text>
                          </View>
                        </View>
                        <Pressable style={(state: any) => [styles.headerAction, state.hovered && styles.headerActionHover]}>
                          <Feather name="more-vertical" size={20} color={dashboardColors.textSecondary} />
                        </Pressable>
                      </View>

                      {/* Message Content (scrollable) */}
                      <View style={styles.messageContent}>
                        {conversationMessages.length === 0 ? (
                          <View style={styles.noMessagesYet}>
                            <Text style={styles.noMessagesYetText}>No messages yet. Start the conversation!</Text>
                          </View>
                        ) : (
                          conversationMessages.map((message) => (
                            <Pressable
                              key={message.id}
                              onLongPress={() => handleMessageOptions(message.id)}
                              style={(state: any) => [
                                styles.messageBubble,
                                message.sender === 'user'
                                  ? styles.messageBubbleSent
                                  : styles.messageBubbleReceived,
                                glassPanelBase,
                                webOnlyGlass,
                                state.hovered && styles.messageBubbleHover,
                              ]}
                            >
                              <Text style={styles.messageBubbleText}>{message.text}</Text>
                              <View style={styles.messageMeta}>
                                <Feather name="lock" size={10} color="rgba(255,255,255,0.4)" />
                                <Text style={styles.messageTimestamp}>{message.timestamp}</Text>
                              </View>
                            </Pressable>
                          ))
                        )}
                      </View>

                      {/* Compose Area */}
                      <Pressable style={(state: any) => [styles.composeContainer, glassPanelBase, webOnlyGlass, state.hovered && styles.composeContainerHover]}>
                        <TextInput
                          style={styles.composeInput}
                          placeholder="Type your message..."
                          placeholderTextColor={dashboardColors.textSecondary}
                          value={messageInput}
                          onChangeText={setMessageInput}
                          multiline
                        />
                        <Pressable style={(state: any) => [styles.sendButton, state.hovered && styles.sendButtonHover]} onPress={handleSendMessage}>
                          <Feather name="send" size={18} color="#fff" />
                        </Pressable>
                      </Pressable>
                    </>
                  ) : (
                    <View style={styles.noSelection}>
                      <Feather name="message-circle" size={48} color={dashboardColors.textSecondary} />
                      <Text style={styles.noSelectionText}>Select a message to view</Text>
                    </View>
                  )}
                </View>
              </View>
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
  contentWrapper: {
    paddingTop: dashboardSpacing.lg,
  },
  header: {
    marginBottom: dashboardSpacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: dashboardSpacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    letterSpacing: -0.5,
  },
  newMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    gap: 6,
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  newMessageButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  newMessageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  messagesContainer: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    minHeight: 500,
  },
  threadList: {
    width: 280,
    flexDirection: 'column',
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
    marginBottom: dashboardSpacing.sm,
    paddingHorizontal: 4,
  },
  threadItems: {
    gap: dashboardSpacing.sm,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    gap: dashboardSpacing.md,
    ...webOnly({ cursor: 'pointer' }),
  },
  threadItemHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  threadItemActive: {
    borderColor: dashboardColors.cyan,
    ...webOnly({ boxShadow: '0 0 12px rgba(34,211,238,0.3)' }),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  threadInfo: {
    flex: 1,
    minWidth: 0,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 2,
  },
  preview: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  threadMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
  },
  unreadBadge: {
    backgroundColor: dashboardColors.cyan,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  messageDetail: {
    flex: 1,
    flexDirection: 'column',
    gap: dashboardSpacing.md,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    minHeight: 70,
  },
  detailHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    flex: 1,
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextLarge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  detailHeaderInfo: {
    gap: 2,
  },
  detailSenderName: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  detailTime: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ cursor: 'pointer' }),
  },
  headerActionHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  messageContent: {
    flex: 1,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    justifyContent: 'flex-end',
    gap: dashboardSpacing.sm,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    marginBottom: dashboardSpacing.sm,
  },
  messageBubbleHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  messageBubbleReceived: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,211,238,0.6)',
    borderColor: dashboardColors.borderCyan,
  },
  messageBubbleSent: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(139,92,246,0.6)',
    borderColor: dashboardColors.purple,
  },
  messageBubbleText: {
    fontSize: 14,
    color: dashboardColors.textPrimary,
    lineHeight: 20,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimestamp: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  noMessagesYet: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMessagesYetText: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
  },
  composeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    gap: dashboardSpacing.sm,
    minHeight: 56,
    ...webOnly({ transition: 'all 0.15s ease', cursor: 'text' }),
  },
  composeContainerHover: {
    borderColor: 'rgba(34,211,238,0.45)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(34,211,238,0.2), 0 0 24px rgba(139,92,246,0.15)',
    }),
  },
  composeInput: {
    flex: 1,
    fontSize: 14,
    color: dashboardColors.textPrimary,
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.sm,
    backgroundColor: 'transparent',
    maxHeight: 100,
    ...webOnly({ outline: 'none' }),
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      background: 'linear-gradient(135deg, #06B6D4 0%, #22D3EE 100%)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  sendButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  noSelection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.md,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  noSelectionText: {
    fontSize: 16,
    color: dashboardColors.textSecondary,
  },
  emptyConversations: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyConversationsText: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  emptyConversationsSub: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    opacity: 0.7,
  },
});
