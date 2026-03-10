export type IconSetName =
  | 'Feather'
  | 'Ionicons'
  | 'MaterialCommunityIcons'
  | 'Octicons';

export interface DashboardNavItem {
  id: string;
  label: string;
  iconSet: IconSetName;
  iconName: string;
  active?: boolean;
  section?: 'main' | 'bottom';
}

export interface HeroAction {
  id: string;
  label: string;
  iconSet: IconSetName;
  iconName: string;
}

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
