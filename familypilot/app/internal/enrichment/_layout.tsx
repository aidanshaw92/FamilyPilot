import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import {
  enrichmentApi,
  getEnrichmentToken,
  setEnrichmentToken,
} from '@/src/services/enrichment/enrichment-api-client';

export default function EnrichmentLayout() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const config = await enrichmentApi.getConfig();
        if (!config.authConfigured) {
          setError('ENRICHMENT_ADMIN_TOKEN not configured on server');
          setChecking(false);
          return;
        }
        if (getEnrichmentToken()) setAuthed(true);
      } catch {
        setError('Could not reach enrichment API');
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  if (!authed) {
    return (
      <View style={styles.gate}>
        <Text variant="heading2">Venue enrichment</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          Internal tool — enter ENRICHMENT_ADMIN_TOKEN. Not linked from consumer UI.
        </Text>
        <TextInput
          value={tokenInput}
          onChangeText={setTokenInput}
          placeholder="Admin token"
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />
        {error ? <Text variant="caption" color={colors.error[600]}>{error}</Text> : null}
        <Pressable
          style={styles.button}
          onPress={() => {
            if (!tokenInput.trim()) {
              setError('Token required');
              return;
            }
            setEnrichmentToken(tokenInput.trim());
            setAuthed(true);
          }}
        >
          <Text variant="body" color={colors.text.inverse}>Unlock</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Enrichment queue' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit venue' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gate: { flex: 1, padding: spacing.screenPadding, justifyContent: 'center', gap: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary[500],
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
});
