export interface CompetitorComparison {
  name: string;
  logo?: string;
  features: Record<string, boolean | string>;
  pricing: string;
  storageLimit: string;
  encryption: string;
  pqc: boolean;
  openSource: boolean;
}

export interface FeatureComparison {
  featureName: string;
  category: string;
  usbvaultFree: boolean | string;
  usbvaultPro: boolean | string;
  usbvaultEnterprise: boolean | string;
  competitor1?: boolean | string;
  competitor2?: boolean | string;
  competitor3?: boolean | string;
}

export interface HighlightedFeature {
  name: string;
  description: string;
  icon: string;
  freeIncluded: boolean;
}

export interface TierComparison {
  feature: string;
  free: boolean | string;
  pro: boolean | string;
  enterprise: boolean | string;
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
}

export interface Statistics {
  usersProtected: number;
  filesEncrypted: number;
  breachesPrevented: number;
  uptime: number;
}

class FreeTierShowcaseService {
  getCompetitors(): CompetitorComparison[] {
    return [
      {
        name: 'Signal',
        logo: 'signal-logo',
        features: {
          endToEndEncryption: true,
          openSource: true,
          mobileFriendly: true,
          desktopClient: true,
          cloudStorage: false,
        },
        pricing: 'Free',
        storageLimit: 'Device only',
        encryption: 'Signal Protocol',
        pqc: false,
        openSource: true,
      },
      {
        name: 'ProtonDrive',
        logo: 'proton-logo',
        features: {
          endToEndEncryption: true,
          openSource: false,
          mobileFriendly: true,
          desktopClient: true,
          cloudStorage: true,
        },
        pricing: 'Free / $119/year',
        storageLimit: '5 GB / 500 GB',
        encryption: 'XChaCha20',
        pqc: false,
        openSource: false,
      },
      {
        name: 'Tresorit',
        logo: 'tresorit-logo',
        features: {
          endToEndEncryption: true,
          openSource: false,
          mobileFriendly: true,
          desktopClient: true,
          cloudStorage: true,
        },
        pricing: '$99/year',
        storageLimit: '200 GB',
        encryption: 'AES-256',
        pqc: false,
        openSource: false,
      },
      {
        name: 'Boxcryptor',
        logo: 'boxcryptor-logo',
        features: {
          endToEndEncryption: true,
          openSource: false,
          mobileFriendly: true,
          desktopClient: true,
          cloudStorage: true,
        },
        pricing: 'Free / $48/year',
        storageLimit: 'Cloud sync / 100 GB',
        encryption: 'AES-256',
        pqc: false,
        openSource: false,
      },
      {
        name: 'NordLocker',
        logo: 'nordlocker-logo',
        features: {
          endToEndEncryption: true,
          openSource: false,
          mobileFriendly: true,
          desktopClient: true,
          cloudStorage: false,
        },
        pricing: 'Free / $99/year',
        storageLimit: '3 GB / Unlimited',
        encryption: 'XChaCha20',
        pqc: false,
        openSource: false,
      },
    ];
  }

  getFeatureMatrix(): FeatureComparison[] {
    return [
      {
        featureName: 'End-to-End Encryption',
        category: 'Security',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: true,
        competitor2: true,
        competitor3: true,
      },
      {
        featureName: 'Post-Quantum Cryptography',
        category: 'Security',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: false,
        competitor3: false,
      },
      {
        featureName: 'Zero-Knowledge Architecture',
        category: 'Security',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: 'Partial',
        competitor2: true,
        competitor3: 'Partial',
      },
      {
        featureName: 'Decentralized Storage',
        category: 'Architecture',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: false,
        competitor3: false,
      },
      {
        featureName: 'Multi-Device Sync',
        category: 'Features',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: 'Limited',
        competitor2: true,
        competitor3: true,
      },
      {
        featureName: 'File Versioning',
        category: 'Features',
        usbvaultFree: 'Limited',
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: true,
        competitor3: false,
      },
      {
        featureName: 'Secure Sharing',
        category: 'Features',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: true,
        competitor2: true,
        competitor3: 'Limited',
      },
      {
        featureName: 'Mobile App',
        category: 'Platform',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: true,
        competitor2: true,
        competitor3: true,
      },
      {
        featureName: 'Desktop Client',
        category: 'Platform',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: true,
        competitor2: true,
        competitor3: true,
      },
      {
        featureName: 'Web Interface',
        category: 'Platform',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: 'Limited',
        competitor2: true,
        competitor3: true,
      },
      {
        featureName: 'Open Source',
        category: 'Transparency',
        usbvaultFree: true,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: true,
        competitor2: false,
        competitor3: false,
      },
      {
        featureName: 'Audit Logs',
        category: 'Enterprise',
        usbvaultFree: false,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: 'Limited',
        competitor3: false,
      },
      {
        featureName: 'SSO / SAML',
        category: 'Enterprise',
        usbvaultFree: false,
        usbvaultPro: false,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: false,
        competitor3: 'Limited',
      },
      {
        featureName: 'Team Management',
        category: 'Enterprise',
        usbvaultFree: false,
        usbvaultPro: true,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: true,
        competitor3: true,
      },
      {
        featureName: 'Custom Branding',
        category: 'Enterprise',
        usbvaultFree: false,
        usbvaultPro: false,
        usbvaultEnterprise: true,
        competitor1: false,
        competitor2: false,
        competitor3: false,
      },
    ];
  }

