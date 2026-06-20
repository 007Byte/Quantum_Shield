/**
 * USBVault Enterprise — Professional Document Generator
 * Generates all 7 enterprise .docx documents
 *
 * Usage:
 *   cd /path/to/this/folder
 *   npm install docx
 *   node generate_all_docs.js
 */

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, Bookmark
} = require("docx");

// ─────────────────────── SHARED STYLES & HELPERS ───────────────────────

const BRAND_BLUE = "1B3A5C";
const BRAND_ACCENT = "2E75B6";
const LIGHT_BLUE = "D5E8F0";
const LIGHT_GRAY = "F2F2F2";
const WHITE = "FFFFFF";
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const MARGIN = 1440;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 9360

function getStyles() {
  return {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: BRAND_BLUE },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BRAND_BLUE },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BRAND_ACCENT },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 }
      },
    ]
  };
}

function getNumbering() {
  return {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ]
      },
      {
        reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ]
      },
    ]
  };
}

function pageProps(title, classification) {
  return {
    page: {
      size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
    }
  };
}

function makeHeader(title, classification) {
  return new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_ACCENT, space: 1 } },
        spacing: { after: 120 },
        children: [
          new TextRun({ text: title, font: "Arial", size: 16, color: "666666" }),
          new TextRun({ text: `\t${classification}`, font: "Arial", size: 16, color: "999999", bold: true }),
        ],
        tabStops: [{ type: "right", position: 9360 }],
      })
    ]
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: BRAND_ACCENT, space: 1 } },
        spacing: { before: 120 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", font: "Arial", size: 16, color: "999999" }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" }),
        ]
      })
    ]
  });
}

function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }); }

function p(text, opts = {}) {
  const runs = [];
  if (typeof text === "string") {
    runs.push(new TextRun({ text, ...opts }));
  } else {
    runs.push(...text);
  }
  return new Paragraph({ spacing: { after: 120 }, children: runs });
}

function bold(text) { return new TextRun({ text, bold: true }); }
function italic(text) { return new TextRun({ text, italics: true }); }

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80 },
    children: [new TextRun(text)]
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "numbers", level },
    spacing: { after: 80 },
    children: [new TextRun(text)]
  });
}

function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }

function makeTable(headers, rows, colWidths) {
  if (!colWidths) {
    const w = Math.floor(CONTENT_WIDTH / headers.length);
    colWidths = headers.map(() => w);
    // Adjust last column to fill remainder
    colWidths[colWidths.length - 1] = CONTENT_WIDTH - colWidths.slice(0, -1).reduce((a, b) => a + b, 0);
  }
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: BRAND_BLUE, type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: WHITE, font: "Arial", size: 20 })] })]
    }))
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders,
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? WHITE : LIGHT_GRAY, type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), font: "Arial", size: 20 })] })]
    }))
  }));

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows]
  });
}

function titlePage(title, subtitle, version, date, audience, classification) {
  return [
    new Paragraph({ spacing: { before: 3000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: title, font: "Arial", size: 48, bold: true, color: BRAND_BLUE })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: subtitle, font: "Arial", size: 28, color: BRAND_ACCENT })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `Version ${version} | ${date}`, font: "Arial", size: 22, color: "666666" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `Audience: ${audience}`, font: "Arial", size: 22, color: "666666" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `Classification: ${classification}`, font: "Arial", size: 22, bold: true, color: "CC0000" })]
    }),
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Codename: Fortress Enterprise", font: "Arial", size: 20, italics: true, color: "999999" })]
    }),
    pageBreak(),
  ];
}

async function saveDoc(doc, filename) {
  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`  Created: ${outPath}`);
}

// ─────────────────────── DOCUMENT 1: TECHNICAL SPECIFICATION ───────────────────────

