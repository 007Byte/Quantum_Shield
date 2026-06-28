/**
 * DOC-003: Quantum_Shield — User Manual v2.0
 * Audience: Non-technical end users, customers
 * Tone: Friendly, clear, no jargon
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-003: User Manual...");

  const children = [
    ...H.coverPage({
      title: "User Manual",
      subtitle: "Your Complete Guide to Quantum_Shield",
      docId: "DOC-003", version: "2.0", date: "March 15, 2026",
      classification: "PUBLIC",
      audience: "End Users, Customers",
    }),
    ...H.documentControlPage({ distribution: [["All Users", "Full Access"], ["Support Staff", "Full Access"]] }),
    ...H.toc(),

    // 1
    H.h1("1. Welcome to USBVault"),
    H.p("Quantum_Shield is a portable encrypted file storage system that lets you carry sensitive files on a standard USB drive and access them from any computer. Your files are protected with military-grade encryption, and when you\u2019re done, USBVault removes all traces of your activity automatically."),
    H.p("Think of USBVault as a personal vault you carry in your pocket. Plug it into any computer, enter your password, and your files appear. Unplug, and it\u2019s as if you were never there."),
    H.spacer(80),
    H.h2("1.1 Who Is USBVault For?"),
    H.bullet("Anyone who carries sensitive files and needs them protected at all times"),
    H.bullet("Professionals handling confidential documents (legal, medical, financial)"),
    H.bullet("Travelers who face device inspection at borders"),
    H.bullet("Journalists protecting confidential sources"),
    H.bullet("Anyone who values digital privacy and security"),
    H.spacer(80),
    H.h2("1.2 Our Privacy Promise"),
    H.p("USBVault was engineered to the operational standards demanded by intelligence professionals\u2014and made accessible to everyone. Your files are encrypted on your device before they ever touch the USB drive or the cloud. Nobody at USBVault\u2014not our engineers, not our support team, not anyone\u2014can see your files or know your password. This is called zero-knowledge encryption, and it\u2019s built into every layer of the system."),
    H.importantBox("Zero Knowledge:", "Even if our servers were compromised, your files would remain safe. We literally cannot see them."),
    H.pageBreak(),

    // 2
    H.h1("2. Getting Started"),
    H.h2("2.1 What You Need"),
    H.bullet("A USB drive (8 GB or larger recommended)"),
    H.bullet("A computer running Windows 10+, macOS 12+, or modern Linux"),
    H.bullet("A web browser (Chrome, Firefox, Safari, or Edge \u2014 latest 2 versions)"),
    H.bullet("About 5 minutes for initial setup"),
    H.spacer(80),
    H.h2("2.2 First-Time Setup"),
    H.p("Setting up USBVault is straightforward. Follow these steps to create your first secure vault:"),
    H.numbered("Plug your USB drive into any available port.", "numbers"),
    H.numbered("If you already have USBVault on the drive, double-click the launcher on the TOOLS partition. If this is a blank drive, visit the USBVault web app or run the desktop installer.", "numbers"),
    H.numbered("Create an account (cloud mode) or simply enter a password (USB-only mode).", "numbers"),
    H.numbered("The onboarding wizard will guide you through security options: post-quantum encryption availability, cipher selection, and identity setup.", "numbers"),
    H.numbered("Navigate to the \u201CSetup USB\u201D tab.", "numbers"),
    H.numbered("Select your USB drive from the list. Give your vault a name.", "numbers"),
    H.numbered("Choose a strong master password (at least 15 characters). USBVault will show you a strength meter and suggestions.", "numbers"),
    H.numbered("USBVault creates the secure storage on your drive. This takes about 30 seconds.", "numbers"),
    H.numbered("You\u2019re done! Your vault is ready to use.", "numbers"),
    H.warning("You will be shown a 24-word recovery phrase. Write it down on paper and store it somewhere safe. This is the ONLY way to recover your vault if you forget your password. Do not take a screenshot, do not store it digitally, and do not keep it on the same USB drive."),
    H.pageBreak(),

    // 3
    H.h1("3. Your Master Password"),
    H.p("Your master password is the key to everything in your vault. USBVault uses your password to generate an encryption key through an extremely secure process that would take centuries to crack, even with supercomputers."),
    H.spacer(80),
    H.h2("3.1 Password Requirements"),
    H.bullet("At least 15 characters long"),
    H.bullet("Mix of uppercase, lowercase, numbers, and special characters recommended"),
    H.bullet("Cannot be a commonly-used password (checked against a database of 98,735 known weak passwords)"),
    H.bullet("Cannot appear in known data breaches (checked via Have I Been Pwned)"),
    H.spacer(80),
    H.h2("3.2 Password Tips"),
    H.bullet("Use a passphrase: a series of random words like \u201Ccorrect horse battery staple diamond\u201D"),
    H.bullet("Longer is always better than more complex"),
    H.bullet("Never reuse your vault password for any other service"),
    H.bullet("Never share your password with anyone, including USBVault support staff"),
    H.spacer(80),
    H.h2("3.3 Recovery Phrase"),
    H.p("At vault creation, USBVault generates a 24-word recovery phrase. This phrase is the backup key to your vault. If you forget your password, you can use this phrase to set a new one."),
    H.warning("If you lose both your password AND your recovery phrase, your data is permanently lost. This is a security feature. There is no backdoor and no master key."),
    H.pageBreak(),

    // 4
    H.h1("4. Daily Use"),
    H.h2("4.1 Opening Your Vault"),
    H.numbered("Plug your USB drive into any computer.", "numbers2"),
    H.numbered("Double-click the USBVault launcher on the TOOLS partition (the visible part of your drive).", "numbers2"),
    H.numbered("Your browser opens automatically.", "numbers2"),
    H.numbered("Enter your master password.", "numbers2"),
    H.numbered("If you use a hardware security key (FIDO2), tap it when prompted.", "numbers2"),
    H.numbered("Your vault dashboard appears with all your files.", "numbers2"),
    H.spacer(80),

    H.h2("4.2 Adding Files"),
    H.p("To add a file to your vault:"),
    H.numbered("Click the \u201CAdd File\u201D button on the dashboard.", "numbers3"),
    H.numbered("Select the file from your computer using the file picker.", "numbers3"),
    H.numbered("USBVault encrypts the file immediately. You\u2019ll see a progress indicator for large files.", "numbers3"),
    H.numbered("The encrypted file is stored securely on your USB drive.", "numbers3"),
    H.p("You can add multiple files at once, and there\u2019s no limit to file types. Documents, photos, videos, spreadsheets\u2014everything is encrypted with the same military-grade protection."),
    H.spacer(80),

    H.h2("4.3 Viewing and Downloading Files"),
    H.p("To access a file in your vault:"),
    H.numbered("Click on the file name in your vault dashboard.", "numbers4"),
    H.numbered("USBVault decrypts the file.", "numbers4"),
    H.numbered("Choose to view it in your browser or download it to your computer.", "numbers4"),
    H.note("Files viewed in the browser are temporary. They are not saved to your computer and are cleaned up when you close the vault."),
    H.spacer(80),

    H.h2("4.4 Removing Files"),
    H.p("To remove a file from your vault, select it and click \u201CDelete.\u201D Confirm your choice. The file\u2019s entry is removed from the vault index immediately. For best storage efficiency, periodically use the \u201CCompact Vault\u201D option in Settings, which reclaims space from deleted files."),
    H.spacer(80),

    H.h2("4.5 Safely Ejecting"),
    H.p("When you\u2019re done, always use USBVault\u2019s eject button rather than pulling out the USB drive. The safe eject process:"),
    H.numbered("Cleans up all 23 types of forensic traces that your computer may have created.", "numbers"),
    H.numbered("Unmounts and hides the secure storage partition.", "numbers"),
    H.numbered("Safely ejects the USB drive from the operating system.", "numbers"),
    H.numbered("Shows a reminder to restart your browser for complete trace removal.", "numbers"),
    H.warning("After ejecting, we recommend restarting your browser to clear any session data that might remain in memory. This is optional for casual use but recommended for maximum security."),
    H.pageBreak(),

    // 5
    H.h1("5. Security Features"),
    H.h2("5.1 Hardware Security Key (FIDO2)"),
    H.p("For the highest level of security, you can require a physical hardware key (like a YubiKey) in addition to your password. This means an attacker would need both your password AND your physical key to access your vault."),
    H.p("To set up a hardware key, go to Settings \u2192 Security \u2192 Hardware Key, and follow the enrollment prompts. A recovery backup is automatically created so you can still access your vault if you lose the key."),
    H.spacer(80),

    H.h2("5.2 App Password"),
    H.p("The app password is an optional secondary gate that protects the USBVault application itself. Even before you can attempt to enter your vault password, you must first pass the app password. After 3 wrong attempts, the app locks for 30 seconds."),
    H.spacer(80),

    H.h2("5.3 Auto-Lock and Ghost Mode"),
    H.p("USBVault automatically locks your vault after a configurable period of inactivity. Ghost Mode activates automatically during your session, periodically scanning for and removing forensic artifacts that your computer creates during normal USB usage."),
    H.spacer(80),

    H.h2("5.4 Zero-Trace Cleanup"),
    H.p("When you eject your USB drive, USBVault automatically removes 23 different types of traces that your computer may have created, including recent file lists, thumbnail caches, browser history entries, USB connection records, and more. On Windows, 10 trace types are cleaned at the user level, with 2 additional types available if you run as administrator. On macOS, 6 trace types are cleaned. On Linux, 6 trace types are cleaned."),
    H.spacer(80),

    H.h2("5.5 Self-Destruct Protection"),
    H.p("If someone tries to guess your password, USBVault slows them down exponentially. After 10 wrong attempts, the vault permanently self-destructs\u2014the encryption key is overwritten three times and can never be recovered. This is an intentional security feature that protects your data if the USB drive is stolen."),
    H.p("You will receive warnings at 7, 8, and 9 failed attempts. If you\u2019re struggling with your own password, stop and use your recovery phrase instead."),
    H.pageBreak(),

    // 6
    H.h1("6. Settings"),
    H.makeTable(
      ["Setting", "Where", "What It Does"],
      [
        ["Theme", "Settings \u2192 Appearance", "Light or dark mode"],
        ["Language", "Settings \u2192 Language", "English, Spanish, French, or German"],
        ["Hardware Key", "Settings \u2192 Security", "Add or remove FIDO2 security keys"],
        ["App Password", "Settings \u2192 Security", "Enable/disable the secondary password gate"],
        ["Auto-Lock", "Settings \u2192 Security", "Set inactivity timeout (1\u201360 minutes)"],
        ["Change Password", "Settings \u2192 Account", "Change your vault master password"],
        ["Cloud Sync", "Settings \u2192 Account", "Enable/disable cloud backup and sync"],
        ["Compact Vault", "Settings \u2192 Storage", "Reclaim space from deleted files"],
      ],
      [1800, 2400, 5160]
    ),
    H.caption("Table 6.1 \u2014 Settings Reference"),
    H.pageBreak(),

    // 7
    H.h1("7. Troubleshooting"),
    H.h2("7.1 Wrong Password"),
    H.p("If you see \u201CWrong password,\u201D check your caps lock key and try again carefully. Remember: passwords are case-sensitive. If you continue to have trouble, use your 24-word recovery phrase to set a new password (Settings \u2192 Forgot Password)."),
    H.spacer(60),
    H.h2("7.2 USB Drive Not Detected"),
    H.bullet("Try a different USB port"),
    H.bullet("Check your computer\u2019s disk management tool to verify the drive is recognized"),
    H.bullet("On Linux, you may need to install exfat-fuse if running a kernel older than 5.4"),
    H.spacer(60),
    H.h2("7.3 Vault Not Found"),
    H.p("If USBVault starts but says \u201CNo vault found,\u201D the hidden SECURE partition may need to be mounted. Click \u201CMount Secure\u201D in the app. If the vault file (VAULT.bin) has been deleted, and you have no backup, the data is lost."),
    H.spacer(60),
    H.h2("7.4 Companion Service Won\u2019t Start"),
    H.bullet("Port 3001 may be in use. Close other applications and try again."),
    H.bullet("On macOS, right-click the launcher and select \u201COpen\u201D to bypass Gatekeeper."),
    H.bullet("On Linux, ensure the launcher script has execute permission: chmod +x launcher.sh"),
    H.pageBreak(),

    // 8
    H.h1("8. Recovery"),
    H.h2("8.1 Forgotten Password"),
    H.p("If you\u2019ve forgotten your master password but have your 24-word recovery phrase:"),
    H.numbered("Launch USBVault and click \u201CForgot Password.\u201D", "numbers"),
    H.numbered("Enter all 24 words in the exact order they were given.", "numbers"),
    H.numbered("Choose a new master password (at least 15 characters).", "numbers"),
    H.numbered("A new recovery phrase will be generated. Write it down immediately.", "numbers"),
    H.spacer(80),
    H.h2("8.2 Lost Hardware Key"),
    H.p("If you\u2019ve lost your FIDO2 hardware key, enter your master password as usual and click \u201CLost your key?\u201D when prompted. A backup was created when you enrolled the key. After regaining access, go to Settings \u2192 Security to remove the lost key and enroll a new one."),
    H.spacer(80),
    H.h2("8.3 USB Drive Failure"),
    H.p("If your USB drive is physically damaged and you were using cloud-connected mode, you can restore your vault to a new drive by logging in and selecting \u201CRestore Vault.\u201D If you were using USB-only mode without any backup, the data cannot be recovered."),
    H.pageBreak(),

    // 9
    H.h1("9. Frequently Asked Questions"),
    H.h2("Is my data safe?"),
    H.p("Yes. USBVault uses the same class of encryption used by intelligence agencies. Your files are protected by Argon2id password hashing (64 MB of memory per guess attempt) and XChaCha20-Poly1305 or AES-256-GCM-SIV authenticated encryption. Even with the most powerful supercomputers available today, cracking a properly chosen password would take longer than the age of the universe."),
    H.spacer(60),
    H.h2("What about quantum computers?"),
    H.p("USBVault includes optional post-quantum encryption (ML-KEM-1024) that is designed to resist attacks from future quantum computers. If you enable this option, your data is protected as long as either the classical or quantum-resistant algorithm remains secure. This makes USBVault one of the first consumer products with production-ready quantum resistance."),
    H.spacer(60),
    H.h2("What if I lose the USB drive?"),
    H.p("Your files remain encrypted and are indistinguishable from random noise without your password. After 10 failed password guesses, the vault permanently self-destructs. If you had cloud backup enabled, you can restore to a new drive."),
    H.spacer(60),
    H.h2("Can USBVault support staff see my files?"),
    H.p("No. USBVault uses zero-knowledge encryption. All encryption and decryption happens on your device. Our servers only ever see encrypted data that looks like random noise. We cannot decrypt it, and we cannot see your filenames, file sizes, or any other metadata."),
    H.spacer(60),
    H.h2("Does USBVault work without internet?"),
    H.p("Yes. USBVault was designed to work completely offline. Plug in the USB, double-click the launcher, enter your password. No internet required. Cloud features (sync, sharing, backup) are optional."),

    H.spacer(400),
    H.p([H.italic("Quantum_Shield v2.0 \u2014 Intelligence-Grade Security for Everyone.")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_User_Manual.docx",
    headerTitle: "Quantum_Shield \u2014 User Manual",
    headerClassification: "",
    footerDocId: "DOC-003", footerVersion: "2.0", children, outDir,
  });
}

module.exports = { generate };
