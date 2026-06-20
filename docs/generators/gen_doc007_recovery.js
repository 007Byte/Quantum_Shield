/**
 * DOC-007: USBVault Enterprise — Recovery Procedures v2.0
 * Audience: End Users, IT Support Staff
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-007: Recovery Procedures...");

  const children = [
    ...H.coverPage({
      title: "Recovery Procedures",
      subtitle: "Fortress Enterprise \u2014 Emergency Recovery & Troubleshooting Guide",
      docId: "DOC-007", version: "2.0", date: "March 15, 2026",
      classification: "INTERNAL",
      audience: "End Users, IT Support Staff",
    }),
    ...H.documentControlPage({
      distribution: [
        ["All Users", "Full Access"],
        ["IT Support", "Full Access"],
        ["Help Desk", "Full Access"],
      ],
    }),
    ...H.toc(),

    // Preface
    H.h1("Important: Read Before You Need It"),
    H.p("This document covers every recovery scenario for USBVault Enterprise. We strongly recommend reading it once when you first set up USBVault\u2014not when you\u2019re in the middle of an emergency. Understanding your recovery options in advance can save you from permanent data loss."),
    H.warning("USBVault uses zero-knowledge encryption. This means nobody\u2014not USBVault support, not your IT department, not anyone\u2014can recover your data without your password or recovery phrase. This is a security feature, not a limitation. Plan accordingly."),
    H.pageBreak(),

    // 1
    H.h1("1. Recovery Phrase"),
    H.p("Your 24-word BIP39 recovery phrase is the single most important backup for your vault. It is generated once at vault creation, displayed on screen, and never stored anywhere in the system. If you did not write it down at that time, you do not have it."),
    H.spacer(80),

    H.h2("1.1 What It Is"),
    H.p("The recovery phrase is a set of 24 English words (from the BIP39 standard dictionary of 2,048 words) that encodes enough entropy to reconstruct your vault\u2019s encryption key. It serves as a human-readable backup of the cryptographic material needed to access your vault."),
    H.spacer(80),

    H.h2("1.2 Storage Recommendations"),
    H.bullet("Write it on paper (pen, not pencil)"),
    H.bullet("Store in a secure location: home safe, locked drawer, or safety deposit box"),
    H.bullet("Consider keeping copies in two separate secure physical locations"),
    H.bullet("Do NOT store digitally (not on your computer, phone, email, cloud, or in a password manager)"),
    H.bullet("Do NOT photograph it (photos auto-sync to cloud services)"),
    H.bullet("Do NOT store it on the same USB drive as your vault"),
    H.bullet("Do NOT share it with anyone, including USBVault support staff"),
    H.spacer(80),

    H.h2("1.3 If You\u2019ve Lost Your Recovery Phrase"),
    H.p("If you still know your vault password, you can continue using your vault normally. However, you no longer have a safety net if you forget your password. We recommend:"),
    H.numbered("Open your vault with your current password.", "numbers"),
    H.numbered("Export all important files to a secure location.", "numbers"),
    H.numbered("Create a new vault with a new password.", "numbers"),
    H.numbered("Write down the new recovery phrase immediately.", "numbers"),
    H.numbered("Import your files into the new vault.", "numbers"),
    H.importantBox("No Recovery Possible:", "If you lose both your password AND your recovery phrase, your data is permanently and irrecoverably lost. There is no backdoor, no master key, and no way for anyone to help you. This is a fundamental security property of USBVault\u2019s zero-knowledge design."),
    H.pageBreak(),

    // 2
    H.h1("2. Forgotten Master Password"),
    H.h2("2.1 With Recovery Phrase"),
    H.p("If you have your 24-word recovery phrase, you can set a new password:"),
    H.numbered("Launch USBVault and click \u201CForgot Password\u201D on the login screen.", "numbers"),
    H.numbered("Enter all 24 words in the exact order they were given to you. Spelling must be exact. Words are case-insensitive.", "numbers"),
    H.numbered("Choose a new master password (minimum 15 characters). The strength meter will help you choose a strong one.", "numbers"),
    H.numbered("The vault is re-keyed: a new KEK wraps the existing MEK. This is nearly instant (O(1) operation) because your actual file data is not re-encrypted\u2014only the key wrapper changes.", "numbers"),
    H.numbered("A NEW recovery phrase is generated. Write it down immediately. Your old recovery phrase is no longer valid.", "numbers"),
    H.warning("After password reset, your old recovery phrase is permanently invalid. You must write down the new one. Failure to do so means you will have no recovery option if you forget the new password."),
    H.spacer(80),

    H.h2("2.2 Without Recovery Phrase"),
    H.p("If you have neither your password nor your recovery phrase, your vault data cannot be recovered. This is by design. Your options:"),
    H.bullet("Create a new vault with a new password"),
    H.bullet("If you were using cloud-connected mode, your encrypted data still exists on our servers, but it cannot be decrypted without the original password or recovery phrase"),
    H.bullet("Contact IT support if your organization maintains any separate backup policies"),
    H.pageBreak(),

    // 3
    H.h1("3. Lost FIDO2 Hardware Key"),
    H.p("If you enrolled a FIDO2 hardware security key (like a YubiKey) and have lost or damaged it, you can still access your vault using the recovery backup that was automatically created during enrollment."),
    H.spacer(80),

    H.h2("3.1 Recovery Steps"),
    H.numbered("Enter your master password as usual on the login screen.", "numbers2"),
    H.numbered("When prompted to tap your hardware key, click \u201CLost your key?\u201D instead.", "numbers2"),
    H.numbered("The system will use the recovery blob (an AES-GCM-SIV encrypted backup) stored in the vault header to bypass the hardware key requirement.", "numbers2"),
    H.numbered("You will be logged into your vault.", "numbers2"),
    H.numbered("Immediately go to Settings \u2192 Security \u2192 Hardware Keys.", "numbers2"),
    H.numbered("Remove the lost key from the registered keys list.", "numbers2"),
    H.numbered("Enroll a new hardware key if you have a replacement.", "numbers2"),
    H.spacer(80),

    H.h2("3.2 If You\u2019ve Also Forgotten Your Password"),
    H.p("If you\u2019ve lost your hardware key AND forgotten your password, use your recovery phrase first (Section 2.1) to reset your password, then follow the steps above to manage the lost key."),
    H.pageBreak(),

    // 4
    H.h1("4. Corrupted Vault"),

    H.h2("4.1 Automatic Recovery (Dual-Index Fallback)"),
    H.p("USBVault maintains two independent copies of the file index at all times. If the active index is corrupted (for example, due to an interrupted write from a sudden USB removal), the system automatically falls back to the backup index."),
    H.numbered("Launch USBVault and enter your password normally.", "numbers"),
    H.numbered("The system detects corruption in the active index.", "numbers"),
    H.numbered("It automatically switches to the backup index.", "numbers"),
    H.numbered("You may lose only the single most recent operation (the one that was interrupted). All prior data remains intact.", "numbers"),
    H.note("You will see a notification that index recovery was used. This is informational\u2014your vault is working correctly."),
    H.spacer(80),

    H.h2("4.2 Both Indexes Corrupted"),
    H.p("This scenario is extremely unlikely because it requires two consecutive interrupted writes to the exact same vault. If it does occur:"),
    H.bullet("The vault will display a BAD_INDEX error and refuse to open"),
    H.bullet("Contact USBVault support for index reconstruction assistance"),
    H.bullet("If you have cloud backup enabled, restore the vault from the cloud (Section 5)"),
    H.spacer(80),

    H.h2("4.3 Rollback Detection (ROLLBACK_DETECTED)"),
    H.p("USBVault uses a monotonically increasing commit counter to detect rollback attacks\u2014where someone replaces the current VAULT.bin with an older copy. If the commit counter in the header is lower than expected, the vault refuses to open with ROLLBACK_DETECTED."),
    H.p("This can be a false positive if you restored an older backup of VAULT.bin (for example, from an older cloud snapshot). In this case, contact support. True rollback attacks (where an adversary tries to restore a pre-self-destruct copy of the vault) are correctly blocked."),
    H.pageBreak(),

    // 5
    H.h1("5. USB Drive Failure"),

    H.h2("5.1 Cloud-Connected Mode (Backup Available)"),
    H.p("If your USB drive is physically damaged but you were using cloud-connected mode:"),
    H.numbered("Obtain a new USB drive (8 GB or larger).", "numbers3"),
    H.numbered("Log into the USBVault web app with your cloud credentials.", "numbers3"),
    H.numbered("Select \u201CRestore Vault\u201D from the dashboard.", "numbers3"),
    H.numbered("Choose the new USB drive as the restoration target.", "numbers3"),
    H.numbered("Encrypted data is downloaded from S3 and written to a new SECURE partition.", "numbers3"),
    H.numbered("Enter your vault password to verify the restored vault works correctly.", "numbers3"),
    H.spacer(80),

    H.h2("5.2 USB-Only Mode (No Backup)"),
    H.p("If your USB drive fails and you were operating in USB-only mode without any external backups, your data is permanently lost. The encryption keys existed only on the USB drive and in your running session."),
    H.importantBox("Prevention:", "If data loss from drive failure is unacceptable, use cloud-connected mode (which provides automatic encrypted backups) or manually back up the VAULT.bin file to a separate secure storage location."),
    H.pageBreak(),

    // 6
    H.h1("6. Self-Destruct Triggered"),
    H.p("After 10 consecutive wrong password attempts, USBVault permanently destroys the vault\u2019s Master Encryption Key (MEK) using a three-pass overwrite: random bytes, then zeros, then random bytes again, with fsync after each pass. This is permanent and intentional\u2014it prevents an attacker who has stolen your USB drive from eventually guessing your password."),
    H.spacer(80),

    H.h2("6.1 Recovery Options"),
    H.makeTable(
      ["Scenario", "Recovery Possible?", "Steps"],
      [
        ["Cloud backup available", "Yes", "Restore from S3; wrapped_mek in backup predates destruction"],
        ["Manual VAULT.bin backup exists", "Yes", "Restore backed-up VAULT.bin with intact wrapped_mek"],
        ["No backup of any kind", "No", "Data is permanently and irrecoverably lost (by design)"],
      ],
      [2600, 1800, 4960]
    ),
    H.caption("Table 6.1 \u2014 Self-Destruct Recovery Options"),
    H.spacer(60),
    H.p("If you restore from backup, the restored vault will have the pre-destruction fail counter. You will need your original password to unlock it."),
    H.warning("Self-destruct is a security feature. If the vault self-destructed because an unauthorized person was guessing passwords, the system worked exactly as intended. Do not consider this a malfunction."),
    H.pageBreak(),

    // 7
    H.h1("7. Wrong Password Lockout"),
    H.p("USBVault enforces exponentially increasing delays between password attempts to frustrate brute-force attacks. The delays are enforced in the application and backed by an HMAC-protected counter stored on the USB drive."),
    H.spacer(80),

    H.h2("7.1 Backoff Schedule"),
    H.makeTable(
      ["Attempt", "Wait Time", "Cumulative", "Recommendation"],
      [
        ["1", "2 seconds", "2 seconds", ""],
        ["2", "4 seconds", "6 seconds", ""],
        ["3", "8 seconds", "14 seconds", ""],
        ["4", "16 seconds", "30 seconds", "Double-check caps lock and keyboard layout"],
        ["5", "32 seconds", "~1 minute", ""],
        ["6", "64 seconds", "~2 minutes", ""],
        ["7", "128 seconds", "~4 minutes", "STOP. Consider using recovery phrase."],
        ["8", "256 seconds", "~8.5 minutes", "STRONGLY recommended: use recovery phrase."],
        ["9", "512 seconds", "~17 minutes", "FINAL WARNING: next attempt triggers self-destruct."],
        ["10", "SELF-DESTRUCT", "\u2014", "Vault destroyed. See Section 6."],
      ],
      [1200, 1400, 1400, 5360]
    ),
    H.caption("Table 7.1 \u2014 Exponential Backoff Schedule"),
    H.spacer(60),
    H.importantBox("Important:", "The fail counter is stored on the USB drive with HMAC protection. Switching computers, browsers, or USB ports does NOT reset it. The counter can only be reset by a successful password entry."),
    H.pageBreak(),

    // 8
    H.h1("8. Vault Not Detected"),
    H.p("If USBVault starts but cannot find your vault, follow these diagnostic steps:"),
    H.numbered("Verify the USB drive is physically connected (check indicator light if present).", "numbers4"),
    H.numbered("Open your OS disk management tool and verify the drive appears (Disk Utility on macOS, Disk Management on Windows, lsblk on Linux).", "numbers4"),
    H.numbered("Check that the TOOLS partition is visible as a normal drive labeled USBVAULT.", "numbers4"),
    H.numbered("Verify the SECURE partition exists using disk management (it should appear as an unlabeled partition).", "numbers4"),
    H.numbered("In USBVault, try the \u201CMount Secure\u201D function to manually mount the hidden partition.", "numbers4"),
    H.numbered("Verify VAULT.bin exists at the root of the SECURE partition.", "numbers4"),
    H.p("If the SECURE partition does not exist, the drive may have been reformatted. If VAULT.bin does not exist, the vault data has been deleted. In both cases, restore from backup if available."),
    H.pageBreak(),

    // 9
    H.h1("9. Companion Service Issues"),
    H.h2("9.1 Port 3001 In Use"),
    H.p("The companion service requires port 3001 on your local machine. If another application is using this port:"),
    H.bullet("Windows: Open Task Manager \u2192 Details tab \u2192 find Node.js processes \u2192 End Task"),
    H.bullet("macOS / Linux: Run lsof -i :3001 in Terminal to identify the process, then kill [PID]"),
    H.spacer(80),

    H.h2("9.2 Permission Issues"),
    H.bullet("macOS Gatekeeper: right-click the launcher \u2192 select \u201COpen\u201D to bypass the first-launch security prompt"),
    H.bullet("Linux: ensure the launcher has execute permission: chmod +x launcher.sh"),
    H.bullet("Windows: if blocked by SmartScreen, click \u201CMore info\u201D \u2192 \u201CRun anyway\u201D"),
    H.spacer(80),

    H.h2("9.3 Firewall / Antivirus"),
    H.bullet("Whitelist 127.0.0.1:3001 in your firewall (the companion only uses localhost)"),
    H.bullet("Whitelist the USBVault TOOLS partition in your antivirus software"),
    H.bullet("The companion does not make any outgoing network connections"),
    H.pageBreak(),

    // 10
    H.h1("10. Cross-Platform Compatibility"),
    H.p("USBVault vaults are fully cross-platform. A vault created on Windows can be opened on macOS or Linux, and vice versa. The vault format uses platform-independent binary encoding, UTF-8 filenames, and ExFAT filesystems (supported natively by all modern operating systems)."),
    H.spacer(80),

    H.h2("10.1 Potential Issues"),
    H.makeTable(
      ["Issue", "Platform", "Solution"],
      [
        ["ExFAT not supported", "Older Linux (kernel < 5.4)", "Install exfat-fuse: sudo apt install exfat-fuse"],
        [".DS_Store / .Trashes on TOOLS", "macOS", "Harmless metadata files; ignored by USBVault"],
        ["Hidden attributes not recognized", "Cross-platform", "Cosmetic only; vault data is encrypted regardless"],
        ["Drive letter not assigned", "Windows", "Use Disk Management to assign a drive letter"],
        ["USB permission denied", "Linux", "Add user to plugdev group or configure udev rules"],
      ],
      [2600, 2000, 4760]
    ),
    H.caption("Table 10.1 \u2014 Cross-Platform Compatibility Issues"),

    H.spacer(200),
    H.warning("NEVER share your password or recovery phrase with support staff. USBVault will never ask for them. Anyone requesting these credentials is attempting unauthorized access."),

    H.spacer(400),
    H.p([H.italic("Keep this document accessible separately from your vault. USBVault Enterprise v2.0 \u2014 March 15, 2026.")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_Recovery_Procedures.docx",
    headerTitle: "USBVault Enterprise \u2014 Recovery Procedures",
    headerClassification: "INTERNAL",
    footerDocId: "DOC-007", footerVersion: "2.0", children, outDir,
  });
}

module.exports = { generate };
