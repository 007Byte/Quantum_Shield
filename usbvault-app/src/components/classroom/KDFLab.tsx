import { useState, useCallback } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { KDF_DEMOS } from './courseData';
import { LearnMorePanel } from './LearnMorePanel';
import { labStyles, kdfStyles } from './styles';

export function KDFLab() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [password, setPassword] = useState('mypassword');
  const [selectedKdf, setSelectedKdf] = useState('pbkdf2');
  const [pbkdf2Iterations, setPbkdf2Iterations] = useState(100000);
  const [deriving, setDeriving] = useState(false);
  const [result, setResult] = useState('');

  const handleDerive = useCallback(async () => {
    setDeriving(true);
    setResult('');
    const kdf = KDF_DEMOS.find(k => k.id === selectedKdf);
    if (!kdf) {
      setDeriving(false);
      return;
    }

    if (selectedKdf === 'pbkdf2') {
      try {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          enc.encode(password),
          'PBKDF2',
          false,
          ['deriveBits']
        );
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const start = performance.now();
        const bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt, iterations: pbkdf2Iterations, hash: 'SHA-256' },
          keyMaterial,
          256
        );
        const elapsed = Math.round(performance.now() - start);
        const hex = Array.from(new Uint8Array(bits))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        setResult(
          `${t('classroom.kdf.result', { time: String(elapsed) })}\nKey: ${hex.slice(0, 32)}...`
        );
      } catch {
        setResult('[PBKDF2 — WebCrypto unavailable]');
      }
    } else if (selectedKdf === 'hkdf') {
      try {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          enc.encode(password),
          'HKDF',
          false,
          ['deriveBits']
        );
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const infos = ['vault-encryption', 'audit-signing', 'backup-key'];
        const lines: string[] = [];
        for (const info of infos) {
          const start = performance.now();
          const bits = await crypto.subtle.deriveBits(
            { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) },
            keyMaterial,
            256
          );
          const elapsed = Math.round(performance.now() - start);
          const hex = Array.from(new Uint8Array(bits))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          lines.push(`info="${info}" (${elapsed}ms):\n  ${hex.slice(0, 32)}...`);
        }
        setResult(`${t('classroom.kdf.hkdf.subkeyDemo')}\n\n${lines.join('\n\n')}`);
      } catch {
        setResult('[HKDF — WebCrypto unavailable]');
      }
    } else {
      // Educational-only KDFs — show parameter tables
      await new Promise(r => setTimeout(r, 300)); // brief delay for UX
      if (selectedKdf === 'bcrypt') {
        setResult(
          `bcrypt cost factor comparison:\n\n` +
            `  Cost 10: 2^10 = 1,024 rounds     ~100ms\n` +
            `  Cost 12: 2^12 = 4,096 rounds     ~300ms\n` +
            `  Cost 14: 2^14 = 16,384 rounds    ~1.2s\n` +
            `  Cost 16: 2^16 = 65,536 rounds    ~4.5s\n\n` +
            t('classroom.kdf.bcrypt.explanation')
        );
      } else if (selectedKdf === 'scrypt') {
        setResult(
          `scrypt parameters:\n\n` +
            `  N (CPU/memory cost): 2^14 = 16,384\n` +
            `  r (block size):      8\n` +
            `  p (parallelism):     1\n` +
            `  Memory required:     ~16 MiB\n\n` +
            `  N=2^20, r=8, p=1 → ~1 GiB RAM\n\n` +
            t('classroom.kdf.scrypt.explanation')
        );
      } else if (selectedKdf === 'argon2i') {
        setResult(
          `Argon2i parameters:\n\n` +
            `  Memory:      64 MiB\n` +
            `  Iterations:  3\n` +
            `  Parallelism: 4 lanes\n` +
            `  Salt:        16 bytes (random)\n\n` +
            t('classroom.kdf.argon2i.explanation')
        );
      } else if (selectedKdf === 'argon2id') {
        setResult(
          `Argon2id — USBVault Configuration:\n\n` +
            `  Memory:      64 MiB\n` +
            `  Iterations:  3\n` +
            `  Parallelism: 4 lanes\n` +
            `  Salt:        16 bytes (random)\n` +
            `  Output:      32 bytes (256-bit key)\n\n` +
            t('classroom.kdf.argon2id.explanation')
        );
      }
    }
    setDeriving(false);
  }, [password, selectedKdf, pbkdf2Iterations, t]);

  const iterationOptions = [1000, 10000, 100000, 600000];

  return (
    <View
      style={[
        labStyles.container,
        resolveLayerStyle(theme.L2.base),
        { borderLeftColor: theme.semantic.green },
      ]}
    >
      <View style={labStyles.header}>
        <Feather name="hash" size={22} color={theme.semantic.green} />
        <Text style={[labStyles.title, { color: theme.L2.base.text.primary }]}>
          {t('classroom.kdf.sectionTitle')}
        </Text>
      </View>
      <Text style={[labStyles.subtitle, { color: theme.L2.base.text.secondary }]}>
        {t('classroom.kdf.sectionSubtitle')}
      </Text>

      {/* KDF Selection */}
      <View style={labStyles.cipherRow}>
        {KDF_DEMOS.map(k => (
          <Pressable
            accessibilityRole="button"
            key={k.id}
            style={[
              labStyles.cipherCard,
              {
                backgroundColor: selectedKdf === k.id ? `${k.color}66` : `${k.color}14`,
                borderColor: selectedKdf === k.id ? k.color : `${k.color}40`,
              },
            ]}
            onPress={() => {
              setSelectedKdf(k.id);
              setResult('');
            }}
          >
            <Text
              style={[
                labStyles.cipherName,
                selectedKdf === k.id ? { color: '#fff' } : { color: theme.L2.base.text.primary },
              ]}
            >
              {t(k.nameKey)}
            </Text>
            <Text
              style={[
                labStyles.cipherType,
                {
                  color:
                    selectedKdf === k.id ? 'rgba(255,255,255,0.7)' : theme.L2.base.text.secondary,
                },
              ]}
            >
              {k.isLive ? 'Live Demo' : 'Educational'}
            </Text>
            {k.badge && (
              <View style={kdfStyles.badge}>
                <Text style={kdfStyles.badgeText}>{t(k.badge)}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* Description */}
      <Text style={[labStyles.description, { color: theme.L2.base.text.secondary }]}>
        {t(KDF_DEMOS.find(k => k.id === selectedKdf)?.descKey || '')}
      </Text>

      {/* Learn More */}
      <LearnMorePanel
        prefix={KDF_DEMOS.find(k => k.id === selectedKdf)?.learnMorePrefix || ''}
        accentColor={KDF_DEMOS.find(k => k.id === selectedKdf)?.color || theme.semantic.green}
      />

      {/* Password Input */}
      <Text style={[labStyles.label, { color: theme.L2.base.text.secondary }]}>
        {t('classroom.kdf.passwordLabel')}
      </Text>
      <TextInput
        accessibilityLabel="Password input"
        style={[labStyles.input, { color: theme.L2.base.text.primary }]}
        value={password}
        onChangeText={setPassword}
        placeholder="Enter a password..."
        placeholderTextColor={theme.L2.base.text.secondary}
      />

      {/* PBKDF2 Iteration Selector */}
      {selectedKdf === 'pbkdf2' && (
        <View style={kdfStyles.iterationRow}>
          <Text style={[labStyles.label, { color: theme.L2.base.text.secondary }]}>
            {t('classroom.kdf.iterations')}
          </Text>
          <View style={kdfStyles.iterationButtons}>
            {iterationOptions.map(n => (
              <Pressable
                accessibilityRole="button"
                key={n}
                style={[
                  kdfStyles.iterationBtn,
                  pbkdf2Iterations === n && kdfStyles.iterationBtnActive,
                ]}
                onPress={() => setPbkdf2Iterations(n)}
              >
                <Text
                  style={[
                    kdfStyles.iterationBtnText,
                    pbkdf2Iterations === n && kdfStyles.iterationBtnTextActive,
                  ]}
                >
                  {n >= 1000 ? `${n / 1000}K` : String(n)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Derive Button */}
      <View style={labStyles.actionRow}>
        <Pressable
          accessibilityRole="button"
          style={[labStyles.encryptBtn, { backgroundColor: 'rgba(34,197,94,0.4)' }]}
          onPress={handleDerive}
          disabled={deriving}
        >
          <Feather name="hash" size={16} color="#fff" />
          <Text style={labStyles.btnText}>
            {deriving ? t('classroom.kdf.deriving') : t('classroom.kdf.derive')}
          </Text>
        </Pressable>
      </View>

      {/* Result */}
      {result ? (
        <View style={labStyles.outputBox}>
          <Text style={[labStyles.label, { color: theme.L2.base.text.secondary }]}>
            {t('classroom.kdf.resultLabel')}
          </Text>
          <Text style={[labStyles.outputText, { color: theme.semantic.green }]}>{result}</Text>
        </View>
      ) : null}
    </View>
  );
}
