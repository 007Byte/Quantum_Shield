import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sealToPublicKey } from '@/crypto/bridge';
import { shareService } from '@/services/shareService';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';

/**
 * Emergency contact designated for vault access
 */
export interface EmergencyContact {
  id: string;
  email: string;
  displayName: string;
  publicKeyHex: string;
  encryptedVaultKeyHex: string;
  designatedAt: string;
  status: 'active' | 'revoked';
}

/**
 * Emergency access request with 72-hour waiting period
 */
export interface EmergencyAccessRequest {
  id: string;
  contactId: string;
  contactEmail: string;
  requestedAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'accessed';
  deniedAt?: string;
  accessedAt?: string;
  reason?: string;
}

/**
 * Access history entry for audit trail
 */
export interface AccessHistoryEntry {
  id: string;
  requestId: string;
  contactEmail: string;
  action: 'requested' | 'approved' | 'denied' | 'accessed' | 'expired';
  timestamp: string;
  reason?: string;
}

const CONTACTS_STORAGE_KEY = 'usbvault:emergency_contacts';
const REQUESTS_STORAGE_KEY = 'usbvault:emergency_requests';
const HISTORY_STORAGE_KEY = 'usbvault:emergency_history';
const ACCESS_WAIT_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Generate unique ID for emergency access resources
 */
function generateEmergencyId(): string {
  const random = Math.random().toString(36).substring(2, 15);
  return `emg-${Date.now()}-${random}`;
}

/**
 * Emergency Access Service for managing trusted contacts and vault access requests
 */
class EmergencyAccessServiceImpl {
  /**
   * Designate a new emergency contact
   * Encrypts the vault key to the contact's X25519 public key
   *
   * @param email - Contact email address
   * @param displayName - Contact display name
   * @param vaultKeyHex - Vault encryption key in hex
   * @returns Emergency contact object
   * @throws Error if contact retrieval or encryption fails
   */
  async designateContact(
    email: string,
    displayName: string,
    vaultKeyHex: string
  ): Promise<EmergencyContact> {
    if (!email || !displayName || !vaultKeyHex) {
      throw new Error('Email, display name, and vault key are required');
    }

    try {
      // Get or generate public key for contact via share service
      const kp = await shareService.getOrCreateKeypair();
      shareService.registerPublicKey(email, kp.publicKeyHex);
      const publicKeyHex = shareService.getPublicKey(email) || kp.publicKeyHex;

      if (!publicKeyHex) {
        throw new Error(`Failed to retrieve public key for ${email}`);
      }

      // Seal vault key to contact's public key
      const vaultKeyBytes = new Uint8Array(
        vaultKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );
      const publicKeyBytes = new Uint8Array(
        publicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );
      const encryptedVaultKeyBytes = await sealToPublicKey(publicKeyBytes, vaultKeyBytes);

      if (!encryptedVaultKeyBytes) {
        throw new Error('Failed to encrypt vault key for contact');
      }

      const encryptedVaultKeyHex = Array.from(encryptedVaultKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const contact: EmergencyContact = {
        id: generateEmergencyId(),
        email,
        displayName,
        publicKeyHex: publicKeyHex,
        encryptedVaultKeyHex: encryptedVaultKeyHex,
        designatedAt: new Date().toISOString(),
        status: 'active',
      };

      // Persist contact
      await this._persistContact(contact);

      // Log action
      await auditService.log('emergency_contact_designated', contact.id, {
        email,
        displayName,
      });

      // Sync to backend
      await syncService.enqueue('share', {
        contactId: contact.id,
        email,
        displayName,
        publicKeyHex: contact.publicKeyHex,
      });

      return contact;
    } catch (error) {
      await auditService.log(
        'system',
        'emergency_contact_error',
        { error: String(error) },
        'error'
      );
      throw error;
    }
  }

  /**
   * Remove/revoke an emergency contact
   * Prevents future access requests from this contact
   *
   * @param contactId - ID of contact to revoke
   * @throws Error if contact not found
   */
  async removeContact(contactId: string): Promise<void> {
    if (!contactId) {
      throw new Error('Contact ID is required');
    }

    try {
      const contacts = await this._loadContacts();
      const contact = contacts.find(c => c.id === contactId);

      if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
      }

      // Mark contact as revoked
      contact.status = 'revoked';
      await this._persistContact(contact);

      // Invalidate any pending requests from this contact
      const requests = await this._loadRequests();
      const updatedRequests = requests.map(req => {
        if (req.contactId === contactId && req.status === 'pending') {
          req.status = 'denied';
          req.deniedAt = new Date().toISOString();
        }
        return req;
      });
      await this._persistRequests(updatedRequests);

      // Log action
      await auditService.log('share_revoke', contact.email, {
        contactId,
      });

      // Sync to backend
      await syncService.enqueue('share_revoke', {
        contactId,
      });
    } catch (error) {
      await auditService.log('system', 'remove_contact_failed', { error: String(error) }, 'error');
      throw error;
    }
  }

