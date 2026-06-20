/* ── Radar Tooltip Data ─────────────────────────────────────────── */

export interface RadarTooltipInfo {
  status: string;
  statusColor: string;
  current: string;
  suggestions: string[];
}

export function getRadarTooltip(
  metricId: string,
  value: number,
  t: (key: string) => string
): RadarTooltipInfo {
  const pct = Math.round(value * 100);
  const statusColor = pct >= 80 ? '#4ADE80' : pct >= 50 ? '#FACC15' : '#EF4444';
  const status = pct >= 80 ? 'strong' : pct >= 50 ? 'moderate' : 'needsAttention';

  switch (metricId) {
    case 'files':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.filesEncryptedCurrent')}`
            : `${pct}% — ${t('rightRail.noFilesEncrypted')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.encryptionExcellent')]
            : [
                t('rightRail.suggestEncryptDocs'),
                t('rightRail.suggestPqcEncryption'),
                t('rightRail.suggestAutoEncrypt'),
              ],
      };
    case 'passwords':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.passwordsStoredCurrent')}`
            : `${pct}% — ${t('rightRail.noPasswordsStored')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.passwordsWellPopulated')]
            : [
                t('rightRail.suggestImportPasswords'),
                t('rightRail.suggestPasswordGenerator'),
                t('rightRail.suggestBreachMonitoring'),
              ],
      };
    case 'backups':
      return {
        status,
        statusColor,
        current:
          pct >= 80
            ? `${pct}% — ${t('rightRail.backupSolid')}`
            : `${pct}% — ${t('rightRail.backupCouldImprove')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.backupComprehensive')]
            : [
                t('rightRail.suggestAutoBackup'),
                t('rightRail.suggestRecoveryPhrase'),
                t('rightRail.suggestSecondaryBackup'),
              ],
      };
    case 'sessions':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.sessionMonitoring')}`
            : `${pct}% — ${t('rightRail.limitedSession')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.sessionWellMonitored')]
            : [
                t('rightRail.suggestReviewSessions'),
                t('rightRail.suggestAutoLock'),
                t('rightRail.suggestRememberDevice'),
              ],
      };
    case 'sharing':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.sharingActive')}`
            : `${pct}% — ${t('rightRail.noShares')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.sharingSecure')]
            : [
                t('rightRail.suggestTimeLimited'),
                t('rightRail.suggestPinAccess'),
                t('rightRail.suggestVerifyFingerprints'),
              ],
      };
    case 'privacy':
      return {
        status,
        statusColor,
        current:
          pct >= 60
            ? `${pct}% — ${t('rightRail.privacyConfigured')}`
            : `${pct}% — ${t('rightRail.privacyNeedsAttention')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.privacyStrong')]
            : [
                t('rightRail.suggestBiometric'),
                t('rightRail.suggestFido2'),
                t('rightRail.suggestGhostMode'),
              ],
      };
    default:
      return { status, statusColor, current: `${pct}%`, suggestions: [] };
  }
}