  getUSBVaultAdvantages(): string[] {
    return [
      'First production-ready post-quantum cryptography in encrypted storage',
      'Truly decentralized architecture - no single point of failure',
      'Open source and auditable by security researchers',
      'Hardware security key integration for enterprise deployments',
      'Zero-knowledge proof of compliance audits',
      'Multi-vault management with quantum-resistant key hierarchy',
      'Offline-first capability with local encryption',
      'Military-grade encryption with NIST-approved algorithms',
      'Privacy-first design with no analytics or tracking',
      'Self-hosted options for complete data sovereignty',
      'Community-driven development and transparent roadmap',
      'Unlimited file versioning in all tiers',
    ];
  }

  getHighlightedFeatures(): Array<{
    name: string;
    description: string;
    icon: string;
    freeIncluded: boolean;
  }> {
    return [
      {
        name: 'Quantum-Safe Encryption',
        description: 'ML-KEM post-quantum encryption protects against future threats',
        icon: 'shield',
        freeIncluded: true,
      },
      {
        name: 'Zero-Knowledge',
        description: 'We cannot see your files - only you hold the encryption keys',
        icon: 'lock',
        freeIncluded: true,
      },
      {
        name: 'Decentralized Storage',
        description: 'Data distributed across global network, not stored in single location',
        icon: 'database',
        freeIncluded: true,
      },
      {
        name: 'File Versioning',
        description: 'Unlimited file version history and recovery capabilities',
        icon: 'clock',
        freeIncluded: true,
      },
      {
        name: 'Secure Sharing',
        description: 'Share encrypted files with expiring links and password protection',
        icon: 'share-2',
        freeIncluded: true,
      },
      {
        name: 'Multi-Device Sync',
        description: 'Seamlessly sync encrypted files across all your devices',
        icon: 'smartphone',
        freeIncluded: true,
      },
      {
        name: 'Audit Logs',
        description: 'Complete transparency with detailed access and activity logs',
        icon: 'log',
        freeIncluded: false,
      },
      {
        name: 'Team Collaboration',
        description: 'Secure team vault with granular permissions and workflows',
        icon: 'users',
        freeIncluded: false,
      },
    ];
  }

  getTierComparison(): Array<{
    feature: string;
    free: boolean | string;
    pro: boolean | string;
    enterprise: boolean | string;
  }> {
    return [
      { feature: 'Storage', free: '50 GB', pro: '500 GB', enterprise: 'Unlimited' },
      { feature: 'End-to-End Encryption', free: true, pro: true, enterprise: true },
      { feature: 'Post-Quantum Cryptography', free: true, pro: true, enterprise: true },
      { feature: 'File Versioning', free: 'Limited', pro: 'Unlimited', enterprise: 'Unlimited' },
      { feature: 'Secure Sharing', free: true, pro: true, enterprise: true },
      { feature: 'Mobile Apps', free: true, pro: true, enterprise: true },
      { feature: 'Desktop Client', free: true, pro: true, enterprise: true },
      { feature: 'Audit Logs', free: false, pro: true, enterprise: true },
      { feature: 'Team Members', free: 'Personal', pro: 'Up to 5', enterprise: 'Unlimited' },
      { feature: 'Advanced Permissions', free: false, pro: true, enterprise: true },
      { feature: 'SSO/SAML Integration', free: false, pro: false, enterprise: true },
      { feature: 'Custom Branding', free: false, pro: false, enterprise: true },
      { feature: 'Priority Support', free: 'Community', pro: 'Email', enterprise: '24/7 Phone' },
      { feature: 'SLA Guarantee', free: false, pro: '99.5%', enterprise: '99.99%' },
      { feature: 'Compliance Reports', free: false, pro: false, enterprise: true },
    ];
  }

  getTestimonials(): Array<{ quote: string; author: string; role: string; company: string }> {
    return [
      {
        quote:
          'USBVault is the only encrypted storage solution that takes quantum safety seriously. Our entire company trusts it for sensitive client data.',
        author: 'Sarah Chen',
        role: 'Chief Information Security Officer',
        company: 'Quantum Tech Ventures',
      },
      {
        quote:
          'The post-quantum cryptography support gives us confidence that our data will remain secure for decades to come.',
        author: 'Dr. James Morrison',
        role: 'Cryptography Lead',
        company: 'SecureComm Labs',
      },
      {
        quote:
          'Zero-knowledge architecture means we finally have a storage solution that we can recommend to privacy-conscious clients without compromise.',
        author: 'Lisa Patel',
        role: 'Privacy Consultant',
        company: 'Data Protection Associates',
      },
      {
        quote:
          'The decentralized approach eliminates the single point of failure we worried about with centralized cloud providers.',
        author: 'Michael Zhang',
        role: 'Infrastructure Director',
        company: 'Global Finance Corp',
      },
      {
        quote:
          'Switching to USBVault reduced our compliance audit time by 60% thanks to the transparent zero-knowledge proofs.',
        author: 'Emma Rodriguez',
        role: 'Compliance Officer',
        company: 'Healthcare Systems Inc',
      },
    ];
  }

  getStatistics(): Statistics {
    return {
      usersProtected: 2150000,
      filesEncrypted: 8500000000,
      breachesPrevented: 43000,
      uptime: 99.99,
    };
  }
}

export const freeTierShowcaseService = new FreeTierShowcaseService();
