/**
 * Group Message Service Tests — MONO-1
 *
 * Covers group lifecycle (create/add/remove/leave/delete), per-recipient group
 * key sealing, AES-256-GCM message encrypt/decrypt round-trips (real WebCrypto
 * via the jsdom polyfill), key rotation + version-aware decryption, admin
 * authorization branches, ghost-message expiry/reaping, and read tracking.
 *
 * Pinned to Platform.OS === 'web' so the localStorage persistence paths run.
 * Only genuine boundaries are mocked: the native sealToPublicKey bridge,
 * the public-key directory (shareService), audit, and sync.
 */

import { groupMessageService } from '../groupMessage';

import { sealToPublicKey } from '@/crypto/bridge';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';

// localStorage mock (full reset between tests).
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// sealToPublicKey is the native crypto boundary. We make it deterministic and
// dependent on its inputs so we can assert that distinct members get distinct
// sealed key material and that the per-recipient loop ran for everyone.
jest.mock('@/crypto/bridge', () => ({
  sealToPublicKey: jest.fn(async (publicKeyBytes: Uint8Array, keyBytes: Uint8Array) => {
    // Return pubkey[0] as a marker byte followed by the raw key bytes so the
    // resulting hex is unique per recipient and verifiably tied to the key.
    const out = new Uint8Array(keyBytes.length + 1);
    out[0] = publicKeyBytes[0] ?? 0;
    out.set(keyBytes, 1);
    return out;
  }),
}));