  /**
   * Get all designated emergency contacts
   *
   * @returns Array of emergency contacts
   */
  async getContacts(): Promise<EmergencyContact[]> {
    try {
      return await this._loadContacts();
    } catch (error) {
      await auditService.log('system', 'get_contacts_failed', { error: String(error) }, 'error');
      return [];
    }
  }

  /**
   * Request emergency access to vault
   * Creates a 72-hour pending request that owner can approve/deny
   *
   * @param contactEmail - Email of the requesting contact
   * @param reason - Optional reason for access request
   * @returns Emergency access request object
   * @throws Error if contact not found or not active
   */
  async requestAccess(contactEmail: string, reason?: string): Promise<EmergencyAccessRequest> {
    if (!contactEmail) {
      throw new Error('Contact email is required');
    }

    try {
      const contacts = await this._loadContacts();
      const contact = contacts.find(c => c.email === contactEmail && c.status === 'active');

      if (!contact) {
        throw new Error(`Active contact not found for ${contactEmail}`);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ACCESS_WAIT_PERIOD_MS);

      const request: EmergencyAccessRequest = {
        id: generateEmergencyId(),
        contactId: contact.id,
        contactEmail,
        requestedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'pending',
        reason,
      };

      // Persist request
      await this._persistRequest(request);

      // Log action
      await auditService.log('system', 'emergency_access_requested', {
        requestId: request.id,
        contactEmail,
        reason,
      });

      // Add history entry
      await this._addHistoryEntry({
        id: generateEmergencyId(),
        requestId: request.id,
        contactEmail,
        action: 'requested',
        timestamp: now.toISOString(),
        reason,
      });

      // Sync to backend
      await syncService.enqueue('share', {
        requestId: request.id,
        contactEmail,
        reason,
      });

      return request;
    } catch (error) {
      await auditService.log('system', 'request_access_failed', { error: String(error) }, 'error');
      throw error;
    }
  }

  /**
   * Owner denies an emergency access request
   * Can only be called during the 72-hour waiting period
   *
   * @param requestId - ID of request to deny
   * @throws Error if request not found or not pending
   */
  async denyAccess(requestId: string): Promise<void> {
    if (!requestId) {
      throw new Error('Request ID is required');
    }

    try {
      const requests = await this._loadRequests();
      const request = requests.find(r => r.id === requestId);

      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      if (request.status !== 'pending') {
        throw new Error(`Cannot deny request with status: ${request.status}`);
      }

      const now = new Date().toISOString();
      request.status = 'denied';
      request.deniedAt = now;

      await this._persistRequest(request);

      // Log action
      await auditService.log('system', 'emergency_access_denied', {
        requestId,
        contactEmail: request.contactEmail,
      });

      // Add history entry
      await this._addHistoryEntry({
        id: generateEmergencyId(),
        requestId,
        contactEmail: request.contactEmail,
        action: 'denied',
        timestamp: now,
      });

      // Sync to backend
      await syncService.enqueue('share', {
        requestId,
      });
    } catch (error) {
      await auditService.log('system', 'deny_access_failed', { error: String(error) }, 'error');
      throw error;
    }
  }

