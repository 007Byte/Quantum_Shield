/**
 * Help screen static data constants.
 */

import type { GettingStartedItem, SecurityResource } from './types';
import type { TicketCategory } from '@/services/supportService';

// ── FAQ Data (keys resolved via t() at render time) ────────────

export const faqItemKeys = [
  { id: 'pqc-protection', questionKey: 'help.faq1q', answerKey: 'help.faq1a' },
  { id: 'recovery-phrase', questionKey: 'help.faq2q', answerKey: 'help.faq2a' },
  { id: 'master-password', questionKey: 'help.faq3q', answerKey: 'help.faq3a' },
  { id: 'multiple-devices', questionKey: 'help.faq4q', answerKey: 'help.faq4a' },
  { id: 'encryption-algorithms', questionKey: 'help.faq5q', answerKey: 'help.faq5a' },
  { id: 'security-audit', questionKey: 'help.faq6q', answerKey: 'help.faq6a' },
];

// ── Getting Started Guides with step-by-step content ──

export const gettingStartedItems: GettingStartedItem[] = [
  {
    id: 'encrypt',
    icon: 'lock',
    labelKey: 'help.gsLabel1',
    descKey: 'help.gsDesc1',
    color: 'rgba(34,211,238,1)',
    steps: [
      { stepKey: 'help.gs1Step1', detailKey: 'help.gs1Detail1' },
      { stepKey: 'help.gs1Step2', detailKey: 'help.gs1Detail2' },
      { stepKey: 'help.gs1Step3', detailKey: 'help.gs1Detail3' },
      { stepKey: 'help.gs1Step4', detailKey: 'help.gs1Detail4' },
      { stepKey: 'help.gs1Step5', detailKey: 'help.gs1Detail5' },
    ],
  },
  {
    id: 'manage',
    icon: 'folder',
    labelKey: 'help.gsLabel2',
    descKey: 'help.gsDesc2',
    color: 'rgba(139,92,246,1)',
    steps: [
      { stepKey: 'help.gs2Step1', detailKey: 'help.gs2Detail1' },
      { stepKey: 'help.gs2Step2', detailKey: 'help.gs2Detail2' },
      { stepKey: 'help.gs2Step3', detailKey: 'help.gs2Detail3' },
      { stepKey: 'help.gs2Step4', detailKey: 'help.gs2Detail4' },
    ],
  },
  {
    id: 'share',
    icon: 'share-2',
    labelKey: 'help.gsLabel3',
    descKey: 'help.gsDesc3',
    color: 'rgba(34,197,94,1)',
    steps: [
      { stepKey: 'help.gs3Step1', detailKey: 'help.gs3Detail1' },
      { stepKey: 'help.gs3Step2', detailKey: 'help.gs3Detail2' },
      { stepKey: 'help.gs3Step3', detailKey: 'help.gs3Detail3' },
      { stepKey: 'help.gs3Step4', detailKey: 'help.gs3Detail4' },
    ],
  },
  {
    id: 'passwords',
    icon: 'key',
    labelKey: 'help.gsLabel4',
    descKey: 'help.gsDesc4',
    color: 'rgba(245,158,11,1)',
    steps: [
      { stepKey: 'help.gs4Step1', detailKey: 'help.gs4Detail1' },
      { stepKey: 'help.gs4Step2', detailKey: 'help.gs4Detail2' },
      { stepKey: 'help.gs4Step3', detailKey: 'help.gs4Detail3' },
      { stepKey: 'help.gs4Step4', detailKey: 'help.gs4Detail4' },
      { stepKey: 'help.gs4Step5', detailKey: 'help.gs4Detail5' },
    ],
  },
  {
    id: 'pqc',
    icon: 'cpu',
    labelKey: 'help.gsLabel5',
    descKey: 'help.gsDesc5',
    color: 'rgba(168,85,247,1)',
    steps: [
      { stepKey: 'help.gs5Step1', detailKey: 'help.gs5Detail1' },
      { stepKey: 'help.gs5Step2', detailKey: 'help.gs5Detail2' },
      { stepKey: 'help.gs5Step3', detailKey: 'help.gs5Detail3' },
      { stepKey: 'help.gs5Step4', detailKey: 'help.gs5Detail4' },
      { stepKey: 'help.gs5Step5', detailKey: 'help.gs5Detail5' },
    ],
  },
];

// ── Security Resources with real URLs ──

export const securityResourceItems: SecurityResource[] = [
  {
    id: 'whitepaper',
    icon: 'file-text',
    labelKey: 'help.srLabel1',
    descKey: 'help.srDesc1',
    url: 'https://usbvault.io/security',
  },
  {
    id: 'defense',
    icon: 'layers',
    labelKey: 'help.srLabel2',
    descKey: 'help.srDesc2',
    url: 'https://usbvault.io/audit',
  },
  {
    id: 'recovery',
    icon: 'shield',
    labelKey: 'help.srLabel3',
    descKey: 'help.srDesc3',
    url: 'https://usbvault.io/pqc-guide',
  },
];

// ── Ticket categories & priorities ──

export const CATEGORY_I18N: Record<string, string> = {
  bug: 'help.categoryBug',
  feature: 'help.categoryFeature',
  security: 'help.categorySecurity',
  account: 'help.categoryAccount',
  billing: 'help.categoryBilling',
  general: 'help.categoryGeneral',
};

export const CATEGORIES: { value: TicketCategory }[] = [
  { value: 'bug' },
  { value: 'feature' },
  { value: 'security' },
  { value: 'account' },
  { value: 'billing' },
  { value: 'general' },
];
