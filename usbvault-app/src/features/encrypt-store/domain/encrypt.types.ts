/**
 * Types for the encrypt-store feature.
 */

export interface SelectedFile {
  name: string;
  size: number;
  uri: string;
  mimeType: string;
}

export interface AlgorithmOption {
  id: string;
  name: string;
  icon: 'shield' | 'zap' | 'cpu';
  tag: string;
  summary: string;
  details: { label: string; value: string }[];
}

export interface SecurityLevel {
  id: string;
  icon: 'lock' | 'shield' | 'award';
  speed: string;
  summary: string;
  details: { label: string; value: string }[];
}

export interface RecentFileDisplay {
  id: string;
  name: string;
  iconName: string;
  iconTint: string;
  iconBg: string;
  modifiedLabel: string;
  securityLabel: string;
}
