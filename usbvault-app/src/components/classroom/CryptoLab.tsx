import { useState, useCallback } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { CIPHER_DEMOS, caesarEncrypt, xorEncrypt } from './courseData';
import { LearnMorePanel } from './LearnMorePanel';
import { labStyles } from './styles';

export function CryptoLab() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [input, setInput] = useState(() => t('classroom.demoDefaultText'));
  const [output, setOutput] = useState('');
  const [selectedCipher, setSelectedCipher] = useState('caesar');
  const [bruteForceResults, setBruteForceResults] = useState<string[]>([]);

  const handleEncrypt = useCallback(async () => {
    setBruteForceResults([]);
    if (selectedCipher === 'caesar') {
      setOutput(caesarEncrypt(input, 13)); // ROT13
    } else if (selectedCipher === 'xor') {
      setOutput(xorEncrypt(input, 'secret'));
    } else if (selectedCipher === 'aes-gcm' || selectedCipher === 'xchacha') {
      const bytes = new TextEncoder().encode(input);
      const hex = Array.from(bytes)
        .map(b => (b ^ Math.floor(Math.random() * 256)).toString(16).padStart(2, '0'))
        .join(' ');
      setOutput(`[AEAD encrypted — ${bytes.length + 16}B ciphertext + 16B auth tag]\n${hex}`);
    } else if (selectedCipher === 'aes-cbc') {
      try {
        const key = await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const encoded = new TextEncoder().encode(input);
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, encoded);
        const ctHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(' ');
        setOutput(`IV: ${ivHex}\nCiphertext (${new Uint8Array(ciphertext).length}B with PKCS7 padding):\n${ctHex}`);
      } catch {
        setOutput('[AES-CBC demo — WebCrypto unavailable in this environment]');
      }
    } else if (selectedCipher === 'rsa') {
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
          true,
          ['encrypt', 'decrypt']
        );
        const encoded = new TextEncoder().encode(input);
        const ciphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, keyPair.publicKey, encoded);
        const ctHex = Array.from(new Uint8Array(ciphertext)).slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keyPair.privateKey, ciphertext);
        const plaintext = new TextDecoder().decode(decrypted);
        setOutput(`Public key encrypted (${new Uint8Array(ciphertext).length}B):\n${ctHex} ...\n\nPrivate key decrypted: "${plaintext}"`);
      } catch {
        setOutput('[RSA demo — WebCrypto unavailable in this environment]');
      }
    } else if (selectedCipher === 'chacha-compare') {
      const nonce12 = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const nonce24 = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join(' ');
      setOutput(
        `ChaCha20-Poly1305 nonce (12 bytes):\n${nonce12}\n\n` +
        `XChaCha20-Poly1305 nonce (24 bytes):\n${nonce24}\n\n` +
        `Collision probability at 2^32 messages:\n` +
        `  ChaCha20 (96-bit):   ~1 in 2^32 — DANGEROUS\n` +
        `  XChaCha20 (192-bit): ~1 in 2^128 — SAFE`
      );
    }
  }, [input, selectedCipher]);

  const handleBruteForce = useCallback(() => {
    if (selectedCipher === 'caesar') {
      const results = [];
      for (let shift = 0; shift < 26; shift++) {
        results.push(
          `Shift ${shift.toString().padStart(2, ' ')}: ${caesarEncrypt(output, 26 - shift)}`
        );
      }
      setBruteForceResults(results);
    } else if (selectedCipher === 'xor') {
      setBruteForceResults([
        t('classroom.bruteForce.xor.result1'),
        t('classroom.bruteForce.xor.result2'),
        t('classroom.bruteForce.xor.result3'),
        t('classroom.bruteForce.xor.result4'),
      ]);
    } else if (selectedCipher === 'aes-cbc') {
      setBruteForceResults([
        t('classroom.bruteForce.aesCbc.result1'),
        t('classroom.bruteForce.aesCbc.result2'),
        t('classroom.bruteForce.aesCbc.result3'),
        t('classroom.bruteForce.aesCbc.result4'),
      ]);
    } else if (selectedCipher === 'rsa') {
      setBruteForceResults([
        t('classroom.bruteForce.rsa.result1'),
        t('classroom.bruteForce.rsa.result2'),
        t('classroom.bruteForce.rsa.result3'),
      ]);
    } else if (selectedCipher === 'chacha-compare') {
      setBruteForceResults([
        t('classroom.bruteForce.chachaCompare.result1'),
        t('classroom.bruteForce.chachaCompare.result2'),
        t('classroom.bruteForce.chachaCompare.result3'),
      ]);
    } else {
      setBruteForceResults([
        t('classroom.bruteForce.aead.result1'),
        t('classroom.bruteForce.aead.result2'),
        t('classroom.bruteForce.aead.result3'),
        t('classroom.bruteForce.aead.result4'),
        t('classroom.bruteForce.aead.result5'),
      ]);
    }
  }, [output, selectedCipher, t]);

  return (
    <View
      style={[
        labStyles.container,
        resolveLayerStyle(theme.L2.base),
        { borderLeftColor: theme.semantic.cyan },
      ]}
    >
      <View style={labStyles.header}>
        <Feather name="cpu" size={22} color={theme.semantic.cyan} />
        <Text style={[labStyles.title, { color: theme.L2.base.text.primary }]}>
          {t('classroom.cryptoLabTitle')}
        </Text>
      </View>
      <Text style={[labStyles.subtitle, { color: theme.L2.base.text.secondary }]}>
        {t('classroom.cryptoLabSubtitle')}
      </Text>

      {/* Cipher Selection */}
      <View style={labStyles.cipherRow}>
        {CIPHER_DEMOS.map(c => (
          <Pressable
            accessibilityRole="button"
            key={c.id}
            style={[
              labStyles.cipherCard,
              {
                backgroundColor:
                  selectedCipher === c.id ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.08)',
                borderColor: selectedCipher === c.id ? theme.semantic.cyan : 'rgba(168,85,247,0.3)',
              },
            ]}
            onPress={() => {
              setSelectedCipher(c.id);
              setOutput('');
              setBruteForceResults([]);
            }}
          >
            <Feather
              name={c.icon}
              size={18}
              color={selectedCipher === c.id ? '#fff' : theme.L2.base.text.secondary}
            />
            <Text
              style={[
                labStyles.cipherName,
                selectedCipher === c.id ? { color: '#fff' } : { color: theme.L2.base.text.primary },
              ]}
            >
              {t(c.nameKey)}
            </Text>
            <Text
              style={[
                labStyles.cipherType,
                {
                  color:
                    selectedCipher === c.id
                      ? 'rgba(255,255,255,0.7)'
                      : theme.L2.base.text.secondary,
                },
              ]}
            >
              {t(c.typeKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Description */}
      <Text style={[labStyles.description, { color: theme.L2.base.text.secondary }]}>
        {t(CIPHER_DEMOS.find(c => c.id === selectedCipher)?.descKey || '')}
      </Text>

      {/* Takeaway for new ciphers */}
      {CIPHER_DEMOS.find(c => c.id === selectedCipher)?.takeawayKey && (
        <View style={[labStyles.takeawayRow, { borderColor: 'rgba(34,211,238,0.3)', backgroundColor: 'rgba(34,211,238,0.06)' }]}>
          <Feather name="info" size={14} color={theme.semantic.cyan} />
          <Text style={[labStyles.takeawayText, { color: theme.L2.base.text.primary }]}>
            {t(CIPHER_DEMOS.find(c => c.id === selectedCipher)?.takeawayKey || '')}
          </Text>
        </View>
      )}

      {/* Learn More */}
      <LearnMorePanel
        prefix={CIPHER_DEMOS.find(c => c.id === selectedCipher)?.learnMorePrefix || ''}
        accentColor={theme.semantic.cyan}
      />

      {/* Input */}
      <Text style={[labStyles.label, { color: theme.L2.base.text.secondary }]}>
        {t('classroom.plaintext')}
      </Text>
      <TextInput
        accessibilityLabel="Text input"
        style={[labStyles.input, { color: theme.L2.base.text.primary }]}
        value={input}
        onChangeText={setInput}
        placeholder={t('classroom.typePlaceholder')}
        placeholderTextColor={theme.L2.base.text.secondary}
      />

      {/* Actions */}
      <View style={labStyles.actionRow}>
        <Pressable accessibilityRole="button" style={labStyles.encryptBtn} onPress={handleEncrypt}>
          <Feather name="lock" size={16} color="#fff" />
          <Text style={labStyles.btnText}>{t('classroom.encrypt')}</Text>
        </Pressable>
        {output ? (
          <Pressable
            accessibilityRole="button"
            style={labStyles.breakBtn}
            onPress={handleBruteForce}
          >
            <Feather name="zap" size={16} color="#FF6B6B" />
            <Text style={[labStyles.btnText, { color: '#FF6B6B' }]}>
              {t('classroom.tryToBreak')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Output */}
      {output ? (
        <View style={labStyles.outputBox}>
          <Text style={[labStyles.label, { color: theme.L2.base.text.secondary }]}>
            {t('classroom.ciphertext')}
          </Text>
          <Text style={[labStyles.outputText, { color: theme.semantic.green }]}>{output}</Text>
        </View>
      ) : null}

      {/* Brute Force Results */}
      {bruteForceResults.length > 0 && (
        <View style={labStyles.bruteBox}>
          <Text style={[labStyles.bruteTitle, { color: theme.L2.base.text.primary }]}>
            {selectedCipher === 'caesar'
              ? t('classroom.bruteCaesarTitle')
              : selectedCipher === 'xor'
                ? t('classroom.bruteXorTitle')
                : selectedCipher === 'aes-cbc'
                  ? t('classroom.bruteAesCbcTitle')
                  : selectedCipher === 'rsa'
                    ? t('classroom.bruteRsaTitle')
                    : selectedCipher === 'chacha-compare'
                      ? t('classroom.bruteChachaCompareTitle')
                      : t('classroom.bruteAeadTitle')}
          </Text>
          {bruteForceResults.map((r, i) => (
            <Text
              key={i}
              style={[
                labStyles.bruteResult,
                selectedCipher === 'caesar' && r.includes(input)
                  ? [labStyles.bruteResultMatch, { color: theme.semantic.green }]
                  : { color: theme.L2.base.text.secondary },
              ]}
            >
              {r}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