// shareService is the public-key directory boundary.
jest.mock('@/services/sharing', () => ({
  shareService: {
    getPublicKey: jest.fn((email: string) => {
      const map: Record<string, string> = {
        'admin@example.com': 'aa'.repeat(32),
        'bob@example.com': 'bb'.repeat(32),
        'carol@example.com': 'cc'.repeat(32),
        'dave@example.com': 'dd'.repeat(32),
      };
      return map[email] ?? null;
    }),
  },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/services/syncService', () => ({
  syncService: { enqueue: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ADMIN = 'admin@example.com';
const BOB = 'bob@example.com';
const CAROL = 'carol@example.com';

async function makeGroup(members: string[] = [BOB, CAROL]) {
  return groupMessageService.createGroup('Team', ADMIN, members);
}

describe('GroupMessageService', () => {
  beforeEach(() => {
    localStorage.clear();
    groupMessageService.clearAll();
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('creates a group with deduped members, an admin, and member roles', async () => {
      // ADMIN passed in both as creator and the member list — must be deduped.
      const group = await makeGroup([ADMIN, BOB, CAROL]);

      expect(group.id).toMatch(/^group-/);
      expect(group.name).toBe('Team');
      expect(group.creatorEmail).toBe(ADMIN);
      expect(group.members).toHaveLength(3);

      const admin = group.members.find(m => m.email === ADMIN)!;
      expect(admin.role).toBe('admin');
      expect(admin.displayName).toBe('admin');
      group.members.filter(m => m.email !== ADMIN).forEach(m => expect(m.role).toBe('member'));

      expect(group.keyVersion).toBe(1);
      expect(group.groupKeyHex).toMatch(/^[0-9a-f]{64}$/); // 32-byte AES key
    });

    it('seals the group key once per member (per-recipient delivery)', async () => {
      await makeGroup([BOB, CAROL]); // + ADMIN => 3 members
      expect(sealToPublicKey).toHaveBeenCalledTimes(3);
    });

    it('gives each member distinct sealed key material tied to their pubkey', async () => {
      const group = await makeGroup([BOB, CAROL]);
      const sealedHexes = group.members.map(m => m.encryptedGroupKeyHex);
      // All distinct (marker byte differs per pubkey).
      expect(new Set(sealedHexes).size).toBe(group.members.length);
      group.members.forEach(m => expect(m.encryptedGroupKeyHex.length).toBeGreaterThan(0));
    });

    it('persists the group, an empty message list, and key-history v1', async () => {
      const group = await makeGroup([BOB]);
      const storedGroups = JSON.parse(localStorage.getItem('usbvault:groups')!);
      expect(storedGroups).toHaveLength(1);
      expect(storedGroups[0].id).toBe(group.id);

      const history = JSON.parse(localStorage.getItem('usbvault:group_key_history')!);
      expect(history[0].history[0]).toMatchObject({
        groupId: group.id,
        version: 1,
        createdBy: ADMIN,
      });
    });

    it('audits creation and enqueues a sync event', async () => {
      const group = await makeGroup([BOB, CAROL]);
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'group_created',
        expect.objectContaining({ groupId: group.id, creatorEmail: ADMIN, memberCount: 2 })
      );
      expect(syncService.enqueue).toHaveBeenCalledWith(
        'message',
        expect.objectContaining({ type: 'group_created', groupId: group.id })
      );
    });

    it('rejects creation when a member has no public key in the directory', async () => {
      // shareService returns null -> publicKeyHex becomes '' -> the seal step
      // cannot derive key bytes from an empty hex string and throws. Group
      // creation requires every member to have a resolvable public key.
      await expect(
        groupMessageService.createGroup('Mystery', ADMIN, ['ghost@nowhere.io'])
      ).rejects.toThrow();
    });
  });

  describe('addMember', () => {
    it('adds a new member sealed under the existing group key', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.addMember(group.id, CAROL, ADMIN);
      const updated = groupMessageService.getGroup(group.id)!;
      const carol = updated.members.find(m => m.email === CAROL)!;
      expect(carol).toBeDefined();
      expect(carol.role).toBe('member');
      expect(carol.encryptedGroupKeyHex.length).toBeGreaterThan(0);
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'group_member_added',
        expect.objectContaining({ groupId: group.id, newMemberEmail: CAROL })
      );
    });

    it('throws for a missing group', async () => {
      await expect(groupMessageService.addMember('group-nope', BOB, ADMIN)).rejects.toThrow(
        'Group group-nope not found'
      );
    });

    it('throws when the requester is not an admin', async () => {
      const group = await makeGroup([BOB, CAROL]);
      await expect(
        groupMessageService.addMember(group.id, 'dave@example.com', BOB)
      ).rejects.toThrow('Only admins can add members');
    });

    it('throws when the member is already in the group', async () => {
      const group = await makeGroup([BOB]);
      await expect(groupMessageService.addMember(group.id, BOB, ADMIN)).rejects.toThrow(
        'Member already in group'
      );
    });

    it('throws when no public key can be fetched for the new member', async () => {
      const group = await makeGroup([BOB]);
      await expect(
        groupMessageService.addMember(group.id, 'unknown@nowhere.io', ADMIN)
      ).rejects.toThrow('Could not fetch public key for unknown@nowhere.io');
    });
  });

  describe('removeMember + rotateGroupKey', () => {
    it('removes the member and rotates the key to a new version', async () => {
      const group = await makeGroup([BOB, CAROL]);
      const v1Key = group.groupKeyHex;

      await groupMessageService.removeMember(group.id, BOB, ADMIN);

      const updated = groupMessageService.getGroup(group.id)!;
      expect(updated.members.find(m => m.email === BOB)).toBeUndefined();
      expect(updated.keyVersion).toBe(2);
      expect(updated.groupKeyHex).not.toBe(v1Key);
      // Remaining members re-sealed under the new key.
      updated.members.forEach(m => expect(m.encryptedGroupKeyHex.length).toBeGreaterThan(0));
    });

    it('records the rotated key in history', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.rotateGroupKey(group.id, ADMIN);
      const history = JSON.parse(localStorage.getItem('usbvault:group_key_history')!);
      const entries = history.find((h: any) => h.groupId === group.id).history;
      expect(entries).toHaveLength(2);
      expect(entries.map((e: any) => e.version)).toEqual([1, 2]);
    });

    it('rejects rotation from a non-admin', async () => {
      const group = await makeGroup([BOB]);
      await expect(groupMessageService.rotateGroupKey(group.id, BOB)).rejects.toThrow(
        'Only admins can rotate keys'
      );
    });

    it('rejects removal from a non-admin', async () => {
      const group = await makeGroup([BOB, CAROL]);
      await expect(groupMessageService.removeMember(group.id, CAROL, BOB)).rejects.toThrow(
        'Only admins can remove members'
      );
    });
  });

  describe('sendGroupMessage + decryptGroupMessage (real AES-256-GCM)', () => {
    it('encrypts a message and round-trips back to the original plaintext', async () => {
      const group = await makeGroup([BOB]);
      const plaintext = 'classified intel \u{1F510}';
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, plaintext);

      expect(msg.senderEmail).toBe(ADMIN);
      expect(msg.senderDisplayName).toBe('admin');
      expect(msg.readBy).toEqual([ADMIN]);
      expect(msg.keyVersion).toBe(1);
      // Ciphertext is hex and not the plaintext.
      expect(msg.encryptedContentHex).toMatch(/^[0-9a-f]+$/);
      expect(msg.encryptedContentHex).not.toContain(Buffer.from(plaintext).toString('hex'));

      const decrypted = await groupMessageService.decryptGroupMessage(msg, BOB);
      expect(decrypted).toBe(plaintext);
    });

    it('updates lastMessageAt/preview and appends to the message store', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.sendGroupMessage(group.id, ADMIN, 'A'.repeat(200));
      const updated = groupMessageService.getGroup(group.id)!;
      expect(updated.lastMessageAt).toBeDefined();
      expect(updated.lastMessagePreview).toHaveLength(100); // truncated to 100
      expect(groupMessageService.getGroupMessages(group.id)).toHaveLength(1);
    });

    it('throws when the group does not exist', async () => {
      await expect(groupMessageService.sendGroupMessage('group-nope', ADMIN, 'hi')).rejects.toThrow(
        'Group group-nope not found'
      );
    });

    it('throws when the sender is not a member', async () => {
      const group = await makeGroup([BOB]);
      await expect(
        groupMessageService.sendGroupMessage(group.id, 'intruder@evil.io', 'hi')
      ).rejects.toThrow('is not a member of group');
    });

    it('decrypt rejects a non-member', async () => {
      const group = await makeGroup([BOB]);
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'secret');
      await expect(
        groupMessageService.decryptGroupMessage(msg, 'intruder@evil.io')
      ).rejects.toThrow('is not a member of this group');
    });

    it('decrypt rejects when the group is gone', async () => {
      const group = await makeGroup([BOB]);
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'secret');
      await groupMessageService.deleteGroup(group.id, ADMIN);
      await expect(groupMessageService.decryptGroupMessage(msg, BOB)).rejects.toThrow('not found');
    });

    it('decrypts an old-version message after a key rotation (version-aware)', async () => {
      const group = await makeGroup([BOB]);
      const oldMsg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'pre-rotation');
      expect(oldMsg.keyVersion).toBe(1);

      await groupMessageService.rotateGroupKey(group.id, ADMIN);
      expect(groupMessageService.getGroup(group.id)!.keyVersion).toBe(2);

      // The current group key changed, but history retains v1 — decrypt must
      // pull the historical key for the older message.
      const decrypted = await groupMessageService.decryptGroupMessage(oldMsg, BOB);
      expect(decrypted).toBe('pre-rotation');
    });

    it('throws if the historical key version is missing', async () => {
      const group = await makeGroup([BOB]);
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'x');
      // Force a higher current version but wipe history so lookup fails.
      const g = groupMessageService.getGroup(group.id)!;
      g.keyVersion = 5;
      localStorage.removeItem('usbvault:group_key_history');
      (groupMessageService as any).keyHistory.set(group.id, []);
      await expect(groupMessageService.decryptGroupMessage(msg, BOB)).rejects.toThrow(
        'Could not find key version'
      );
    });
  });

  describe('ghost messages', () => {
    it('sets ghost flags and an expiry when ghost mode + timer are active', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.setGroupGhostMode(group.id, true, 30, ADMIN);
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'poof');
      expect(msg.isGhost).toBe(true);
      expect(msg.ghostTimerSec).toBe(30);
      expect(msg.ghostTimerStarted).toBe(true);
      expect(msg.expiresAt).toBeDefined();
      expect(new Date(msg.expiresAt!).getTime()).toBeGreaterThan(new Date(msg.createdAt).getTime());
    });

    it('setGroupGhostMode rejects a non-admin', async () => {
      const group = await makeGroup([BOB]);
      await expect(groupMessageService.setGroupGhostMode(group.id, true, 10, BOB)).rejects.toThrow(
        'Only admins can set ghost mode'
      );
    });

    it('reaps expired ghost messages but keeps live ones', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.setGroupGhostMode(group.id, true, 60, ADMIN);
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'temporary');

      // Backdate the expiry to the past.
      const stored = (groupMessageService as any).messages.get(group.id);
      stored[0].expiresAt = new Date(Date.now() - 1000).toISOString();

      await groupMessageService.reapExpiredGroupGhostMessages();
      expect(groupMessageService.getGroupMessages(group.id)).toHaveLength(0);
      expect(auditService.log).toHaveBeenCalledWith('system', 'group_ghost_messages_reaped', {
        count: 1,
      });
      expect(msg.isGhost).toBe(true);
    });

    it('reap is a no-op when nothing is expired', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.sendGroupMessage(group.id, ADMIN, 'permanent');
      await groupMessageService.reapExpiredGroupGhostMessages();
      expect(groupMessageService.getGroupMessages(group.id)).toHaveLength(1);
    });
  });

  describe('read tracking + unread counts', () => {
    it('marks a message read once per member and enqueues a read event', async () => {
      const group = await makeGroup([BOB]);
      const msg = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'hi');
      (syncService.enqueue as jest.Mock).mockClear();

      await groupMessageService.markGroupMessageAsRead(msg.id, group.id, BOB);
      const stored = groupMessageService.getGroupMessages(group.id)[0];
      expect(stored.readBy).toContain(BOB);
      expect(syncService.enqueue).toHaveBeenCalledTimes(1);

      // Second call is idempotent (no duplicate readBy, no extra sync event).
      await groupMessageService.markGroupMessageAsRead(msg.id, group.id, BOB);
      expect(
        groupMessageService.getGroupMessages(group.id)[0].readBy.filter(e => e === BOB)
      ).toHaveLength(1);
      expect(syncService.enqueue).toHaveBeenCalledTimes(1);
    });

    it('markGroupMessageAsRead is a no-op for unknown group/message', async () => {
      await groupMessageService.markGroupMessageAsRead('m', 'no-group', BOB);
      const group = await makeGroup([BOB]);
      await groupMessageService.markGroupMessageAsRead('no-msg', group.id, BOB);
      expect(true).toBe(true); // should not throw
    });

    it('computes unread count from the sender perspective', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.sendGroupMessage(group.id, ADMIN, 'one');
      await groupMessageService.sendGroupMessage(group.id, ADMIN, 'two');
      // ADMIN is in readBy for own messages -> 0 unread; BOB has read none -> 2.
      expect(groupMessageService.updateGroupUnreadCount(group.id, ADMIN)).toBe(0);
      expect(groupMessageService.updateGroupUnreadCount(group.id, BOB)).toBe(2);
    });

    it('updateGroupUnreadCount returns 0 for an unknown group', () => {
      expect(groupMessageService.updateGroupUnreadCount('nope', BOB)).toBe(0);
    });
  });

  describe('getGroups / getGroupMessages ordering', () => {
    it('returns groups a user belongs to, newest activity first', async () => {
      const g1 = await makeGroup([BOB]);
      const g2 = await groupMessageService.createGroup('Second', ADMIN, [CAROL]);
      // Give g1 newer activity.
      await new Promise(r => setTimeout(r, 5));
      await groupMessageService.sendGroupMessage(g1.id, ADMIN, 'bump');

      const adminGroups = groupMessageService.getGroups(ADMIN);
      expect(adminGroups.map(g => g.id)).toEqual([g1.id, g2.id]);

      // CAROL only belongs to g2.
      const carolGroups = groupMessageService.getGroups(CAROL);
      expect(carolGroups.map(g => g.id)).toEqual([g2.id]);
    });

    it('returns messages sorted chronologically', async () => {
      const group = await makeGroup([BOB]);
      const m1 = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'first');
      await new Promise(r => setTimeout(r, 5));
      const m2 = await groupMessageService.sendGroupMessage(group.id, ADMIN, 'second');
      const ordered = groupMessageService.getGroupMessages(group.id);
      expect(ordered.map(m => m.id)).toEqual([m1.id, m2.id]);
    });

    it('returns [] for a group with no messages', () => {
      expect(groupMessageService.getGroupMessages('nope')).toEqual([]);
    });
  });

  describe('leaveGroup', () => {
    it('promotes the next member to admin when an admin leaves', async () => {
      const group = await makeGroup([BOB, CAROL]);
      await groupMessageService.leaveGroup(group.id, ADMIN);
      const updated = groupMessageService.getGroup(group.id)!;
      expect(updated.members.find(m => m.email === ADMIN)).toBeUndefined();
      // First remaining member promoted to admin.
      expect(updated.members[0].role).toBe('admin');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'group_member_left',
        expect.objectContaining({ groupId: group.id, memberEmail: ADMIN, wasAdmin: true })
      );
    });

    it('deletes the group entirely when the last member leaves', async () => {
      const group = await groupMessageService.createGroup('Solo', ADMIN, []);
      await groupMessageService.leaveGroup(group.id, ADMIN);
      expect(groupMessageService.getGroup(group.id)).toBeUndefined();
    });

    it('throws when the group is missing or the email is not a member', async () => {
      await expect(groupMessageService.leaveGroup('nope', ADMIN)).rejects.toThrow('not found');
      const group = await makeGroup([BOB]);
      await expect(groupMessageService.leaveGroup(group.id, 'ghost@x.io')).rejects.toThrow(
        'is not a member'
      );
    });
  });

  describe('deleteGroup', () => {
    it('removes the group and its messages/history and audits', async () => {
      const group = await makeGroup([BOB]);
      await groupMessageService.sendGroupMessage(group.id, ADMIN, 'bye');
      await groupMessageService.deleteGroup(group.id, ADMIN);
      expect(groupMessageService.getGroup(group.id)).toBeUndefined();
      expect(groupMessageService.getGroupMessages(group.id)).toEqual([]);
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'group_deleted',
        expect.objectContaining({ groupId: group.id, groupName: 'Team' })
      );
    });

    it('rejects deletion from a non-admin', async () => {
      const group = await makeGroup([BOB]);
      await expect(groupMessageService.deleteGroup(group.id, BOB)).rejects.toThrow(
        'Only admins can delete groups'
      );
    });
  });

  describe('storage round-trip', () => {
    it('clearAll wipes in-memory state and persisted keys', async () => {
      await makeGroup([BOB]);
      groupMessageService.clearAll();
      expect(groupMessageService.getGroups(ADMIN)).toEqual([]);
      expect(localStorage.getItem('usbvault:groups')).toBeNull();
      expect(localStorage.getItem('usbvault:group_messages')).toBeNull();
      expect(localStorage.getItem('usbvault:group_key_history')).toBeNull();
    });
  });
});
