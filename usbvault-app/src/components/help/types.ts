/**
 * Help screen type definitions.
 */

export interface GuideStep {
  stepKey: string;
  detailKey: string;
}

export interface GettingStartedItem {
  id: string;
  icon: string;
  labelKey: string;
  descKey: string;
  color: string;
  steps: GuideStep[];
}

export interface SecurityResource {
  id: string;
  icon: string;
  labelKey: string;
  descKey: string;
  url: string;
}
