# DOC-003: USBVault Enterprise -- User Manual

| Field | Value |
|-------|-------|
| **Document ID** | DOC-003 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Public |
| **Audience** | End users, customers |

---

## Table of Contents

1. [Welcome to USBVault](#1-welcome-to-usbvault)
2. [Getting Started](#2-getting-started)
3. [Setting Up Your USB Drive](#3-setting-up-your-usb-drive)
4. [Your Master Password](#4-your-master-password)
5. [Daily Use](#5-daily-use)
6. [Adding Files to Your Vault](#6-adding-files-to-your-vault)
7. [Viewing and Decrypting Files](#7-viewing-and-decrypting-files)
8. [Removing Files](#8-removing-files)
9. [Safely Ejecting Your USB](#9-safely-ejecting-your-usb)
10. [Security Features](#10-security-features)
11. [Settings](#11-settings)
12. [Password Manager](#12-password-manager)
13. [Sharing Files Securely](#13-sharing-files-securely)
14. [USB Companion Setup](#14-usb-companion-setup)
15. [Backup and Restore](#15-backup-and-restore)
16. [Account and Security Settings](#16-account-and-security-settings)
17. [Troubleshooting](#17-troubleshooting)
18. [Recovery](#18-recovery)
19. [Frequently Asked Questions](#19-frequently-asked-questions)

---

## 1. Welcome to USBVault

USBVault Enterprise is your portable encrypted file storage system. It lets you carry sensitive files on a USB drive, access them on any computer running Windows, macOS, or Linux, and leave no trace that you were ever there.

### Who Is USBVault For?

USBVault is designed for anyone who needs to protect sensitive files:

- Professionals handling confidential documents
- Journalists protecting sources
- Legal and medical professionals with compliance requirements
- Business travelers crossing borders
- Privacy-conscious individuals
- Teams sharing encrypted files securely

### The Privacy Promise

- Your password never leaves your device
- Your files are encrypted before they leave your hands
- The USBVault server never sees your files, filenames, or encryption keys
- When you eject your USB, forensic cleanup removes traces of your activity

---

## 2. Getting Started

### What You Need

- A USB flash drive (8 GB or larger recommended)
- A computer running Windows, macOS, or Linux
- An internet connection (for initial setup with cloud features; not required for USB-only mode)

### First-Time Setup

1. **Plug in your USB drive** to any available USB port
2. **Open USBVault**: Double-click the launcher on the TOOLS partition of your USB drive, or visit the web application
3. **Create an account**: Enter your email address and choose a strong master password (15 characters minimum)
4. **Complete onboarding**: The setup wizard will guide you through:
   - Post-quantum cryptography detection (automatic)
   - Choosing your encryption method
   - Setting your vault identity (a friendly name for your vault)
   - Confirming your settings
5. **Set up your USB**: Navigate to the "Setup USB" tab and follow the instructions

---

## 3. Setting Up Your USB Drive

### Step-by-Step USB Setup

1. Navigate to the **Setup USB** tab in the app
2. Select your USB drive from the list of detected drives
3. Enter a **vault name** (e.g., "My Secure Files")
4. Enter your **master password** (the same one you used to create your account, or a new one)
5. Click **Provision**
6. The system will:
   - Create two partitions on your USB drive: a visible TOOLS partition and a hidden SECURE partition
   - Write the encrypted vault file (VAULT.bin) to the SECURE partition
   - Hide the SECURE partition automatically
7. Your vault is now ready to use

**Important**: Provisioning erases all existing data on the USB drive. Back up any files before proceeding.

### What Gets Created

| Partition | What You See | What It Contains |
|-----------|-------------|-----------------|
| TOOLS | Visible in file manager | Launcher applications, README, recovery guide |
| SECURE | Hidden (invisible) | Your encrypted vault file |

---

## 4. Your Master Password

Your master password is the key to everything in your vault. Choose it carefully.

### Password Requirements

- **Minimum 15 characters** long
- Use a mix of uppercase letters, lowercase letters, numbers, and symbols
- Avoid dictionary words, names, and common patterns
- Do not reuse passwords from other accounts

### Password Tips

- Think of a memorable passphrase: `"The purple elephant danced on Tuesday at 3pm!"`
- Use a unique password that you do not use anywhere else
- USBVault checks your password against a database of known compromised passwords

### Recovery Phrase

During setup, you will be shown a **24-word recovery phrase**. This is your last resort if you forget your master password.

**You must write this down and store it safely.** It is shown only once. Without it, a forgotten password means permanent loss of access to your vault.

### What Happens If You Enter the Wrong Password

- **First few attempts**: You can try again immediately
- **After multiple failures**: An increasing wait time is enforced (up to 1 hour)
- **After 10 consecutive failures**: Your vault is permanently destroyed (self-destruct). This is a security feature to protect against brute-force attacks

---

## 5. Daily Use

### Opening Your Vault

1. **Plug in your USB drive**
2. **Double-click the launcher** from the TOOLS partition (or open the web app)
3. **Enter your master password**
4. If you have a hardware security key (FIDO2), tap it when prompted
5. Your dashboard appears with all your encrypted files

### The Dashboard

The dashboard is your home screen. From here you can:

- See all files in your vault
- Check your vault's security status
- Access quick actions (add file, encrypt, decrypt)
- View storage usage
- Navigate to other features using the sidebar

---

## 6. Adding Files to Your Vault

### Encrypting and Storing a File

1. Click **Add File** or navigate to the **Encrypt** tab
2. Select a file from your computer using the file picker
3. Choose your encryption method (XChaCha20-Poly1305 is recommended)
4. Click **Encrypt & Store**
5. The file is encrypted and added to your vault

Behind the scenes, USBVault:
- Splits your file into small chunks
- Encrypts each chunk individually with a unique key
- Stores the encrypted data in your vault
- Updates the vault index with an atomic commit (crash-safe)

### Supported Files

You can encrypt any type of file: documents, images, videos, spreadsheets, PDFs, archives, and more. There is no file type restriction.

### Storage Limits

Your available storage depends on your subscription tier:

| Tier | Storage Limit |
|------|--------------|
| Free | 100 MB |
| Individual | 10 GB |
| Team | 100 GB |
| Enterprise | 1 TB |

---

## 7. Viewing and Decrypting Files

### Decrypting a File

1. Select the file you want to view from your vault file list
2. Click **Decrypt** or double-click the file
3. Choose one of two options:
   - **Download**: Save the decrypted file to your computer
   - **Temporary View**: View the file in the app (it will be automatically cleaned up)

### Temporary View

When you use temporary view, the decrypted file is shown within the app and is not saved to your computer's file system. This is the most secure way to view files, especially on shared or untrusted computers.

---

## 8. Removing Files

### Deleting a File from Your Vault

1. Select the file you want to remove
2. Click **Remove** and confirm
3. The file reference is removed from the vault index

### Vault Compaction

When you remove files, the encrypted data remains in the vault file until you run compaction. Compaction rewrites the vault file, keeping only active records and reclaiming space.

To compact your vault:
1. Navigate to **Manage Vaults** or **Storage**
2. Click **Compact Vault**
3. Wait for the process to complete

---

## 9. Safely Ejecting Your USB

Always eject your USB drive properly to ensure data integrity and privacy.

### How to Eject

1. Click the **Eject** button in the app
2. USBVault will automatically:
   - Run zero-trace cleanup (removes 23 types of forensic artifacts)
   - Unmount the hidden SECURE partition
   - Safely eject the USB drive
3. A **restart advisory** is displayed -- for maximum privacy, consider restarting the computer
4. Remove your USB drive

### What Gets Cleaned

USBVault removes traces of your activity including:
- Recent file history
- Thumbnail caches
- USB connection metadata
- Session files and temporary data
- Platform-specific artifacts (Jump Lists on Windows, .DS_Store on macOS, recently-used.xbel on Linux)

---

## 10. Security Features

### FIDO2 Hardware Key

Add a hardware security key (such as a YubiKey) for two-factor authentication. Even if someone knows your password, they cannot access your vault without the physical key.

To set up:
1. Go to **Settings** > **Security**
2. Click **Register Hardware Key**
3. Follow the on-screen instructions to tap your key

### App Password

Set a secondary password to protect the app itself, adding an additional layer of security before you even reach the vault password screen.

### Auto-Lock

Configure the app to automatically lock after a period of inactivity. Options range from 1 minute to 1 hour.

### Ghost Mode

When enabled, Ghost Mode activates additional privacy protections:
- Screenshots are blocked
- Clipboard is automatically cleared
- Screen recording is prevented

### Zero-Trace

Zero-trace cleanup runs automatically when you eject your USB drive. It removes forensic artifacts across all supported platforms (Windows, macOS, Linux).

---

## 11. Settings

### Theme

Switch between light and dark modes in **Settings** > **Theme**.

### Language

USBVault supports multiple languages: English, Spanish, French, and German. Change your language in **Settings** > **Language**.

### Security Settings

- **Master password change**: Change your vault password (does not require re-encrypting your files)
- **FIDO2 key management**: Add, remove, or list hardware keys
- **Auto-lock timeout**: Configure inactivity timeout
- **Biometric unlock**: Enable Face ID or fingerprint unlock on supported devices

### Account Settings

- **Subscription management**: View and manage your subscription tier
- **Account deletion**: Permanently delete your account and all server-side data

### Notification Settings

- **Push notifications**: Enable or disable security alerts
- **Email notifications**: Configure email alert preferences

---

## 12. Password Manager

USBVault includes a built-in password manager that stores your passwords encrypted alongside your files.

### Storing Passwords

1. Navigate to the **Passwords** tab
2. Click **Add Password**
3. Enter the website, username, and password
4. Click **Save**

All passwords are encrypted with the same strong encryption used for your files.

### Importing Passwords

You can import passwords from a CSV file:
1. Navigate to **Passwords** > **Import**
2. Select your CSV file
3. Map the columns to the correct fields
4. Click **Import**

### Searching Passwords

Use the search bar at the top of the Passwords tab to quickly find stored credentials by website name or username.

---

## 13. Sharing Files Securely

### How Sharing Works

USBVault uses end-to-end encryption for file sharing. When you share a file:
1. The file is encrypted with the recipient's public key
2. Only the recipient can decrypt it with their private key
3. The server never sees the file contents

### Sharing a File

1. Select the file you want to share
2. Click **Share**
3. Enter the recipient's email address
4. The encrypted file is sent to the recipient
5. They will see it in their **Received Shares** section

### Accepting a Share

1. Navigate to **Shares** > **Received**
2. Click **Accept** on the shared file
3. The file is decrypted with your private key and added to your vault

### Revoking a Share

You can revoke access to shared files at any time:
1. Navigate to **Shares** > **Sent**
2. Click **Revoke** on the share you want to remove

---

## 14. USB Companion Setup

The USB companion service is a small program that runs on your computer to bridge the app and your USB drive. It is included on the TOOLS partition.

### How It Works

- The companion runs locally on your computer (never sends data to the internet)
- It communicates only with the USBVault app on your screen
- It handles reading from and writing to the USB drive

### Starting the Companion

On most setups, the companion starts automatically when you double-click the launcher. If it does not start:

1. Open a terminal or command prompt
2. Navigate to the TOOLS partition on your USB drive
3. Run the launcher script for your platform:
   - **macOS**: `./launch-mac.sh`
   - **Windows**: `launch-win.bat`
   - **Linux**: `./launch-linux.sh`

### Requirements

- Node.js (bundled on the TOOLS partition for portability)
- Port 3001 must be available on your computer

---

## 15. Backup and Restore

### Cloud Backup (Cloud-Connected Mode)

If you are using USBVault in cloud-connected mode, your encrypted files are automatically synced to the cloud. This provides a backup in case your USB drive is lost or damaged.

### Restoring from Backup

1. Navigate to the **Restore** tab
2. Sign in to your account
3. Select the backup you want to restore
4. Your vault will be rebuilt from the cloud backup

### Manual Backup

For USB-only mode, consider making regular copies of your USB drive's VAULT.bin file. Store copies in a secure location.

### Recovery Phrase Backup

Your 24-word recovery phrase is your ultimate backup. Store it:
- Written on paper (not digitally)
- In a secure location (safe, safety deposit box)
- Separate from your USB drive
- Consider giving a copy to a trusted person

---

## 16. Account and Security Settings

### Changing Your Password

1. Go to **Settings** > **Security** > **Change Password**
2. Enter your current password
3. Enter your new password (15 characters minimum)
4. Confirm the new password
5. Click **Save**

Your files do not need to be re-encrypted when you change your password. Only the master key wrapper is updated, which takes less than a second.

### Biometric Authentication

On supported devices (iPhone with Face ID, Android with fingerprint):
1. Go to **Settings** > **Security** > **Biometric Unlock**
2. Toggle the switch to enable
3. Authenticate with your biometric to confirm

### Deleting Your Account

1. Go to **Settings** > **Account** > **Delete Account**
2. Confirm by entering your password
3. All server-side data will be permanently deleted
4. Your local vault files on USB will not be affected

---

## 17. Troubleshooting

### Wrong Password

- Double-check caps lock and keyboard language
- Remember that passwords are case-sensitive
- After multiple wrong attempts, you must wait before trying again
- If you have completely forgotten your password, use your recovery phrase (see Section 18)

### USB Drive Not Detected

- Ensure the USB drive is fully inserted
- Try a different USB port
- Check that the companion service is running (port 3001)
- On macOS: check System Report > USB for the drive
- On Linux: run `lsblk` to verify the drive appears
- On Windows: check Disk Management

### Vault Not Found

- The SECURE partition may need to be mounted manually
- Try navigating to **Find Vault** in the app
- Verify that VAULT.bin exists on the SECURE partition

### Companion Service Will Not Start

- Check that port 3001 is not in use by another application
- Verify that Node.js is available (bundled on TOOLS partition)
- On macOS/Linux: ensure the launch script has execute permissions (`chmod +x launch-*.sh`)
- Try running the companion manually from a terminal to see error messages

### Decryption Fails

- Ensure you are using the correct password
- The file may be corrupted; try the backup index slot (automatic fallback)
- Check that you have enough memory available (encryption requires about 64 MB)

---

## 18. Recovery

### Using Your Recovery Phrase

If you have forgotten your master password:
1. Open USBVault and navigate to the recovery option
2. Enter your 24-word recovery phrase
3. You will be prompted to set a new master password
4. Your vault will be re-keyed with the new password

**Important**: If you do not have your recovery phrase and have forgotten your password, your vault data cannot be recovered. This is a fundamental security feature, not a limitation.

### Lost Hardware Key

If you have lost your FIDO2 hardware key:
1. The vault header contains an encrypted recovery blob
2. Use your master password to access the vault without the hardware key (if recovery was enabled)
3. Register a new hardware key in Settings

### Corrupted Vault

USBVault maintains two copies of the vault index. If one becomes corrupted:
1. The app automatically tries the backup index slot
2. If both are corrupted, data records still exist but the file listing is lost
3. Contact support for advanced recovery options

### Self-Destruct Triggered

If the self-destruct mechanism was triggered (10 wrong password attempts):
- The vault is permanently destroyed by design
- The only recovery option is restoring from a cloud backup or a manual backup copy
- This feature exists to protect you from brute-force attacks

---

## 19. Frequently Asked Questions

### Is my data safe?

Yes. USBVault uses the same types of encryption algorithms used by governments and military organizations. Your files are encrypted with XChaCha20-Poly1305 (or AES-256-GCM-SIV), and your password is protected by Argon2id, a memory-hard key derivation function that resists brute-force attacks even with specialized hardware.

### Can USBVault be hacked?

USBVault is designed with 12 layers of security. While no system can guarantee absolute security, USBVault employs defense-in-depth so that compromising one layer does not expose your data. The encryption is mathematically proven to be secure, and the system self-destructs after 10 failed password attempts.

### What if I lose the USB drive?

Without your password, anyone who finds your USB drive cannot access your files. The encrypted data is indistinguishable from random noise. If you were using cloud-connected mode, you can restore your files to a new USB drive from your cloud backup.

### What about quantum computers?

USBVault includes post-quantum cryptography (ML-KEM-1024) combined with traditional X25519 key exchange. This hybrid approach means your data is protected even if quantum computers eventually break traditional encryption. The system remains secure as long as either algorithm remains unbroken.

### Can USBVault see my files?

No. USBVault uses a zero-knowledge architecture. Your files are encrypted on your device before they are stored anywhere. The USBVault server never sees your files, filenames, or encryption keys.

### What happens if USBVault as a company disappears?

Your vault files on USB are self-contained. They can be decrypted using only your password and the Rust crypto library. The encryption format is fully documented (see DOC-001: Technical Specification). No server connection is required for USB-only mode.

### How do I use USBVault on multiple devices?

Enable cloud sync in your settings. Your encrypted vault will synchronize across all devices where you are signed in. Changes are propagated in real-time via an encrypted WebSocket connection.

### Can I share files with people who do not use USBVault?

Currently, file sharing requires both parties to have USBVault accounts. This ensures end-to-end encryption is maintained. You can always decrypt a file and share it through other means, but the end-to-end encryption guarantee only applies within USBVault.

---

## Cross-References

- **DOC-001**: Technical Specification (for engineers who want to understand the encryption details)
- **DOC-004**: IT Deployment Guide (for IT administrators deploying USBVault in an organization)
- **DOC-007**: Recovery Procedures (detailed recovery instructions for all scenarios)