async function generateTechSpec() {
  console.log("Generating DOC-001: Technical Specification...");
  const children = [
    ...titlePage(
      "USBVault Enterprise",
      "Technical Specification",
      "2.0", "March 15, 2026",
      "Engineers, Security Auditors, Pen Testers",
      "CONFIDENTIAL"
    ),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    // Section 1
    h1("1. Executive Summary"),
    p("USBVault Enterprise Edition is a portable encrypted file storage platform engineered to intelligence-grade security standards. Users carry sensitive files on a standard USB drive, plug into any computer running Windows, macOS, or Linux, access files with a password, and walk away leaving zero forensic evidence."),
    h2("1.1 Technology Stack"),
    makeTable(
      ["Subsystem", "Language", "Purpose"],
      [
        ["usbvault-crypto", "Rust (2021 edition)", "All cryptographic operations"],
        ["usbvault-app", "TypeScript / React Native", "Cross-platform frontend (37 pages)"],
        ["usbvault-server", "Go 1.25", "REST API server (cloud mode)"],
        ["usb-companion", "Node.js / Express", "USB hardware bridge (localhost:3001)"],
      ],
      [2200, 2600, 4560]
    ),
    h2("1.2 Quality Metrics"),
    makeTable(
      ["Metric", "Value"],
      [
        ["Rust tests", "234 (all passing)"],
        ["TypeScript test files", "45"],
        ["Go test files", "61"],
        ["Total test files", "340 across 3 subsystems"],
        ["Frontend pages", "37"],
        ["Security services", "19"],
        ["Companion endpoints", "19"],
        ["Languages", "4 (en, es, fr, de)"],
      ],
      [4680, 4680]
    ),
    pageBreak(),

    // Section 2
    h1("2. Vault Binary Format"),
    h2("2.1 V4 Header"),
    p("The vault binary file (VAULT.bin) resides on the hidden SECURE partition. The V4 header occupies 24,576 bytes (24 KiB) using a sequential length-prefixed format. Magic: USBVLT04 (accepts USBVLT02, USBVLT03 for backward-compatible discovery)."),
    h3("Header Fields"),
    makeTable(
      ["Field", "Type/Size", "Description"],
      [
        ["version", "u8", "Header version identifier"],
        ["cipher_id", "u8", "AEAD cipher selector (2=XChaCha20, 3=AES-256-GCM-SIV)"],
        ["salt", "32 bytes", "Random salt for Argon2id KDF"],
        ["verify_iv", "24 bytes", "Nonce for verification marker"],
        ["verify_ct", "variable", "Encrypted verification marker"],
        ["header_hmac", "32 bytes", "HMAC-SHA256 over all header fields"],
        ["active_index_slot", "u8", "Active dual-index slot (0 or 1)"],
        ["index1/2 offset+length", "u32 each", "Byte offsets and lengths for dual index slots"],
        ["commit_counter", "u64", "Monotonic counter for rollback detection"],
        ["argon2_params", "struct", "Argon2id parameters"],
        ["identity_block", "len-prefixed", "User identity metadata"],
        ["tfa_block", "len-prefixed", "FIDO2 credential storage"],
        ["fail_counter_block", "len-prefixed", "Failed attempt counter with HMAC"],
        ["wrapped_mek", "len-prefixed", "Master Encryption Key wrapped by KEK"],
        ["state_version", "u64", "Rollback protection version"],
        ["index_encrypted", "bool", "Whether index blobs are encrypted"],
      ],
      [2800, 1800, 4760]
    ),
    h2("2.2 V2RC Record Format"),
    p("Each encrypted file uses the V2RC (Version 2 Record Chunked) streaming format:"),
    p("magic(4B) + version(1B) + base_nonce(24B) + chunks[length(4B) + AEAD(data+16B tag)] + final_HMAC(32B)"),
    bullet("Chunk size: 65,536 bytes (64 KiB)"),
    bullet("Maximum file size: ~256 TiB (2^32 chunks x 64 KiB)"),
    bullet("Per-chunk nonce derivation via HKDF domain separation"),
    h2("2.3 TFA Wire Format"),
    p("cred_id_len(2B u16 LE) + credential_id(var) + aaguid(16B) + label_len(1B) + label(var, max 32B)"),
    pageBreak(),

    // Section 3
    h1("3. Cryptographic Protocols"),
    h2("3.1 Argon2id Key Derivation"),
    makeTable(
      ["Parameter", "Value", "Rationale"],
      [
        ["Algorithm", "Argon2id", "Hybrid: side-channel + GPU resistant"],
        ["Memory", "65,536 KiB (64 MiB)", "Memory-hard per attempt"],
        ["Time cost", "3 iterations", "Security/UX balance"],
        ["Parallelism", "4 lanes", "Matches common CPU cores"],
        ["Output", "64 bytes", "Split: enc_key[0:32] + hmac_key[32:64]"],
        ["Salt", "32 bytes (random)", "Unique per vault via CSPRNG"],
      ],
      [2200, 3200, 3960]
    ),
    h2("3.2 AEAD Ciphers"),
    makeTable(
      ["Property", "XChaCha20-Poly1305", "AES-256-GCM-SIV"],
      [
        ["Cipher ID", "2", "3"],
        ["Default", "Yes", "No"],
        ["Key size", "256 bits", "256 bits"],
        ["Nonce size", "192 bits (24 bytes)", "96 bits (12 bytes)"],
        ["Tag size", "128 bits", "128 bits"],
        ["FIPS 140-3", "No", "Yes"],
        ["Nonce reuse safety", "Resistant (extended nonce)", "Resistant (SIV construction)"],
      ],
      [2800, 3280, 3280]
    ),
    h2("3.3 Post-Quantum Cryptography"),
    p("USBVault implements hybrid PQC: X25519 + ML-KEM-1024, combined via HKDF-SHA256 with domain 'hybrid_seal_x25519_mlkem1024'. Secure if EITHER algorithm remains unbroken. Feature-gated in Rust."),
    h2("3.4 Wrapped MEK Architecture"),
    p("V4 introduces wrapped MEK: password \u2192 Argon2id \u2192 KEK \u2192 unwrap(wrapped_mek) \u2192 MEK. Password change is O(1) \u2014 only re-wraps MEK."),
    p("FIDO2: final_key = enc_key XOR PRF_output"),
    h2("3.5 Self-Destruct Protocol"),
    p("Triggered at fail_count >= 10. Three-pass overwrite of wrapped_mek: random \u2192 zeros \u2192 random. Vault permanently inaccessible. Data records remain but cannot be decrypted."),
    h2("3.6 Exponential Backoff"),
    makeTable(
      ["Attempt", "Delay"],
      [
        ["1", "2 seconds"], ["2", "4 seconds"], ["3", "8 seconds"], ["4", "16 seconds"],
        ["5", "32 seconds"], ["6", "64 seconds"], ["7", "128 seconds"],
        ["8", "256 seconds"], ["9", "512 seconds"], ["10", "SELF-DESTRUCT"],
      ],
      [4680, 4680]
    ),
    pageBreak(),

    // Section 4
    h1("4. USB Operations"),
    h2("4.1 Partition Layout"),
    makeTable(
      ["Partition", "Size", "Visibility", "Contents"],
      [
        ["TOOLS", "500 MB", "Visible", "Launchers, Node.js, Companion, Web App"],
        ["SECURE", "Remaining", "Hidden", "VAULT.bin (encrypted)"],
      ],
      [1800, 1500, 1800, 4260]
    ),
    h2("4.2 Platform Tools Matrix"),
    makeTable(
      ["Operation", "macOS", "Linux", "Windows"],
      [
        ["Detection", "diskutil list -plist", "lsblk -J -b", "PowerShell Get-Disk"],
        ["Partitioning", "diskutil partitionDisk", "parted + mkfs.exfat", "Clear-Disk + New-Partition"],
        ["Mounting", "diskutil mount", "udisksctl mount", "Add-PartitionAccessPath"],
        ["Ejecting", "diskutil eject", "udisksctl power-off", "10-step PowerShell"],
        ["Hiding", "chflags hidden", "Partition unmounting", "attrib +H +S"],
      ],
      [1800, 2520, 2520, 2520]
    ),
    h2("4.3 Companion API (19 Endpoints)"),
    p("All endpoints bind to 127.0.0.1:3001. Security: Helmet headers, CORS whitelist, rate limiting (60/min general, 5/min destructive), execFile only, input validation, audit logging, fsync after every write."),
    makeTable(
      ["#", "Method", "Endpoint", "Description"],
      [
        ["1", "GET", "/usb/drives", "List connected USB drives"],
        ["2", "GET", "/usb/provision/preflight", "Pre-check drive eligibility"],
        ["3", "POST", "/usb/provision", "Partition and format USB drive"],
        ["4", "POST", "/usb/provision/elevate", "Provision with admin privileges"],
        ["5", "POST", "/usb/reset", "Factory reset USB drive"],
        ["6", "POST", "/usb/mount-secure", "Mount hidden SECURE partition"],
        ["7", "POST", "/usb/unmount-secure", "Unmount SECURE partition"],
        ["8", "POST", "/usb/eject", "Safely eject USB drive"],
        ["9", "POST", "/usb/zero-trace", "Execute forensic cleanup"],
        ["10", "POST", "/usb/zero-trace/scan", "Scan for artifacts"],
        ["11", "GET", "/usb/vaults", "List vaults on SECURE partition"],
        ["12", "POST", "/usb/vault/init", "Initialize new vault"],
        ["13", "GET", "/usb/vault/container/header", "Read vault header"],
        ["14", "PUT", "/usb/vault/container/header", "Update vault header"],
        ["15", "GET", "/usb/vault/container/bytes", "Read raw VAULT.bin bytes"],
        ["16", "POST", "/usb/vault/container/append", "Append encrypted record"],
        ["17", "GET", "/usb/vault/container/size", "Get VAULT.bin size"],
        ["18", "GET", "/usb/vault/container/capacity", "Get partition capacity"],
        ["19", "POST", "/usb/vault/container/compact", "Compact VAULT.bin"],
      ],
      [500, 900, 3800, 4160]
    ),
    pageBreak(),

    // Section 5
    h1("5. Security Modules"),
    h2("5.1 Defense-in-Depth (12 Layers)"),
    makeTable(
      ["Layer", "Name", "Status", "Description"],
      [
        ["L1", "Steganographic Delivery", "PLANNED V4.0", "Hide VAULT.bin in carrier files"],
        ["L2", "Hardware Key (FIDO2)", "COMPLETE", "PRF extension, XOR with Argon2id key"],
        ["L3", "Cloud Split-Key", "PLANNED V3.0", "HKDF(LOCAL || REMOTE) = MASTER_KEY"],
        ["L4", "XChaCha20-Poly1305", "COMPLETE", "Per-chunk authenticated encryption"],
        ["L5", "Argon2id KDF (64 MiB)", "COMPLETE", "Memory-hard key derivation"],
        ["L6", "Memory Protection", "COMPLETE", "mlock + guard pages + Zeroize"],
        ["L7", "Hidden Partition", "COMPLETE", "SECURE unmounted after provisioning"],
        ["L8", "Hidden File Attributes", "COMPLETE", "chflags/attrib on VAULT.bin"],
        ["L9", "Encrypted Filenames", "COMPLETE", "Names in AEAD metadata chunks"],
        ["L10", "Zero-Trace Cleanup", "COMPLETE", "23 cleaners, auto-clean on eject"],
        ["L11", "App Password + Lockout", "COMPLETE", "PBKDF2-SHA256, 150K iterations"],
        ["L12", "Crash-Safe Dual-Index", "COMPLETE", "Append-only, commit counter, fsync"],
      ],
      [700, 2600, 1800, 4260]
    ),
    h2("5.2 Boot Hardening (6 Stages)"),
    makeTable(
      ["Stage", "Name", "Action"],
      [
        ["1", "Anti-Debug", "Device integrity verification"],
        ["2", "Integrity", "CSP enforcement, code signature validation"],
        ["3", "Memory Lock", "WebCrypto init, memory locking"],
        ["4", "Brute-Force", "Load/validate fail state from header"],
        ["5", "Self-Destruct", "Arm callbacks if threshold near"],
        ["6", "Ghost Mode", "Re-activate stealth, clear state"],
      ],
      [1000, 2200, 6160]
    ),
    pageBreak(),

    // Section 6
    h1("6. Password Policy"),
    makeTable(
      ["Parameter", "Vault Password", "App Password"],
      [
        ["Min length", "15 characters", "12 characters"],
        ["KDF", "Argon2id (64 MiB)", "PBKDF2-SHA256"],
        ["Iterations", "3", "150,000"],
        ["Scoring", "Entropy + OWASP + contextual", "Standard"],
        ["Dictionary", "98,735 bloom filter (k=10)", "N/A"],
        ["HIBP", "k-anonymity API", "N/A"],
        ["Lockout", "Exponential backoff", "3 attempts, 30s"],
        ["Self-destruct", "At 10 failures", "N/A"],
      ],
      [2200, 3580, 3580]
    ),
    pageBreak(),

    // Section 7
    h1("7. Error Codes"),
    makeTable(
      ["Code", "HTTP", "Description"],
      [
        ["WRONG_PASSWORD", "401", "Incorrect vault password"],
        ["TFA_FAILED", "401", "FIDO2 authentication failed"],
        ["LOCKED_OUT", "429", "Exponential backoff active"],
        ["SELF_DESTRUCTED", "410", "Vault permanently destroyed"],
        ["BAD_MAGIC", "400", "Invalid header magic bytes"],
        ["BAD_HMAC", "400", "Header HMAC verification failed"],
        ["BAD_INDEX", "500", "Index blob corruption detected"],
        ["CHUNK_AUTH_FAIL", "400", "AEAD tag verification failed"],
        ["ROLLBACK_DETECTED", "409", "State rollback attack detected"],
        ["DISK_FULL", "507", "Exceeds 50% partition capacity"],
        ["NO_USB", "404", "No USB drives detected"],
        ["EJECT_FAILED", "500", "OS USB ejection failed"],
        ["PROVISION_FAILED", "500", "USB partitioning failed"],
        ["MOUNT_FAILED", "500", "SECURE partition mount failed"],
        ["ADMIN_REQUIRED", "403", "Elevated privileges required"],
        ["ADMIN_AUTH_FAILED", "401", "Admin authentication failed"],
      ],
      [2800, 900, 5660]
    ),
    pageBreak(),

    // Section 8
    h1("8. Build System"),
    makeTable(
      ["Subsystem", "Build Command", "Optimizations"],
      [
        ["Rust", "cargo build --release", "LTO, strip, panic=abort"],
        ["TypeScript", "Expo build pipeline", "Minification, tree shaking"],
        ["Go", "go build", "Static binary, CGO disabled"],
        ["Docker", "Multi-stage Alpine", "Non-root, minimal image"],
        ["K8s", "3 replicas + HPA", "Auto-scaling on CPU 70%"],
      ],
      [2200, 3580, 3580]
    ),
    pageBreak(),

    // Section 9
    h1("9. Testing"),
    makeTable(
      ["Suite", "Count", "Description"],
      [
        ["Unit tests (lib)", "77", "Core cryptographic operations"],
        ["Format compatibility", "28", "V2/V3/V4 header parsing"],
        ["Integration tests", "40", "End-to-end encrypt/decrypt"],
        ["Property tests (proptest)", "19", "Fuzz testing with random inputs"],
        ["Sharing tests", "32", "Shamir secret sharing"],
        ["SRP protocol tests", "23", "Authentication protocol"],
        ["Vault lifecycle tests", "15", "Create/open/modify/recover"],
        ["TypeScript test files", "45", "UI flows, state, crypto bridge"],
        ["Go test files", "61", "Auth, billing, BOLA"],
        ["TOTAL", "340", "All passing across 3 subsystems"],
      ],
      [3000, 1000, 5360]
    ),
    pageBreak(),

    // Section 10
    h1("10. Constants Reference"),
    makeTable(
      ["Constant", "Value", "Location"],
      [
        ["HEADER_SIZE_V4", "24,576 bytes", "vault/header.rs"],
        ["MAGIC_V4", "USBVLT04", "vault/header.rs"],
        ["CHUNK_SIZE", "65,536 bytes", "streaming.rs"],
        ["REC_MAGIC_CHUNKED", "V2RC", "streaming.rs"],
        ["ARGON2_MEMORY_KIB", "65,536 (64 MiB)", "kdf.rs"],
        ["ARGON2_TIME_COST", "3", "kdf.rs"],
        ["ARGON2_PARALLELISM", "4", "kdf.rs"],
        ["MAX_FAIL_ATTEMPTS", "10", "vault/header.rs"],
        ["SELF_DESTRUCT_PASSES", "3", "vault/header.rs"],
        ["VAULT_SIZE_LIMIT_PERCENT", "0.50 (50%)", "vaultContainerService.js"],
        ["MAX_BACKOFF_MS", "3,600,000 (1 hour)", "vaultOrchestrator.ts"],
        ["PASSWORD_MIN_LENGTH", "15", "passwordPolicy.ts"],
        ["BLOOM_ENTRIES", "98,735", "weakPasswordBloom.ts"],
        ["BLOOM_K", "10", "weakPasswordBloom.ts"],
        ["COMPANION_PORT", "3001", "server.js"],
        ["TOOLS_PARTITION_MB", "500", "usbProvisioner.js"],
      ],
      [3200, 2800, 3360]
    ),
    pageBreak(),

    // Appendix B
    h1("Appendix B: Architecture Decision Records"),
    makeTable(
      ["ADR", "Title", "Decision Summary"],
      [
        ["001", "Go backend", "Performance, concurrency, single binary"],
        ["002", "Rust crypto core", "Memory safety, zero-cost abstractions"],
        ["003", "Expo/React Native", "Cross-platform single codebase"],
        ["004", "PostgreSQL", "ACID compliance, JSON, Go drivers"],
        ["005", "XChaCha20 default", "24-byte nonce, no AES-NI needed"],
        ["006", "Zero-knowledge", "Server never sees plaintext"],
        ["007", "Redis sessions", "In-memory performance"],
        ["008", "S3 blob storage", "Scalable, durable, cost-effective"],
        ["009", "ML-KEM-1024", "NIST PQC, highest security margin"],
        ["010", "Zustand state", "Lightweight, TypeScript-native"],
      ],
      [800, 2800, 5760]
    ),
    pageBreak(),

    // Appendix C
    h1("Appendix C: Threat Model"),
    makeTable(
      ["#", "Threat", "Mitigation", "Status"],
      [
        ["T1", "Brute-force password", "Argon2id 64MiB + backoff + self-destruct", "MITIGATED"],
        ["T2", "Header tampering", "HMAC-SHA256, domain-separated fail counter", "MITIGATED"],
        ["T3", "Nonce reuse", "24-byte nonces, HKDF derivation, runtime detection", "MITIGATED"],
        ["T4", "Memory dump", "mlock, guard pages, Zeroize, constant-time", "MITIGATED"],
        ["T5", "Quantum computing", "ML-KEM-1024 + X25519 hybrid", "MITIGATED"],
        ["T6", "Index corruption", "Dual-index, atomic commits, commit counter", "MITIGATED"],
        ["T7", "Weak password", "15-char min, bloom filter, HIBP", "MITIGATED"],
        ["T8", "Forensic recovery", "23 zero-trace cleaners, auto-clean", "MITIGATED"],
        ["T9", "Rollback attack", "Monotonic commit counter, state_version", "MITIGATED"],
        ["T10", "USB interception", "Encrypted at rest, hidden partition", "MITIGATED"],
        ["T11", "Companion API abuse", "Localhost, CORS, rate limiting", "MITIGATED"],
        ["T12", "Supply chain", "cargo-audit, gosec, npm audit, Snyk", "MONITORED"],
        ["T13", "Side-channel", "Constant-time (subtle crate)", "MITIGATED"],
      ],
      [500, 2000, 4860, 2000]
    ),

    new Paragraph({ spacing: { before: 600 } }),
    p([
      italic("Document generated March 15, 2026. USBVault Enterprise Edition v2.0."),
    ]),
  ];

  const doc = new Document({
    styles: getStyles(),
    numbering: getNumbering(),
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 Technical Specification v2.0", "CONFIDENTIAL") },
      footers: { default: makeFooter() },
      children,
    }]
  });

  await saveDoc(doc, "USBVault_Enterprise_Technical_Specification_v2.docx");
}

