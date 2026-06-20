// ── Navigation ──────────────────────────────────────────

export interface NavLink {
  label: string;
  href: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

// ── Features ────────────────────────────────────────────

export interface Feature {
  icon: string;
  title: string;
  description: string;
  accent: string;
}

export const FEATURES: Feature[] = [
  {
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    title: "Post-Quantum Encryption",
    description:
      "Your data protected by ML-KEM-1024, the NIST-approved post-quantum key encapsulation mechanism. Future-proof against quantum computers.",
    accent: "#753cff",
  },
  {
    icon: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
    title: "Zero-Knowledge Architecture",
    description:
      "All encryption and decryption happens on your device. We never see your plaintext data, keys, or passwords. Ever.",
    accent: "#22D3EE",
  },
  {
    icon: "M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01",
    title: "USB Vault Management",
    description:
      "Encrypt files and carry them on USB. Hardware-isolated storage with military-grade protection you can hold in your hand.",
    accent: "#D946EF",
  },
  {
    icon: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13M8 12l-4 4M16 12l4 4",
    title: "Secure Sharing",
    description:
      "Share encrypted files with contacts using end-to-end encryption. X25519 key exchange ensures only the intended recipient can decrypt.",
    accent: "#22D3EE",
  },
  {
    icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
    title: "Password Manager",
    description:
      "Store passwords with Argon2id-derived encryption. Auto-fill, generate strong passwords, and sync across devices securely.",
    accent: "#753cff",
  },
  {
    icon: "M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z",
    title: "Cross-Platform",
    description:
      "One vault, everywhere. iOS, Android, and Web \u2014 with the same zero-knowledge encryption on every platform.",
    accent: "#D946EF",
  },
];

// ── How It Works ────────────────────────────────────────

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
}

export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    step: 1,
    title: "Create Your Vault",
    description:
      "Set up your encrypted vault with a master password. Argon2id derives your encryption keys locally.",
  },
  {
    step: 2,
    title: "Encrypt & Store",
    description:
      "Add files, passwords, and notes. AES-256-GCM-SIV encrypts everything before it leaves your device.",
  },
  {
    step: 3,
    title: "Access Anywhere",
    description:
      "Open your vault on any platform. Your encrypted data syncs securely, decrypted only on your devices.",
  },
];

// ── Pricing ─────────────────────────────────────────────

export interface PricingTier {
  name: string;
  monthly: string;
  annual: string;
  annualTotal?: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  badge?: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    name: "Free",
    monthly: "$0",
    annual: "$0/yr",
    features: [
      "End-to-End Encryption",
      "Password Manager (10)",
      "Encrypted Messaging",
      "Secure File Sharing",
      "FIDO2 Authentication",
      "Biometric Auth",
      "1 GB Storage",
      "3 Vaults",
    ],
    cta: "Get Started Free",
    highlighted: false,
  },
  {
    name: "Pro",
    monthly: "$9.99/mo",
    annual: "$7.99/mo",
    annualTotal: "$95.88/yr",
    features: [
      "Everything in Free",
      "Ghost Messages",
      "Backup & Restore",
      "Recovery Phrase",
      "Key Verification",
      "Zero-Trace Cleanup",
      "Priority Support",
      "50 GB Storage",
      "20 Vaults",
    ],
    cta: "Upgrade to Pro",
    highlighted: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    monthly: "Custom",
    annual: "Custom",
    features: [
      "Everything in Pro",
      "Unlimited Storage",
      "Custom Encryption Policies",
      "SSO Integration",
      "Advanced Analytics",
      "Dedicated Support",
      "Enterprise QR Codes",
      "Audit Log Export",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

// ── Security Badges ─────────────────────────────────────

export interface SecurityBadge {
  label: string;
  sublabel: string;
  tooltip: string;
}

export const SECURITY_BADGES: SecurityBadge[] = [
  {
    label: "ML-KEM-1024",
    sublabel: "FIPS 203",
    tooltip:
      "NIST Post-Quantum Cryptography Standard for key encapsulation",
  },
  {
    label: "AES-256-GCM-SIV",
    sublabel: "NIST Standard",
    tooltip: "Nonce-misuse resistant authenticated encryption",
  },
  {
    label: "Argon2id",
    sublabel: "Memory-Hard KDF",
    tooltip: "64 MB memory, 3 iterations \u2014 resistant to GPU/ASIC attacks",
  },
  {
    label: "FIDO2",
    sublabel: "WebAuthn",
    tooltip: "Hardware security key authentication, phishing-resistant",
  },
  {
    label: "Ed25519",
    sublabel: "Identity Signing",
    tooltip: "Elliptic curve digital signatures for identity verification",
  },
  {
    label: "Zero-Knowledge",
    sublabel: "Client-Side Only",
    tooltip: "All cryptographic operations happen on your device",
  },
];

// ── FAQ ─────────────────────────────────────────────────

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What encryption does USBVault use?",
    answer:
      "USBVault uses ML-KEM-1024 (FIPS 203) for post-quantum key encapsulation, AES-256-GCM-SIV for authenticated encryption, and Argon2id for key derivation. All cryptographic operations run in our audited Rust core, compiled natively for each platform.",
  },
  {
    question: "Is USBVault truly zero-knowledge?",
    answer:
      "Yes. All encryption and decryption happens exclusively on your device. Your master password, encryption keys, and plaintext data never leave your device and are never transmitted to our servers.",
  },
  {
    question: "What platforms are supported?",
    answer:
      "USBVault is available on iOS, Android, and Web. The same zero-knowledge encryption protects your data on every platform. Desktop native apps for macOS, Windows, and Linux are on the roadmap.",
  },
  {
    question: "Can I use USBVault without internet?",
    answer:
      "Yes. USBVault is offline-first. Your vault is stored locally and encrypted on-device. Internet is only needed for syncing across devices, sharing, and account management.",
  },
  {
    question: "What happens if I lose my password?",
    answer:
      "During setup, you receive a recovery phrase. This is the only way to recover your vault if you forget your password. We cannot recover your data \u2014 that\u2019s the zero-knowledge guarantee.",
  },
  {
    question: "Is USBVault open source?",
    answer:
      "Our Rust cryptographic core is open for audit. The client applications and server components follow a source-available model. We believe transparency builds trust.",
  },
  {
    question: "How does Enterprise pricing work?",
    answer:
      "Enterprise plans include custom encryption policies, SSO integration, dedicated support, and unlimited storage. Contact us at ultimatepqcshield@gmail.com for a tailored quote.",
  },
];

// ── Testimonials ────────────────────────────────────────

export interface Testimonial {
  name: string;
  title: string;
  company: string;
  quote: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Alex Rivera",
    title: "Chief Security Officer",
    company: "SecureNet Inc.",
    quote:
      "USBVault\u2019s post-quantum encryption gives us confidence that our sensitive data is protected against both current and future threats.",
  },
  {
    name: "Dr. Sarah Chen",
    title: "Research Director",
    company: "Quantum Labs",
    quote:
      "As cryptography researchers, we scrutinize every tool we use. USBVault\u2019s zero-knowledge architecture and ML-KEM-1024 implementation are genuinely impressive.",
  },
  {
    name: "Marcus Thompson",
    title: "IT Director",
    company: "Global Finance Corp",
    quote:
      "Rolling out USBVault Enterprise across our organization was seamless. The SSO integration and audit logging are exactly what we needed for compliance.",
  },
];
