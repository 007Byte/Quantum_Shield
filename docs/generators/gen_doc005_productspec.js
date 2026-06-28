/**
 * DOC-005: Quantum_Shield — Product Specification v2.0
 * Audience: Product Managers, Stakeholders, Sales Engineers, Investors
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-005: Product Specification...");

  const children = [
    ...H.coverPage({
      title: "Product Specification",
      subtitle: "Fortress Enterprise \u2014 Market Position & Feature Reference",
      docId: "DOC-005", version: "2.0", date: "March 15, 2026",
      classification: "CONFIDENTIAL",
      audience: "Product Managers, Stakeholders, Sales Engineers, Investors",
    }),
    ...H.documentControlPage({
      distribution: [
        ["Product Management", "Full Access"],
        ["Executive Leadership", "Full Access"],
        ["Sales Engineering", "Full Access"],
        ["Investors (under NDA)", "Read Only"],
      ],
    }),
    ...H.toc(),

    // 1
    H.h1("1. Product Vision & Mission"),
    H.p([H.bold("Mission: "), H.run("Carry sensitive files in your pocket, plug into any computer running Windows, macOS, or Linux, access your files with a password, and walk away leaving zero evidence you were ever there.")]),
    H.p([H.bold("Promise: "), H.run("USBVault was engineered to the operational standards demanded by intelligence professionals\u2014and made accessible to everyone who needs that level of protection.")]),
    H.spacer(80),

    H.h2("1.1 Guiding Principles"),
    H.makeStatusTable(
      ["Principle", "Description", "Status"],
      [
        ["PORTABLE", "No installation. Runs from USB via double-click launcher. Portable Node.js bundled on TOOLS partition.", "Delivered"],
        ["SECURE", "Argon2id (64 MiB) + XChaCha20-Poly1305 / AES-256-GCM-SIV. Rust crypto core with constant-time comparisons.", "Delivered"],
        ["INVISIBLE", "SECURE partition unmounted and hidden. chflags hidden (macOS), attrib +H+S (Windows). Encrypted filenames.", "Delivered"],
        ["RESILIENT", "Dual-index atomic commits. Monotonic commit counter. Append-only VAULT.bin. State version rollback protection.", "Delivered"],
        ["SIMPLE", "Double-click launcher \u2192 browser opens \u2192 password \u2192 done. No technical knowledge required.", "Delivered"],
        ["ZERO TRACE", "23 forensic artifact cleaners across 3 platforms. Auto-clean on eject. Restart advisory displayed.", "Delivered"],
        ["ZERO TRUST", "Wrapped MEK architecture (password \u2192 KEK \u2192 MEK). Cloud split-key planned for V3.0.", "Partial"],
        ["PQC COMPLIANT", "ML-KEM-1024 + X25519 hybrid sealed boxes. Feature-gated in Rust. Quantum-resistant key exchange.", "Delivered"],
      ],
      [1400, 5760, 2200],
      2
    ),
    H.caption("Table 1.1 \u2014 Guiding Principles and Delivery Status"),
    H.pageBreak(),

    // 2
    H.h1("2. Target Market"),
    H.p("Quantum_Shield addresses seven distinct market segments, each with specific security and operational requirements:"),
    H.makeTableBoldFirst(
      ["Segment", "Key Need", "Differentiating Feature"],
      [
        ["Intelligence operatives", "Zero trace, hardware key, self-destruct", "23 forensic cleaners; FIDO2; 10-attempt self-destruct"],
        ["Government & defense", "FIPS compliance, hidden partition", "AES-256-GCM-SIV (FIPS); hidden SECURE partition"],
        ["Journalists", "Invisibility, plausible deniability", "Hidden partition invisible to OS; no installation required"],
        ["Legal professionals", "Encryption, compliance, easy access", "Zero-knowledge; HIPAA/SOC2-ready; simple UI"],
        ["Medical professionals", "Strong encryption, audit trail", "HIPAA-grade encryption; audit logging in cloud mode"],
        ["Corporate executives", "Enterprise mgmt, sharing, sync", "Team/Enterprise tiers; vault sharing; multi-device sync"],
        ["Privacy-conscious citizens", "Ease of use, no cloud required", "USB-only mode; zero installation; free tier available"],
      ],
      [2000, 2800, 4560]
    ),
    H.caption("Table 2.1 \u2014 Target Market Segments"),
    H.pageBreak(),

    // 3
    H.h1("3. Feature Matrix by Tier"),
    H.makeStatusTable(
      ["Feature", "Free", "Individual", "Team", "Enterprise"],
      [
        ["Vaults", "1", "5", "50", "Unlimited"],
        ["Storage", "100 MB", "10 GB", "100 GB", "1 TB"],
        ["AES-256-GCM (baseline)", "Yes", "Yes", "Yes", "Yes"],
        ["XChaCha20-Poly1305", "\u2014", "Yes", "Yes", "Yes"],
        ["AES-256-GCM-SIV (FIPS)", "\u2014", "Yes", "Yes", "Yes"],
        ["ML-KEM-1024 (post-quantum)", "\u2014", "Yes", "Yes", "Yes"],
        ["FIDO2 hardware key", "Yes", "Yes", "Yes", "Yes"],
        ["Zero-trace cleanup", "Yes", "Yes", "Yes", "Yes"],
        ["Cloud sync", "\u2014", "Yes", "Yes", "Yes"],
        ["Cloud backup", "\u2014", "Yes", "Yes", "Yes"],
        ["Vault sharing", "\u2014", "\u2014", "Yes", "Yes"],
        ["Audit logging", "\u2014", "\u2014", "Yes", "Yes"],
        ["Multi-device", "\u2014", "Yes", "Yes", "Yes"],
        ["Priority support", "\u2014", "\u2014", "\u2014", "Yes"],
        ["Admin dashboard", "\u2014", "\u2014", "\u2014", "Yes"],
        ["Bulk provisioning", "\u2014", "\u2014", "\u2014", "Yes"],
      ],
      [2600, 1200, 1400, 1400, 2760],
      1
    ),
    H.caption("Table 3.1 \u2014 Feature Matrix by Subscription Tier"),
    H.pageBreak(),

    // 4
    H.h1("4. Security Capabilities"),
    H.p("USBVault implements a twelve-layer defense-in-depth security architecture. Each layer operates independently\u2014the compromise of any single layer does not reduce the protection provided by the remaining layers."),
    H.makeStatusTable(
      ["Layer", "Capability", "Status", "Plain-English Description"],
      [
        ["L1", "Steganographic Delivery", "Planned (V4.0)", "Hides vault data inside ordinary files like images and audio"],
        ["L2", "Hardware Key (FIDO2)", "Complete", "Physical security key required in addition to password"],
        ["L3", "Cloud Split-Key", "Planned (V3.0)", "Encryption key split between device and cloud\u2014stolen USB alone can\u2019t decrypt"],
        ["L4", "Authenticated Encryption", "Complete", "Every piece of data is individually sealed and verified"],
        ["L5", "Memory-Hard KDF", "Complete", "Each password guess requires 64 MB of RAM\u2014slows attackers to a crawl"],
        ["L6", "Memory Protection", "Complete", "Encryption keys locked in memory, erased automatically when done"],
        ["L7", "Hidden Partition", "Complete", "Vault storage invisible to file browsers and disk tools"],
        ["L8", "Hidden File Attributes", "Complete", "Vault file hidden from operating system browsers"],
        ["L9", "Encrypted Filenames", "Complete", "Even file names are encrypted, not just contents"],
        ["L10", "Zero-Trace Cleanup", "Complete", "23 types of forensic evidence removed automatically on eject"],
        ["L11", "App Password + Lockout", "Complete", "Optional secondary password gate before vault access"],
        ["L12", "Crash-Safe Storage", "Complete", "Dual backup ensures no data loss, even during power failure"],
      ],
      [600, 2000, 1400, 5360],
      2
    ),
    H.caption("Table 4.1 \u2014 Twelve-Layer Defense-in-Depth Architecture"),
    H.pageBreak(),

    // 5
    H.h1("5. Platform Support"),
    H.makeTable(
      ["Capability", "Windows 10+", "macOS 12+", "Linux (kernel 5.4+)"],
      [
        ["USB detection", "PowerShell Get-Disk", "diskutil list", "lsblk -J"],
        ["Vault operations", "Full support", "Full support", "Full support"],
        ["Zero-trace artifacts", "12 types (10 user + 2 admin)", "6 types", "6 types"],
        ["Hidden partition", "attrib +H +S", "chflags hidden", "Unmount"],
        ["Browser support", "Chrome, Edge, Firefox", "Chrome, Safari, Firefox", "Chrome, Firefox"],
        ["Admin elevation", "UAC prompt", "sudo prompt", "polkit / sudo"],
        ["ExFAT native", "Yes", "Yes", "Kernel 5.4+ (exfat-fuse for older)"],
      ],
      [2000, 2200, 2200, 2960]
    ),
    H.caption("Table 5.1 \u2014 Platform Support Matrix"),
    H.pageBreak(),

    // 6
    H.h1("6. Encryption at a Glance"),
    H.p("USBVault uses two layers of encryption. The first layer derives a key from your password using Argon2id, a modern algorithm that requires 64 MB of memory per guess attempt\u2014making automated attacks extraordinarily expensive. The second layer uses that key to encrypt your files with either XChaCha20-Poly1305 (the default, used by Signal and many security tools) or AES-256-GCM-SIV (for organizations requiring FIPS compliance)."),
    H.p("For organizations concerned about future quantum computers, USBVault offers optional ML-KEM-1024 post-quantum encryption\u2014a NIST-standardized algorithm designed to resist quantum attacks. When enabled, your data is protected as long as either the classical or quantum-resistant algorithm remains secure."),
    H.pageBreak(),

    // 7
    H.h1("7. Zero-Trace Privacy"),
    H.p("When a USB drive is used on a computer, the operating system creates numerous artifacts: recent file lists, thumbnail caches, registry entries, browser history, and more. USBVault\u2019s zero-trace cleanup removes 23 distinct artifact types across Windows, macOS, and Linux, automatically executed during the safe eject process."),
    H.p("This is particularly important for users who operate in environments where the mere evidence of using encrypted storage could be problematic\u2014journalists, intelligence professionals, and corporate executives operating in certain jurisdictions."),
    H.pageBreak(),

    // 8
    H.h1("8. Roadmap"),
    H.h2("8.1 V3.0 \u2014 Cloud Split-Key"),
    H.p("V3.0 introduces cloud split-key encryption: the master key is derived from HKDF(LOCAL_KEY || REMOTE_KEY), meaning a stolen USB drive alone cannot decrypt the vault even with the correct password. The server holds an encrypted key shard that must be retrieved online. An offline grace period with configurable TTL allows continued access during temporary connectivity loss."),
    H.spacer(80),
    H.h2("8.2 V4.0 \u2014 Advanced Security"),
    H.bullet("Steganographic embedding: hide vault data inside ordinary PNG, JPEG, and WAV files"),
    H.bullet("Security tier selection: SECRET / TOP-SECRET / PRESIDENTIAL with escalating protection levels"),
    H.bullet("Hardware key enforcement for TOP-SECRET and above"),
    H.bullet("Duress password: triggers self-destruct and shows decoy data if entered under coercion"),
    H.bullet("Secure file viewer: time-limited document viewer with 90-second auto-wipe"),
    H.pageBreak(),

    // 9
    H.h1("9. Quality & Testing"),
    H.p("USBVault maintains 340 test files across three subsystems, including 19 property-based fuzzing suites that generate random inputs to stress-test cryptographic code paths. All tests pass on every commit."),
    H.makeTable(
      ["Subsystem", "Test Count", "Framework", "Key Coverage"],
      [
        ["Rust crypto core", "234 tests", "cargo test + proptest", "KDF, AEAD, streaming, header, PQC, sharing, SRP"],
        ["TypeScript frontend", "45 test files", "Jest + Playwright", "UI flows, state, crypto bridge, i18n"],
        ["Go server", "61 test files", "go test", "Auth, billing, sharing, sync, BOLA prevention"],
      ],
      [1800, 1200, 2200, 4160]
    ),
    H.caption("Table 9.1 \u2014 Test Coverage Summary"),
    H.pageBreak(),

    // 10
    H.h1("10. Competitive Differentiation"),
    H.p("Quantum_Shield occupies a unique position in the encrypted storage market by combining capabilities that no single competitor offers:"),
    H.makeTableBoldFirst(
      ["Differentiator", "What It Means", "Competitor Gap"],
      [
        ["Zero-installation portability", "Double-click from USB, works on any computer, no admin rights", "VeraCrypt requires installation; BitLocker is Windows-only"],
        ["Zero-trace forensic cleanup", "23 artifact types cleaned across 3 platforms", "No competitor offers automated forensic cleanup"],
        ["Post-quantum encryption", "NIST ML-KEM-1024, shipping now", "No competitor ships production PQC"],
        ["Rust crypto core", "Memory-safe, hardware-speed, auto key zeroing", "Most competitors use OpenSSL (C) or custom implementations"],
        ["Dual-mode operation", "Offline USB-only OR cloud-connected from same vault", "Cloud-first competitors don\u2019t work offline; offline tools lack cloud"],
        ["Crash-safe vault", "Dual-index atomic commits with rollback protection", "Competitors risk corruption on power loss"],
        ["Hidden partition", "Vault storage invisible to OS disk tools", "Most competitors store visible encrypted containers"],
      ],
      [2200, 3580, 3580]
    ),
    H.caption("Table 10.1 \u2014 Competitive Differentiation Matrix"),

    H.spacer(400),
    H.p([H.italic("End of Document \u2014 Quantum_Shield Product Specification v2.0 \u2014 March 15, 2026")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_Product_Specification.docx",
    headerTitle: "Quantum_Shield \u2014 Product Specification",
    headerClassification: "CONFIDENTIAL",
    footerDocId: "DOC-005", footerVersion: "2.0", children, outDir,
  });
}

module.exports = { generate };