  /**
   * Owner approves an emergency access request
   * Can be called anytime, skips the 72-hour wait
   *
   * @param requestId - ID of request to approve
   * @throws Error if request not found
   */
  async approveAccess(requestId: string): Promise<void> {
    if (!requestId) {
      throw new Error('Request ID is required');
    }

    try {
      const requests = await this._loadRequests();
      const request = requests.find(r => r.id === requestId);

      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      if (request.status === 'denied' || request.status === 'accessed') {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      const now = new Date().toISOString();
      request.status = 'approved';

      await this._persistRequest(request);

      // Log action
      await auditService.log('system', 'emergency_access_approved', {
        requestId,
        contactEmail: request.contactEmail,
      });

      // Add history entry
      await this._addHistoryEntry({
        id: generateEmergencyId(),
        requestId,
        contactEmail: request.contactEmail,
        action: 'approved',
        timestamp: now,
      });

      // Sync to backend
      await syncService.enqueue('share', {
        requestId,
      });
    } catch (error) {
      await auditService.log('system', 'approve_access_failed', { error: String(error) }, 'error');
      throw error;
    }
  }

  /**
   * Check and update access request status
   * Auto-approves if 72 hours have elapsed and request not denied
   *
   * @param requestId - ID of request to check
   * @returns Current request status
   * @throws Error if request not found
   */
  async checkAccessStatus(requestId: string): Promise<EmergencyAccessRequest> {
    if (!requestId) {
      throw new Error('Request ID is required');
    }

    try {
      const requests = await this._loadRequests();
      const request = requests.find(r => r.id === requestId);

      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      const now = new Date();
      const expiresAt = new Date(request.expiresAt);

      // Check if expired
      if (now > expiresAt && request.status === 'pending') {
        request.status = 'expired';
        await this._persistRequest(request);

        await auditService.log('system', 'emergency_access_expired', {
          requestId,
          contactEmail: request.contactEmail,
        });

        await this._addHistoryEntry({
          id: generateEmergencyId(),
          requestId,
          contactEmail: request.contactEmail,
          action: 'expired',
          timestamp: now.toISOString(),
        });
      }

      // Auto-approve if waiting period passed and not denied
      if (now > expiresAt && request.status === 'pending' && !request.deniedAt) {
        request.status = 'approved';
        await this._persistRequest(request);

        await auditService.log('system', 'emergency_access_auto_approved', {
          requestId,
          contactEmail: request.contactEmail,
        });

        await this._addHistoryEntry({
          id: generateEmergencyId(),
          requestId,
          contactEmail: request.contactEmail,
          action: 'approved',
          timestamp: now.toISOString(),
        });
      }

      return request;
    } catch (error) {
      await auditService.log(
        'system',
        'check_access_status_failed',
        { error: String(error) },
        'error'
      );
      throw error;
    }
  }

  /**
   * Get all active access requests (pending or approved)
   *
   * @returns Array of active emergency access requests
   */
  async getActiveRequests(): Promise<EmergencyAccessRequest[]> {
    try {
      const requests = await this._loadRequests();
      const now = new Date();

      // Update expired requests
      const updated = requests.map(req => {
        if (req.status === 'pending' && new Date(req.expiresAt) < now && !req.deniedAt) {
          req.status = 'expired';
        }
        return req;
      });

      // Persist any changes
      if (JSON.stringify(requests) !== JSON.stringify(updated)) {
        await this._persistRequests(updated);
      }

      return updated.filter(r => r.status === 'pending' || r.status === 'approved');
    } catch (error) {
      await auditService.log(
        'system',
        'get_active_requests_failed',
        { error: String(error) },
        'error'
      );
      return [];
    }
  }

  /**
   * Contact retrieves encrypted vault key after approval
   * Marks request as accessed
   *
   * @param requestId - ID of request
   * @param contactEmail - Email of contact requesting access
   * @returns Encrypted vault key hex
   * @throws Error if request not approved or contact not found
   */
  async accessVault(requestId: string, contactEmail: string): Promise<string> {
    if (!requestId || !contactEmail) {
      throw new Error('Request ID and contact email are required');
    }

    try {
      const requests = await this._loadRequests();
      const request = requests.find(r => r.id === requestId);

      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      if (request.status !== 'approved') {
        throw new Error(`Request not approved. Current status: ${request.status}`);
      }

      if (request.contactEmail !== contactEmail) {
        throw new Error('Contact email does not match request');
      }

      const contacts = await this._loadContacts();
      const contact = contacts.find(c => c.id === request.contactId);

      if (!contact || contact.status !== 'active') {
        throw new Error('Contact is not active');
      }

      // Mark request as accessed
      const now = new Date().toISOString();
      request.status = 'accessed';
      request.accessedAt = now;

      await this._persistRequest(request);

      // Log action
      await auditService.log('system', 'emergency_vault_accessed', {
        requestId,
        contactEmail,
      });

      // Add history entry
      await this._addHistoryEntry({
        id: generateEmergencyId(),
        requestId,
        contactEmail,
        action: 'accessed',
        timestamp: now,
      });

      // Sync to backend
      await syncService.enqueue('share', {
        requestId,
        contactEmail,
      });

      return contact.encryptedVaultKeyHex;
    } catch (error) {
      await auditService.log('system', 'access_vault_failed', { error: String(error) }, 'error');
      throw error;
    }
  }

  /**
   * Emergency revoke all contacts and requests
   * Use during security breach or compromised account
   */
  async revokeAllAccess(): Promise<void> {
    try {
      const contacts = await this._loadContacts();
      const requests = await this._loadRequests();
      const now = new Date().toISOString();

      // Revoke all contacts
      contacts.forEach(contact => {
        contact.status = 'revoked';
      });

      // Deny/expire all pending requests
      requests.forEach(request => {
        if (request.status === 'pending' || request.status === 'approved') {
          request.status = 'denied';
          request.deniedAt = now;
        }
      });

      // Persist changes
      await this._persistRequests(requests);
      for (const contact of contacts) {
        await this._persistContact(contact);
      }

      // Log action
      await auditService.log('system', 'emergency_all_access_revoked', {
        contactsCount: contacts.length,
        requestsCount: requests.length,
      });

      // Add history entries for each revoked request
      for (const request of requests) {
        if (request.status === 'denied' && request.deniedAt === now) {
          await this._addHistoryEntry({
            id: generateEmergencyId(),
            requestId: request.id,
            contactEmail: request.contactEmail,
            action: 'denied',
            timestamp: now,
            reason: 'Emergency revocation of all access',
          });
        }
      }

      // Sync to backend
      await syncService.enqueue('share', {
        timestamp: now,
      });
    } catch (error) {
      await auditService.log(
        'system',
        'revoke_all_access_failed',
        { error: String(error) },
        'error'
      );
      throw error;
    }
  }

  /**
   * Get access history audit trail
   * Returns chronological log of all emergency access events
   *
   * @returns Array of access history entries
   */
  async getAccessHistory(): Promise<AccessHistoryEntry[]> {
    try {
      return await this._loadHistory();
    } catch (error) {
      await auditService.log(
        'system',
        'get_access_history_failed',
        { error: String(error) },
        'error'
      );
      return [];
    }
  }

  /**
   * Load contacts from storage
   * @private
   */
  private async _loadContacts(): Promise<EmergencyContact[]> {
    if (Platform.OS === 'web') {
      const data = localStorage.getItem(CONTACTS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    }

    const data = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Persist a single contact to storage
   * @private
   */
  private async _persistContact(contact: EmergencyContact): Promise<void> {
    const contacts = await this._loadContacts();
    const index = contacts.findIndex(c => c.id === contact.id);

    if (index >= 0) {
      contacts[index] = contact;
    } else {
      contacts.push(contact);
    }

    if (Platform.OS === 'web') {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    } else {
      await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    }
  }

  /**
   * Load requests from storage
   * @private
   */
  private async _loadRequests(): Promise<EmergencyAccessRequest[]> {
    if (Platform.OS === 'web') {
      const data = localStorage.getItem(REQUESTS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    }

    const data = await AsyncStorage.getItem(REQUESTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Persist a single request to storage
   * @private
   */
  private async _persistRequest(request: EmergencyAccessRequest): Promise<void> {
    const requests = await this._loadRequests();
    const index = requests.findIndex(r => r.id === request.id);

    if (index >= 0) {
      requests[index] = request;
    } else {
      requests.push(request);
    }

    if (Platform.OS === 'web') {
      localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    } else {
      await AsyncStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    }
  }

  /**
   * Persist multiple requests to storage
   * @private
   */
  private async _persistRequests(requests: EmergencyAccessRequest[]): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    } else {
      await AsyncStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    }
  }

  /**
   * Load history from storage
   * @private
   */
  private async _loadHistory(): Promise<AccessHistoryEntry[]> {
    if (Platform.OS === 'web') {
      const data = localStorage.getItem(HISTORY_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    }

    const data = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Add entry to access history
   * @private
   */
  private async _addHistoryEntry(entry: AccessHistoryEntry): Promise<void> {
    const history = await this._loadHistory();
    history.push(entry);

    if (Platform.OS === 'web') {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } else {
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }
  }
}

/**
 * Singleton instance of emergency access service
 */
export const emergencyAccessService = new EmergencyAccessServiceImpl();
