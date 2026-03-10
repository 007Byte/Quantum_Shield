export type IconSetName =
  | 'Feather'
  | 'Ionicons'
  | 'MaterialCommunityIcons'
  | 'Octicons';

/**
 * PL-009: Compile-time validated enum for sidebar section placement.
 * Replaces the previous string literal union ('main' | 'bottom' | 'top').
 */
export enum NavSection {
  Top = 'top',
  Main = 'main',
  Bottom = 'bottom',
}

export interface DashboardNavItem {
  id: string;
  label: string;
  iconSet: IconSetName;
  iconName: string;
  active?: boolean;
  section?: NavSection;
  group?: string;
}

export interface HeroAction {
  id: string;
  label: string;
  iconSet: IconSetName;
  iconName: string;
}

/**
 * PL-001: VaultItem represents a file row in the vault table with
 * display-ready fields (icon, subtype label, size/date strings).
 *
 * Note: For vault-level display, use VaultDisplayItem from @/types/domain.
 * VaultItem is intentionally a separate UI type for *file* rows.
 */
export interface VaultItem {
  id: string;
  name: string;
  subtype: string;
  sizeLabel?: string;
  securityLabel: string;
  modifiedLabel: string;
  iconSet: IconSetName;
  iconName: string;
  iconTint: string;
  iconBg: string;
  selected?: boolean;
}

export interface VaultContextAction {
  id: string;
  label: string;
  iconSet: IconSetName;
  iconName: string;
}

export interface SecurityRadarMetric {
  id: string;
  label: string;
  value: number;
}

export interface SecurityChecklistItem {
  id: string;
  label: string;
  complete: boolean;
}

export interface SecureShareEntry {
  id: string;
  name: string;
  subtitle: string;
  avatarLabel: string;
  avatarColor: string;
  accent?: string;
}

export interface TopBarProfile {
  name: string;
  initials: string;
}