// ─────────────────────── DOCUMENT 2: ARCHITECTURE ───────────────────────

async function generateArchitecture() {
  console.log("Generating DOC-002: Architecture & System Design...");
  const children = [
    ...titlePage("USBVault Enterprise", "Architecture & System Design", "2.0", "March 15, 2026",
      "System Architects, Engineering Leads, DevOps", "CONFIDENTIAL"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    h1("1. System Overview"),
    p("USBVault Enterprise is built on a zero-knowledge, four-subsystem architecture supporting dual-mode operation: USB-only standalone (offline) or cloud-connected (sync, sharing, backup, billing)."),
    h2("1.1 Trust Boundaries"),
    makeTable(["Boundary", "Crosses", "Never Crosses"], [
      ["App \u2194 Rust FFI", "Password (once), encrypted bytes", "Derived keys, plaintext"],
      ["App \u2194 Companion", "Encrypted VAULT.bin bytes, drive IDs", "Passwords, keys, plaintext"],
      ["App \u2194 Server", "Encrypted blobs, auth tokens", "Vault password, file content, keys"],
      ["Companion \u2194 USB", "Raw encrypted bytes (fsync'd)", "Keys, plaintext"],
    ], [2200, 3580, 3580]),

    h1("2. Architecture Principles"),
    bullet("Zero Trust: Every component assumes others may be compromised"),
    bullet("Defense in Depth: 12 overlapping security layers"),
    bullet("Crash Safety: Atomic commits, dual-index, monotonic commit counter"),
    bullet("Least Privilege: Companion localhost-only, server non-root, admin on-demand"),
    bullet("Cryptographic Agility: Parameterized cipher_id, feature-gated PQC"),
    bullet("Fail Secure: Security failures deny access, never degrade"),
    pageBreak(),

    h1("3. Component Architecture"),
    h2("3.1 Subsystem Responsibilities"),
    makeTable(["Subsystem", "Language", "Responsibility"], [
      ["usbvault-crypto", "Rust 2021", "All crypto: KDF, AEAD, streaming, PQC, memory security"],
      ["usbvault-app", "TypeScript/React", "UI, orchestration, state (7 Zustand stores), i18n"],
      ["usbvault-server", "Go 1.25", "Auth (SRP-6a), billing (Stripe), sync (WebSocket+CRDT)"],
      ["usb-companion", "Node.js/Express", "USB bridge: detect, partition, mount, vault I/O, zero-trace"],
    ], [2200, 2200, 4960]),
    pageBreak(),

    h1("4. Data Flow"),
    h2("4.1 Encrypt File (9 Steps)"),
    numbered("User selects file in app UI"),
    numbered("App reads file into memory (or streams)"),
    numbered("App calls Rust FFI encrypt_streaming() with MEK"),
    numbered("Rust generates random 24-byte base nonce"),
    numbered("Rust iterates 64 KiB chunks: HKDF nonce derivation, AEAD encrypt"),
    numbered("Rust computes final HMAC-SHA256 over record"),
    numbered("App sends encrypted record to Companion POST /usb/vault/container/append"),
    numbered("Companion appends to VAULT.bin + fsync"),
    numbered("App updates index: serialize \u2192 encrypt \u2192 write inactive slot \u2192 flip \u2192 increment counter \u2192 HMAC \u2192 fsync"),
    h2("4.2 Decrypt File (6 Steps)"),
    numbered("User selects file from vault index"),
    numbered("App reads offset/length from active index"),
    numbered("App requests bytes from Companion GET /usb/vault/container/bytes"),
    numbered("Companion reads encrypted bytes from VAULT.bin"),
    numbered("App calls Rust FFI decrypt_streaming() with MEK"),
    numbered("Rust verifies HMAC, iterates chunks (nonce, tag, decrypt), returns plaintext"),
    pageBreak(),

    h1("5. Security Architecture"),
    h2("5.1 Key Hierarchy"),
    p("password \u2192 Argon2id(salt, 64MiB) \u2192 64 bytes \u2192 enc_key[0:32] + hmac_key[32:64]"),
    p("If FIDO2: final_key = enc_key XOR PRF_output"),
    p("KEK(=enc_key/final_key) \u2192 unwrap(wrapped_mek) \u2192 MEK \u2192 encrypts file data + index blobs"),
    p("hmac_key \u2192 Header HMAC + Fail Counter HMAC"),
    pageBreak(),

    h1("6. Deployment Architecture"),
    h2("6.1 Kubernetes"),
    bullet("Minimum 3 replicas with HPA (target CPU 70%)"),
    bullet("Liveness probe: GET /api/v1/health"),
    bullet("Secrets via Kubernetes Secrets"),
    bullet("Database migration via Job"),
    h2("6.2 Docker"),
    bullet("Multi-stage Alpine build, non-root user"),
    bullet("Minimal attack surface: no build tools in final image"),
    pageBreak(),

    h1("7. Database Schema"),
    makeTable(["Table", "Purpose", "Key Columns"], [
      ["users", "User accounts", "id, email, srp_verifier, srp_salt"],
      ["vaults", "Vault metadata", "id, user_id, name, cipher_id"],
      ["vault_blobs", "S3 blob references", "id, vault_id, s3_key, size_bytes"],
      ["sessions", "JWT sessions", "id, user_id, token_hash, expires_at"],
      ["fido2_credentials", "WebAuthn keys", "id, user_id, credential_id, public_key"],
      ["subscriptions", "Stripe state", "id, user_id, stripe_sub_id, tier"],
      ["audit_log", "Security events", "id, user_id, action, ip, timestamp"],
      ["sync_state", "CRDT cursors", "id, vault_id, device_id, commit_counter"],
    ], [2200, 2800, 4360]),
    pageBreak(),

    h1("8. API Design"),
    makeTable(["Group", "Base Path", "Auth", "Description"], [
      ["Auth", "/api/v1/auth", "No", "SRP-6a registration/login, FIDO2"],
      ["Vaults", "/api/v1/vaults", "JWT", "CRUD vault metadata"],
      ["Blobs", "/api/v1/blobs", "JWT", "Upload/download encrypted blobs"],
      ["Sharing", "/api/v1/sharing", "JWT", "Share/revoke vault access"],
      ["Billing", "/api/v1/billing", "JWT", "Stripe checkout/portal"],
      ["Sync", "/api/v1/sync", "JWT+WS", "Real-time vault sync"],
      ["Health", "/api/v1/health", "No", "Liveness/readiness probes"],
    ], [1500, 2200, 1200, 4460]),
    pageBreak(),

    h1("9. Frontend Architecture"),
    h2("9.1 Zustand Stores"),
    makeTable(["Store", "Responsibility"], [
      ["authStore", "Auth state, JWT tokens, user profile"],
      ["vaultStore", "Active vault, file list, operations"],
      ["themeStore", "Dark/light mode preferences"],
      ["sidebarStore", "Navigation sidebar state"],
      ["languageStore", "i18n locale (en, es, fr, de)"],
      ["offlineStore", "Online/offline status, queued ops"],
      ["syncStore", "Sync state, CRDT cursors"],
    ], [3000, 6360]),
    pageBreak(),

    h1("10. Observability"),
    makeTable(["Component", "Role"], [
      ["Prometheus", "Metrics collection and storage"],
      ["Grafana", "Dashboarding and visualization"],
      ["AlertManager", "Alert routing and notification"],
      ["Sentry", "Error tracking and exceptions"],
      ["OpenTelemetry", "Distributed tracing"],
    ], [3000, 6360]),
    pageBreak(),

    h1("11. Disaster Recovery"),
    makeTable(["Scenario", "RTO", "RPO", "Procedure"], [
      ["Pod crash", "30 sec", "0", "K8s auto-restart"],
      ["DB failure", "15 min", "5 min", "PostgreSQL standby failover"],
      ["S3 outage", "1 hour", "0", "Cross-region replication"],
      ["Redis failure", "1 min", "Sessions", "Sentinel promotes replica"],
      ["USB failure", "N/A", "Last sync", "Cloud backup restore"],
      ["Full infra loss", "4 hours", "1 hour", "Terraform/Helm redeploy"],
    ], [2200, 1200, 1200, 4760]),

    new Paragraph({ spacing: { before: 600 } }),
    p([italic("Document generated March 15, 2026. USBVault Enterprise Edition v2.0.")]),
  ];

  const doc = new Document({
    styles: getStyles(), numbering: getNumbering(),
    sections: [{ properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 Architecture v2.0", "CONFIDENTIAL") },
      footers: { default: makeFooter() }, children }]
  });
  await saveDoc(doc, "USBVault_Enterprise_Architecture_v2.docx");
}

// ─────────────────────── DOCUMENT 3: USER MANUAL ───────────────────────

async function generateUserManual() {
  console.log("Generating DOC-003: User Manual...");
  const children = [
    ...titlePage("USBVault Enterprise", "User Manual", "2.0", "March 15, 2026",
      "End Users, Customers", "PUBLIC"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    h1("1. Welcome to USBVault"),
    p("USBVault turns any ordinary USB drive into a personal encrypted vault. Store sensitive files \u2014 documents, photos, passwords \u2014 and carry them wherever you go. Plug into any computer running Windows, macOS, or Linux, enter your password to access your files, and unplug leaving zero trace."),
    p("No software installation required on the host computer."),
    h2("Who USBVault Is For"),
    bullet("Government and defense personnel"),
    bullet("Journalists protecting sources"),
    bullet("Legal and medical professionals"),
    bullet("Corporate executives and security teams"),
    bullet("Privacy-conscious citizens"),
    pageBreak(),

    h1("2. Getting Started"),
    h2("What You Need"),
    bullet("A USB drive (8 GB or larger recommended)"),
    bullet("A computer running Windows 10+, macOS 12+, or Ubuntu 20.04+"),
    bullet("About 5 minutes for initial setup"),
    h2("First-Time Setup"),
    numbered("Plug in your USB drive"),
    numbered("Double-click the launcher for your OS (Windows: .bat, macOS: .command, Linux: .sh)"),
    numbered("Create your account or enter vault credentials"),
    numbered("Complete the onboarding wizard: PQC detection \u2192 cipher selection \u2192 identity \u2192 confirm"),
    pageBreak(),

    h1("3. Setting Up Your USB"),
    p("Important: Setup will erase everything on your USB drive. Back up existing files first."),
    numbered("Make sure your USB drive is plugged in"),
    numbered("Navigate to the 'Setup USB' tab"),
    numbered("Select your USB drive from the list"),
    numbered("Enter a vault name (e.g., 'Work Files')"),
    numbered("Choose your master password (minimum 15 characters)"),
    numbered("Click 'Create Vault' \u2014 watch the progress bar complete"),
    p("Your vault is now ready to use."),
    pageBreak(),

    h1("4. Your Master Password"),
    h2("Why 15 Characters?"),
    p("This minimum ensures strong protection against modern cracking tools. A 15+ character password would take centuries to crack by brute force."),
    h2("Tips"),
    bullet("Think phrases, not complexity: 'my cat fluffy loves tuna sandwiches' is excellent"),
    bullet("USBVault scores your password in real-time and checks against 98,735 known compromised passwords"),
    h2("Critical Rules"),
    bullet("NEVER share your master password with anyone"),
    bullet("NEVER forget it \u2014 without it and your recovery phrase, data is permanently lost"),
    bullet("Write down your 24-word recovery phrase and store it separately in a secure location"),
    pageBreak(),

    h1("5. Daily Use"),
    numbered("Plug in your USB drive"),
    numbered("Double-click the launcher from the TOOLS partition"),
    numbered("Enter your password (and tap hardware key if enrolled)"),
    numbered("Access your files from the dashboard"),
    numbered("When done, click 'Eject' for safe removal with zero-trace cleanup"),
    pageBreak(),

    h1("6. Adding Files"),
    numbered("Click 'Add File' or drag and drop onto the vault area"),
    numbered("Select the file from your computer"),
    numbered("USBVault encrypts it instantly (progress bar for large files)"),
    numbered("File appears in your vault list with name, size, and date"),
    pageBreak(),

    h1("7. Viewing Files"),
    numbered("Find the file in your vault list"),
    numbered("Click the file name or 'View' button"),
    numbered("View directly in browser (images, PDFs, text) or download decrypted copy"),
    p("Remember to delete any downloaded decrypted copies when finished."),
    pageBreak(),

    h1("8. Removing Files"),
    numbered("Select the file(s) to remove"),
    numbered("Click 'Delete' and confirm"),
    numbered("Optional: Click 'Compact Vault' to reclaim space from deleted files"),
    pageBreak(),

    h1("9. Safely Ejecting"),
    p("Always use the Eject button inside USBVault rather than pulling out your USB."),
    numbered("Click the 'Eject' button"),
    numbered("Zero-trace cleanup runs (23 artifact types across 3 platforms)"),
    numbered("Drive safely unmounted \u2014 message confirms safe removal"),
    numbered("Recommended: Restart computer for maximum security"),
    numbered("Physically remove your USB drive"),
    pageBreak(),

    h1("10. Security Features"),
    h2("FIDO2 Hardware Key"),
    p("Require a physical security key (YubiKey, etc.) in addition to your password. Even if someone learns your password, they cannot access your vault without the physical key."),
    h2("App Password"),
    p("Optional secondary password required just to open the USBVault application, before you reach the vault password screen."),
    h2("Zero-Trace Cleanup"),
    p("Automatically scrubs 23 types of forensic artifacts from the host computer when you eject."),
    pageBreak(),

    h1("11. Settings"),
    bullet("Theme: Light/dark mode"),
    bullet("Language: English, Spanish, French, German"),
    bullet("Security: Hardware key, app password, auto-lock timeout"),
    bullet("Account: Email, password, subscription (cloud mode)"),
    pageBreak(),

    h1("12. Troubleshooting"),
    h2("Wrong Password"),
    p("Check caps lock. Each wrong attempt increases wait time. After 10 wrong attempts, the vault self-destructs."),
    h2("USB Not Detected"),
    bullet("Try a different USB port"),
    bullet("Check in OS disk management tools"),
    bullet("On Linux, ensure user is in the 'disk' or 'plugdev' group"),
    h2("Disk Full"),
    p("VAULT.bin is limited to 50% of the SECURE partition. Remove files, compact, or use a larger drive."),
    pageBreak(),

    h1("13. Recovery"),
    h2("Forgotten Password"),
    p("Use your 24-word recovery phrase: Forgot Password \u2192 enter phrase \u2192 new password \u2192 vault re-keyed."),
    h2("Lost Hardware Key"),
    p("Recovery blob in vault header allows password-only access. Then enroll a new key."),
    h2("Corrupted Vault"),
    p("Dual-index automatically falls back to backup. You may lose only the most recent operation."),
    pageBreak(),

    h1("14. FAQ"),
    h2("Is my data safe?"),
    p("Yes. Military-grade encryption (XChaCha20-Poly1305 or AES-256-GCM-SIV) with memory-hard key derivation (Argon2id, 64 MiB)."),
    h2("What about quantum computers?"),
    p("USBVault includes optional ML-KEM-1024 post-quantum encryption \u2014 your data is protected if either the classical or quantum-resistant algorithm holds."),
    h2("What if I lose the USB?"),
    p("Files remain encrypted. Without your password, data is indistinguishable from random noise. Cloud backup enables restore to a new drive."),

    new Paragraph({ spacing: { before: 600 } }),
    p([italic("USBVault Enterprise v2.0 \u2014 Intelligence-Grade Security for Everyone.")]),
  ];

  const doc = new Document({
    styles: getStyles(), numbering: getNumbering(),
    sections: [{ properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 User Manual", "") },
      footers: { default: makeFooter() }, children }]
  });
  await saveDoc(doc, "USBVault_Enterprise_User_Manual.docx");
}

// ─────────────────────── DOCUMENT 4: IT DEPLOYMENT GUIDE ───────────────────────

async function generateITGuide() {
  console.log("Generating DOC-004: IT Deployment Guide...");
  const children = [
    ...titlePage("USBVault Enterprise", "IT Deployment Guide", "2.0", "March 15, 2026",
      "IT Administrators, Enterprise Deployment Teams", "INTERNAL"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    h1("1. Overview"),
    p("USBVault Enterprise is a portable encrypted file storage system. From IT\u2019s perspective, there are two deployment surfaces: self-contained USB drives (no infrastructure needed) and the optional cloud backend (sync, sharing, backup, billing)."),
    p("Zero-Knowledge Guarantee: The server NEVER handles plaintext data, filenames, or encryption keys. All crypto is client-side. Authentication uses SRP-6a (server never sees passwords)."),
    pageBreak(),

    h1("2. Deployment Models"),
    makeTable(["Model", "Infrastructure", "Best For"], [
      ["USB-Only", "None (self-contained)", "Air-gapped, field ops, max security"],
      ["Cloud-Connected", "Go + PostgreSQL + Redis + S3", "Teams, sync, sharing, backup"],
    ], [2200, 3200, 3960]),
    pageBreak(),

    h1("3. USB-Only Deployment"),
    p("Each USB drive\u2019s TOOLS partition (500 MB) contains everything: platform launchers, portable Node.js, companion service, static web app."),
    bullet("No network access required"),
    bullet("No admin rights for daily use (only for initial provisioning)"),
    bullet("Port 3001 must be available on host"),
    bullet("Browser: Chrome, Firefox, Safari, Edge (latest 2 versions)"),
    pageBreak(),

    h1("4. Cloud-Connected Deployment"),
    h2("Environment Variables"),
    makeTable(["Variable", "Required", "Description"], [
      ["DATABASE_URL", "Yes", "PostgreSQL connection string"],
      ["REDIS_URL", "Yes", "Redis connection string"],
      ["AWS_ACCESS_KEY_ID", "Yes", "S3 access key"],
      ["AWS_SECRET_ACCESS_KEY", "Yes", "S3 secret key"],
      ["S3_BUCKET", "Yes", "Bucket for encrypted blobs"],
      ["S3_REGION", "Yes", "AWS region"],
      ["JWT_SECRET", "Yes", "JWT signing secret (min 256 bits)"],
      ["STRIPE_SECRET_KEY", "Yes", "Stripe API secret"],
      ["STRIPE_WEBHOOK_SECRET", "Yes", "Stripe webhook signing"],
      ["SENTRY_DSN", "No", "Error tracking DSN"],
      ["PORT", "No", "Server port (default 8080)"],
    ], [3200, 1200, 4960]),
    pageBreak(),

    h1("5. Kubernetes Deployment"),
    bullet("Minimum 3 replicas with HPA (CPU target 70%, max 10 replicas)"),
    bullet("Liveness probe: GET /api/v1/health (initial delay 10s, period 30s)"),
    bullet("Readiness probe: GET /api/v1/health (initial delay 5s, period 10s)"),
    bullet("Secrets via Kubernetes Secrets (database, Redis, S3, JWT, Stripe)"),
    bullet("Database migration via batch/v1 Job before deployment"),
    pageBreak(),

    h1("6. Docker Deployment"),
    bullet("Multi-stage Alpine build: Go build stage + minimal runtime stage"),
    bullet("Non-root user in final image"),
    bullet("docker-compose for development with PostgreSQL 16 + Redis 7"),
    pageBreak(),

    h1("7. Network Requirements"),
    makeTable(["Service", "Bind", "Port", "Protocol"], [
      ["Companion", "127.0.0.1 (localhost only)", "3001", "HTTP"],
      ["Server API", "0.0.0.0", "8080", "HTTPS + WebSocket"],
    ], [2000, 3200, 1200, 2960]),
    pageBreak(),

    h1("8. Security Configuration"),
    bullet("CORS: Localhost whitelist (companion), frontend origins (server)"),
    bullet("Rate limiting: 60/min general, 5/min destructive (companion); configurable per tier (server)"),
    bullet("JWT: HS256/RS256, 256-bit secret, 1hr access / 7d refresh tokens"),
    bullet("TLS 1.2+ required for all server communications"),
    pageBreak(),

    h1("9. Monitoring Setup"),
    h2("Alerting Rules"),
    makeTable(["Alert", "Condition", "Severity"], [
      ["High error rate", "> 5% 5xx over 5 min", "Critical"],
      ["Auth failure spike", "> 100 failed auth/min", "Warning"],
      ["DB pool exhaustion", "Utilization > 90%", "Critical"],
      ["S3 upload failures", "> 3 consecutive", "Warning"],
      ["Cert expiry", "< 14 days", "Warning"],
      ["Pod restarts", "> 3 in 10 min", "Critical"],
    ], [3000, 3200, 3160]),
    pageBreak(),

    h1("10. Backup & Recovery"),
    bullet("PostgreSQL: pg_dump daily + WAL archiving continuous, 30-day retention"),
    bullet("Recovery phrases are client-side only \u2014 IT cannot recover user vaults"),
    bullet("S3: Cross-region replication for disaster recovery"),
    pageBreak(),

    h1("11. Compliance"),
    bullet("NIST SP 800-63B: 15-char min password (exceeds 8-char requirement)"),
    bullet("FIPS 140-3: AES-256-GCM-SIV option (cipher_id 3)"),
    bullet("GDPR: Zero-knowledge architecture; server stores no personal file data"),
    pageBreak(),

    h1("12. Bulk USB Provisioning"),
    p("For large deployments: create master TOOLS image, write to drives via dd/Rufus, users set own passwords on first use."),
    pageBreak(),

    h1("13. Troubleshooting"),
    h2("Companion Won\u2019t Start"),
    bullet("Port 3001 in use: check for orphaned Node.js processes"),
    bullet("Permission denied: chmod +x launcher script (Linux/macOS)"),
    h2("USB Not Detected"),
    bullet("Try different port, check OS disk tools, verify user groups (Linux)"),
    h2("Permission Errors"),
    bullet("Windows: Run as Administrator"),
    bullet("macOS: System will prompt for sudo"),
    bullet("Linux: Configure udev rules for USB access"),

    new Paragraph({ spacing: { before: 600 } }),
    p([italic("Document generated March 15, 2026. USBVault Enterprise Edition v2.0.")]),
  ];

  const doc = new Document({
    styles: getStyles(), numbering: getNumbering(),
    sections: [{ properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 IT Deployment Guide", "INTERNAL") },
      footers: { default: makeFooter() }, children }]
  });
  await saveDoc(doc, "USBVault_Enterprise_IT_Deployment_Guide.docx");
}

// ─────────────────────── DOCUMENT 5: PRODUCT SPECIFICATION ───────────────────────

async function generateProductSpec() {
  console.log("Generating DOC-005: Product Specification...");
  const children = [
    ...titlePage("USBVault Enterprise", "Product Specification", "2.0", "March 15, 2026",
      "Product Managers, Stakeholders, Sales Engineers, Investors", "CONFIDENTIAL"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    h1("1. Product Vision & Mission"),
    p([bold("Mission: "), new TextRun("Carry sensitive files in your pocket, plug into any computer, access with a password, walk away leaving zero evidence.")]),
    p([bold("Promise: "), new TextRun("Engineered to intelligence-grade standards \u2014 made accessible to everyone.")]),
    h2("Guiding Principles"),
    makeTable(["Principle", "Status", "Description"], [
      ["PORTABLE", "Delivered", "No installation, double-click launcher, portable Node.js"],
      ["SECURE", "Delivered", "Argon2id (64 MiB) + XChaCha20 / AES-256-GCM-SIV, Rust core"],
      ["INVISIBLE", "Delivered", "Hidden partition, hidden attributes, encrypted filenames"],
      ["RESILIENT", "Delivered", "Dual-index atomic commits, commit counter, append-only"],
      ["SIMPLE", "Delivered", "Double-click \u2192 browser \u2192 password \u2192 done"],
      ["ZERO TRACE", "Delivered", "23 forensic cleaners, auto-clean on eject"],
      ["ZERO TRUST", "Partial", "Wrapped MEK delivered; cloud split-key V3.0"],
      ["PQC COMPLIANT", "Delivered", "ML-KEM-1024 + X25519 hybrid sealed boxes"],
    ], [2000, 1400, 5960]),
    pageBreak(),

    h1("2. Target Market"),
    makeTable(["Segment", "Key Need"], [
      ["Intelligence operatives", "Zero trace, hardware key, self-destruct"],
      ["Government & defense", "FIPS compliance, hidden partition, cross-platform"],
      ["Journalists", "Invisibility, plausible deniability, no installation"],
      ["Legal professionals", "Encryption, compliance, easy access"],
      ["Medical professionals", "Strong encryption, audit trail"],
      ["Corporate executives", "Enterprise management, sharing, sync"],
      ["Privacy-conscious citizens", "Ease of use, no cloud requirement"],
    ], [3200, 6160]),
    pageBreak(),

    h1("3. Feature Matrix by Tier"),
    makeTable(["Feature", "Free", "Individual", "Team", "Enterprise"], [
      ["Vaults", "1", "5", "50", "Unlimited"],
      ["Storage", "100 MB", "10 GB", "100 GB", "1 TB"],
      ["AES-256-GCM", "Yes", "Yes", "Yes", "Yes"],
      ["XChaCha20-Poly1305", "\u2014", "Yes", "Yes", "Yes"],
      ["ML-KEM-1024 (PQC)", "\u2014", "Yes", "Yes", "Yes"],
      ["Vault sharing", "\u2014", "\u2014", "Yes", "Yes"],
      ["Audit logging", "\u2014", "\u2014", "Yes", "Yes"],
      ["Priority support", "\u2014", "\u2014", "\u2014", "Yes"],
      ["Cloud sync", "\u2014", "Yes", "Yes", "Yes"],
      ["FIDO2 hardware key", "Yes", "Yes", "Yes", "Yes"],
      ["Zero-trace cleanup", "Yes", "Yes", "Yes", "Yes"],
    ], [2600, 1200, 1600, 1600, 2360]),
    pageBreak(),

    h1("4. Security Capabilities (12 Layers)"),
    makeTable(["Layer", "What It Does", "Status"], [
      ["Steganographic Delivery", "Hides vault inside ordinary files", "Planned V4.0"],
      ["Hardware Key (FIDO2)", "Physical key + password required", "Complete"],
      ["Cloud Split-Key", "Key split between device + cloud", "Planned V3.0"],
      ["Authenticated Encryption", "Every chunk individually sealed", "Complete"],
      ["Memory-Hard KDF", "64 MB RAM per guess attempt", "Complete"],
      ["Memory Protection", "Keys locked, guarded, auto-erased", "Complete"],
      ["Hidden Partition", "Storage invisible to OS", "Complete"],
      ["Hidden Attributes", "Vault file hidden from browsers", "Complete"],
      ["Encrypted Filenames", "Names encrypted, not just content", "Complete"],
      ["Zero-Trace Cleanup", "23 forensic artifacts removed", "Complete"],
      ["App Password", "Secondary gate with lockout", "Complete"],
      ["Crash-Safe Storage", "Dual backup index copies", "Complete"],
    ], [2600, 4560, 2200]),
    pageBreak(),

    h1("5. Platform Support"),
    makeTable(["Capability", "Windows 10+", "macOS 12+", "Linux"], [
      ["USB detection", "PowerShell", "diskutil", "lsblk"],
      ["Vault operations", "Full", "Full", "Full"],
      ["Zero-trace artifacts", "12 types", "6 types", "6 types"],
      ["Hidden partition", "attrib +H +S", "chflags hidden", "Unmount"],
      ["Browser support", "Chrome, Edge, Firefox", "Chrome, Safari, Firefox", "Chrome, Firefox"],
    ], [2200, 2400, 2400, 2360]),
    pageBreak(),

    h1("6. Roadmap"),
    h2("V3.0 \u2014 Cloud Split-Key"),
    p("MASTER_KEY = HKDF(LOCAL_KEY || REMOTE_KEY). Stolen USB alone cannot decrypt even with correct password. Offline grace period with configurable TTL."),
    h2("V4.0 \u2014 Advanced Security"),
    bullet("Steganographic embedding (hide vault in PNG/JPEG/WAV)"),
    bullet("Security tiers: SECRET / TOP-SECRET / PRESIDENTIAL"),
    bullet("Hardware key enforcement for TOP-SECRET+"),
    bullet("Duress password (triggers self-destruct, shows decoy)"),
    bullet("Secure file viewer with 90-second auto-wipe"),
    pageBreak(),

    h1("7. Competitive Differentiation"),
    bullet("Zero-installation portability \u2014 no admin rights for daily use"),
    bullet("Zero-trace forensic cleanup \u2014 23 artifact types, 3 platforms"),
    bullet("Post-quantum encryption \u2014 NIST ML-KEM-1024, shipping now"),
    bullet("Rust crypto core \u2014 memory-safe, hardware-speed, auto key zeroing"),
    bullet("Dual-mode \u2014 offline USB-only or cloud-connected, same vault"),
    bullet("Crash-safe vault \u2014 dual-index atomic commits with rollback protection"),

    new Paragraph({ spacing: { before: 600 } }),
    p([italic("USBVault Enterprise v2.0 \u2014 Intelligence-Grade Security for Everyone.")]),
  ];

  const doc = new Document({
    styles: getStyles(), numbering: getNumbering(),
    sections: [{ properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 Product Specification", "CONFIDENTIAL") },
      footers: { default: makeFooter() }, children }]
  });
  await saveDoc(doc, "USBVault_Enterprise_Product_Specification.docx");
}

// ─────────────────────── DOCUMENT 6: SECURITY AUDIT PACKAGE ───────────────────────

async function generateSecurityAudit() {
  console.log("Generating DOC-006: Security Audit Package...");
  const children = [
    ...titlePage("USBVault Enterprise", "Security Audit Package", "2.0", "March 15, 2026",
      "Third-Party Penetration Testers, Security Auditors", "CONFIDENTIAL"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    h1("1. Scope"),
    p("This audit covers all attack surfaces of USBVault Enterprise v2.0:"),
    bullet("Companion API (Node.js/Express) \u2014 19 REST endpoints, localhost:3001"),
    bullet("Web Application (TypeScript/React) \u2014 37-page SPA"),
    bullet("Rust Crypto Core \u2014 Argon2id, AEAD, streaming, PQC, vault header"),
    bullet("Go Server (cloud mode) \u2014 SRP-6a, JWT, FIDO2, Stripe, S3, WebSocket"),
    pageBreak(),

    h1("2. Architecture Overview"),
    makeTable(["Boundary", "Crosses", "Never Crosses"], [
      ["App \u2194 Rust FFI", "Password (once), encrypted bytes", "Derived keys, plaintext"],
      ["App \u2194 Companion", "Encrypted bytes, drive IDs", "Passwords, keys, plaintext"],
      ["App \u2194 Server", "Encrypted blobs, auth tokens", "Vault password, content, keys"],
      ["Companion \u2194 USB", "Raw encrypted bytes", "Keys, plaintext"],
    ], [2200, 3580, 3580]),
    pageBreak(),

    h1("3. Cryptographic Algorithms"),
    makeTable(["Function", "Algorithm", "Parameters"], [
      ["KDF", "Argon2id", "64 MiB, 3 iter, 4 parallel, 64B output"],
      ["Default AEAD", "XChaCha20-Poly1305", "256-bit key, 192-bit nonce, 128-bit tag"],
      ["FIPS AEAD", "AES-256-GCM-SIV", "256-bit key, 96-bit nonce, 128-bit tag"],
      ["Integrity", "HMAC-SHA256", "Domain-separated for header and fail counter"],
      ["PQC KEM", "X25519 + ML-KEM-1024", "HKDF combination, feature-gated"],
      ["App password", "PBKDF2-SHA256", "150,000 iterations"],
    ], [2200, 3200, 3960]),
    h2("Audit Points"),
    bullet("Verify Argon2id parameters not weakened by untrusted input"),
    bullet("Verify per-chunk nonce derivation prevents reuse"),
    bullet("Verify constant-time comparison for all tag/HMAC verification"),
    bullet("Verify HMAC computation zeroes HMAC field first"),
    bullet("Verify PQC HKDF uses proper domain separation"),
    pageBreak(),

    h1("4. Key Lifecycle"),
    makeTable(["Phase", "Action", "Verify"], [
      ["Generation", "MEK from OS CSPRNG (32 bytes)", "CSPRNG source verified"],
      ["Derivation", "Password + salt \u2192 Argon2id", "Params not user-configurable"],
      ["Wrapping", "AEAD_encrypt(KEK, MEK)", "Ciphertext is authenticated"],
      ["Unwrapping", "AEAD_decrypt(KEK, wrapped)", "Auth checked before use"],
      ["Usage", "MEK encrypts file data + index", "MEK never leaves Rust FFI"],
      ["Rotation", "New KEK wraps existing MEK", "Old wrapped_mek overwritten"],
      ["Zeroing", "Zeroize on drop, mlock", "Memory dumps show no residual"],
      ["Self-destruct", "3-pass overwrite of wrapped_mek", "All 3 passes + fsync verified"],
    ], [2000, 3580, 3780]),
    pageBreak(),

    h1("5. Authentication Flows"),
    h2("5.1 SRP-6a"),
    p("Server NEVER receives password. Flow: username \u2192 salt+B \u2192 A+M1 \u2192 verify M1, return M2+JWT \u2192 verify M2."),
    bullet("Verify timing-safe M1 comparison"),
    bullet("Verify server rejects A = 0 (mod N)"),
    h2("5.2 FIDO2/WebAuthn"),
    p("Registration with PRF/hmac-secret extension. Authentication XORs PRF output into key derivation."),
    bullet("Verify origin validation and RP ID matching"),
    bullet("Verify user verification flag"),
    pageBreak(),

    h1("6. Input Validation"),
    makeTable(["Input", "Validation"], [
      ["Drive ID", "Alphanumeric + hyphens, max 128 chars"],
      ["Vault name", "UTF-8, max 128 chars, no path separators"],
      ["File paths", "Canonicalized, within SECURE mount point"],
      ["Byte offsets", "Non-negative, within VAULT.bin bounds"],
      ["Mount points", "Verified against OS-reported mounts"],
    ], [3000, 6360]),
    pageBreak(),

    h1("7. Rate Limiting"),
    makeTable(["Category", "Limit", "Scope"], [
      ["Companion general", "60 req/min", "Per client (localhost)"],
      ["Companion destructive", "5 req/min", "Per client"],
      ["Server auth", "Configurable (rec: 10/min)", "Per IP"],
      ["Server API", "Configurable per tier", "Per user"],
    ], [3000, 3200, 3160]),
    pageBreak(),

    h1("8. Memory Security"),
    makeTable(["Mechanism", "Implementation", "Purpose"], [
      ["Zeroize on drop", "zeroize crate", "Clear key material when dropped"],
      ["mlock", "Platform-specific", "Prevent paging to swap/disk"],
      ["Guard pages", "mmap PROT_NONE", "Detect buffer overflows"],
      ["Constant-time", "subtle crate", "Prevent timing side-channels"],
    ], [2600, 3200, 3560]),
    pageBreak(),

    h1("9. Known Limitations"),
    bullet("No process isolation in browser tab context"),
    bullet("Anti-debug measures trivially bypassable in web"),
    bullet("No TLS on localhost companion (encrypted bytes only)"),
    bullet("Password briefly in JS memory during KDF (GC limits zeroization)"),
    bullet("Clipboard exposure if users copy-paste password"),
    bullet("Recovery phrase visible in browser (screenshot risk)"),
    pageBreak(),

    h1("10. Threat Model"),
    makeTable(["#", "Threat", "Likelihood", "Mitigation"], [
      ["T1", "Brute-force", "Medium", "Argon2id + backoff + self-destruct"],
      ["T2", "Header tamper", "Low", "HMAC-SHA256, domain separation"],
      ["T3", "Nonce reuse", "Very Low", "24B nonces, HKDF, runtime detection"],
      ["T4", "Memory dump", "Low", "mlock, guard pages, Zeroize"],
      ["T5", "Quantum", "Low (future)", "ML-KEM-1024 + X25519 hybrid"],
      ["T6", "Index corrupt", "Medium", "Dual-index, atomic commits"],
      ["T7", "Weak password", "Medium", "15-char, bloom filter, HIBP"],
      ["T8", "Forensic recovery", "Medium", "23 cleaners, auto-clean"],
      ["T9", "Rollback", "Low", "Monotonic counter, state_version"],
      ["T10", "USB intercept", "Medium", "Encrypted at rest, hidden"],
      ["T11", "Companion abuse", "Low", "Localhost, CORS, rate limit"],
      ["T12", "Supply chain", "Low", "cargo-audit, gosec, npm audit"],
      ["T13", "Side-channel", "Low", "Constant-time (subtle)"],
    ], [500, 1800, 1600, 5460]),
    pageBreak(),

    h1("11. SAST/DAST Results"),
    makeTable(["Tool", "Target", "Result"], [
      ["cargo-audit", "Rust dependencies", "Clean"],
      ["clippy (pedantic)", "Rust source", "Clean"],
      ["gosec", "Go source", "Clean"],
      ["npm audit", "Node.js dependencies", "Clean"],
      ["Snyk", "All subsystems", "Clean"],
    ], [2600, 3200, 3560]),
    pageBreak(),

    h1("12. Test Coverage"),
    makeTable(["Subsystem", "Tests", "Key Areas"], [
      ["Rust", "234", "KDF, AEAD, streaming, header, index, PQC, SRP"],
      ["TypeScript", "45 files", "UI flows, state, crypto bridge"],
      ["Go", "61 files", "Auth, billing, sharing, BOLA"],
      ["Total", "340 files", "All passing"],
    ], [2200, 1800, 5360]),

    new Paragraph({ spacing: { before: 600 } }),
    p([italic("Provide to penetration testers under NDA. March 15, 2026.")]),
  ];

  const doc = new Document({
    styles: getStyles(), numbering: getNumbering(),
    sections: [{ properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 Security Audit Package", "CONFIDENTIAL") },
      footers: { default: makeFooter() }, children }]
  });
  await saveDoc(doc, "USBVault_Enterprise_Security_Audit_Package.docx");
}

// ─────────────────────── DOCUMENT 7: RECOVERY PROCEDURES ───────────────────────

async function generateRecovery() {
  console.log("Generating DOC-007: Recovery Procedures...");
  const children = [
    ...titlePage("USBVault Enterprise", "Recovery Procedures", "2.0", "March 15, 2026",
      "End Users, IT Support Staff", "INTERNAL"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    pageBreak(),

    h1("1. Recovery Phrase"),
    p("Your 24-word BIP39 recovery phrase is the ONLY backup for your vault. It is shown once at vault creation and cannot be retrieved later."),
    h2("Storage Recommendations"),
    bullet("Write on paper (not digitally)"),
    bullet("Store in a safe, locked drawer, or safety deposit box"),
    bullet("Do NOT store on your computer, phone, email, or cloud"),
    bullet("Do NOT photograph (photos auto-sync to cloud)"),
    bullet("Do NOT store on the same USB drive as your vault"),
    bullet("Consider copies in two separate secure locations"),
    h2("If Lost"),
    p("If you lose your recovery phrase AND forget your password, your data is permanently and irrecoverably lost. This is a fundamental security property."),
    pageBreak(),

    h1("2. Forgotten Master Password"),
    h2("With Recovery Phrase"),
    numbered("Launch USBVault, click 'Forgot Password'"),
    numbered("Enter all 24 words in exact order"),
    numbered("Choose new master password (min 15 characters)"),
    numbered("Vault re-keyed with new KEK wrapping existing MEK (fast, O(1))"),
    numbered("NEW recovery phrase generated \u2014 write it down immediately"),
    h2("Without Recovery Phrase"),
    p("Data cannot be recovered. Create a new vault. Cloud data exists but cannot be decrypted."),
    pageBreak(),

    h1("3. Lost FIDO2 Hardware Key"),
    p("A recovery blob (AES-GCM-SIV encrypted with password-derived key) is stored in the vault header at enrollment time."),
    numbered("Enter master password as usual"),
    numbered("Click 'Lost your key?' when prompted for hardware key"),
    numbered("Recovery blob bypasses hardware key requirement"),
    numbered("Go to Settings \u2192 Security \u2192 remove lost key, enroll new key"),
    p("If you\u2019ve also forgotten your password, use the recovery phrase first."),
    pageBreak(),

    h1("4. Corrupted Vault"),
    h2("Automatic Recovery (Dual-Index Fallback)"),
    p("USBVault maintains two index slots. If the active index is corrupted (e.g., interrupted write), it automatically falls back to the backup slot."),
    numbered("Launch USBVault, enter password"),
    numbered("Corruption detected on active index"),
    numbered("Automatic fallback to backup index"),
    numbered("Most recent operation may be lost; all prior data intact"),
    h2("Both Indexes Corrupted"),
    p("Extremely unlikely (requires two consecutive interrupted writes). Contact support for index reconstruction. Cloud backup restore is the primary recovery path."),
    h2("Commit Counter Mismatch (ROLLBACK_DETECTED)"),
    p("May indicate corruption or deliberate rollback attack. Vault refuses to open. If false positive (e.g., restored from older backup), contact support."),
    pageBreak(),

    h1("5. USB Drive Failure"),
    h2("Cloud-Connected (Backup Available)"),
    numbered("Obtain new USB drive"),
    numbered("Login with cloud credentials"),
    numbered("Select 'Restore Vault' \u2192 choose new drive"),
    numbered("Encrypted data downloaded from S3, restored to new SECURE partition"),
    numbered("Verify with vault password"),
    h2("USB-Only (No Backup)"),
    p("Data is permanently lost. Prevention: use cloud mode or manually back up VAULT.bin to separate secure storage."),
    pageBreak(),

    h1("6. Self-Destruct Triggered"),
    p("After 10 wrong passwords, the wrapped MEK is destroyed with a 3-pass overwrite (random \u2192 zeros \u2192 random). This is permanent and by design."),
    h2("Recovery Options"),
    bullet("From cloud backup: restore vault (including wrapped MEK) to new drive"),
    bullet("From manual backup: restore saved VAULT.bin with intact wrapped MEK"),
    bullet("No backup: data is permanently lost (intended security outcome)"),
    pageBreak(),

    h1("7. Wrong Password Lockout"),
    h2("Exponential Backoff Schedule"),
    makeTable(["Attempt", "Wait Time"], [
      ["1", "2 seconds"], ["2", "4 seconds"], ["3", "8 seconds"],
      ["4", "16 seconds"], ["5", "32 seconds"], ["6", "64 seconds"],
      ["7", "128 seconds"], ["8", "256 seconds"], ["9", "512 seconds"],
      ["10", "SELF-DESTRUCT"],
    ], [4680, 4680]),
    p("At 8+ failures: STOP guessing. Use your recovery phrase instead. The fail counter is HMAC-protected and stored on the USB \u2014 switching browsers/computers does NOT reset it."),
    pageBreak(),

    h1("8. Vault Not Detected"),
    numbered("Verify USB connected (check OS disk tools)"),
    numbered("Check TOOLS partition is visible as normal drive"),
    numbered("Verify SECURE partition exists (diskutil list / Disk Management / lsblk)"),
    numbered("Try USBVault 'Mount Secure' function"),
    numbered("Verify VAULT.bin exists on SECURE partition root"),
    pageBreak(),

    h1("9. Companion Service Won\u2019t Start"),
    h2("Port 3001 In Use"),
    bullet("Windows: Task Manager \u2192 find/kill Node.js processes"),
    bullet("macOS/Linux: lsof -i :3001 \u2192 kill process"),
    h2("Permission Issues"),
    bullet("chmod +x launcher script (macOS/Linux)"),
    bullet("macOS: right-click \u2192 Open to bypass Gatekeeper"),
    h2("Other"),
    bullet("Firewall: whitelist 127.0.0.1:3001"),
    bullet("Antivirus: whitelist TOOLS partition"),
    pageBreak(),

    h1("10. Cross-Platform Issues"),
    p("Vaults are fully cross-platform (ExFAT, platform-independent binary format, UTF-8)."),
    h2("Potential Issues"),
    bullet("Older Linux: install exfat-fuse (kernel 5.4+ has native support)"),
    bullet("macOS .DS_Store/.Trashes on TOOLS partition: harmless"),
    bullet("Windows hidden attributes not recognized on Linux: cosmetic only, data encrypted"),

    new Paragraph({ spacing: { before: 600 } }),
    p([bold("NEVER share your password or recovery phrase with support staff."), new TextRun(" USBVault will never ask for them.")]),
    new Paragraph({ spacing: { before: 200 } }),
    p([italic("Keep this document accessible separately from your vault. March 15, 2026.")]),
  ];

  const doc = new Document({
    styles: getStyles(), numbering: getNumbering(),
    sections: [{ properties: pageProps(),
      headers: { default: makeHeader("USBVault Enterprise \u2014 Recovery Procedures", "INTERNAL") },
      footers: { default: makeFooter() }, children }]
  });
  await saveDoc(doc, "USBVault_Enterprise_Recovery_Procedures.docx");
}

// ─────────────────────── MAIN ───────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  USBVault Enterprise — Document Generation Suite");
  console.log("  Generating 7 professional .docx documents...");
  console.log("═══════════════════════════════════════════════════════\n");

  await generateTechSpec();
  await generateArchitecture();
  await generateUserManual();
  await generateITGuide();
  await generateProductSpec();
  await generateSecurityAudit();
  await generateRecovery();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  All 7 documents generated successfully!");
  console.log("═══════════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
