import React, { useState, useEffect } from 'react';
import { View, Text, Switch, Alert, Platform, StyleSheet } from 'react-native';
import {
  Screen,
  Header,
  Card,
  Chip,
  Button,
  SectionTitle,
  Divider,
  Badge
} from '../design/primitives';
import { palette, space, type, layout } from '../design/theme';
import { getSettings, saveSettings, clearScanHistory, clearOfflineQueue } from '../services/storage';
import {
  checkForUpdate,
  openUpdateDownload,
  downloadAndInstallUpdate,
  openInstallPermissionSettings,
  CURRENT_VERSION
} from '../services/updateService';

/** A label, an explanation, and a switch. */
function ToggleRow({ label, hint, value, onChange, last }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowText}>
        <Text style={[styles.text, type.body]}>{label}</Text>
        {hint ? <Text style={[styles.text, type.small, styles.muted]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: palette.surfacePressed, true: palette.accentDeep }}
        thumbColor={value ? palette.accent : palette.textFaint}
      />
    </View>
  );
}

/** A row that does something when tapped. */
function ActionRow({ label, hint, onPress, tone = 'neutral', last }) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant={tone === 'danger' ? 'danger' : 'ghost'}
      style={[styles.action, last && styles.rowLast]}
    />
  );
}

/**
 * Settings, as a screen.
 *
 * Changes save as you make them - there is no Save button to forget - and the caller is told, so
 * the scanner picks up a marketplace change immediately.
 *
 * The old screen had a "sound effects" switch that did nothing: the setting was stored and read
 * back but no part of the app has ever played a sound. It is gone rather than left as a control
 * that lies.
 */
export default function SettingsScreen({ onClose, onSettingsChange }) {
  const [settings, setSettings] = useState({
    marketplace: 'CA',
    vibrationEnabled: true,
    scanItf14: false
  });
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((stored) => {
        if (!alive) return;
        // Keep the whole stored object, not just the fields shown here: saving writes the object
        // back, and anything this screen does not edit (the scan cooldown, for instance) must
        // survive the round trip.
        setSettings({
          ...stored,
          marketplace: stored.marketplace === 'US' ? 'US' : 'CA',
          vibrationEnabled: stored.vibrationEnabled !== false,
          scanItf14: stored.scanItf14 === true
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /** Save on change: a settings screen with an unsaved state is a trap. */
  const apply = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next).catch(() => {});
    if (onSettingsChange) onSettingsChange(next);
  };

  const handleCheck = async () => {
    setChecking(true);
    setUpdate(null);
    try {
      const result = await checkForUpdate();
      setUpdate(result);
      if (!result.success) {
        Alert.alert('Could not check for updates', result.error || 'GitHub Releases did not answer.');
      }
    } catch (err) {
      Alert.alert('Could not check for updates', err.message || 'Unknown error.');
    } finally {
      setChecking(false);
    }
  };

  const handleInstall = async () => {
    if (!update?.downloadUrl || installing) return;

    if (Platform.OS !== 'android' || !update.isDirectApk) {
      try {
        await openUpdateDownload(update.downloadUrl);
      } catch (err) {
        Alert.alert('Could not open the update', err.message);
      }
      return;
    }

    setInstalling(true);
    setProgress(0);
    try {
      await downloadAndInstallUpdate(update.downloadUrl, (event) => {
        const total = event?.totalBytes || 0;
        const written = event?.bytesWritten || 0;
        if (total > 0) setProgress(Math.min(1, written / total));
      });
      Alert.alert('Almost done', 'Android will ask you to confirm the install. Your scans and settings are kept.');
    } catch (err) {
      Alert.alert(
        'Could not install automatically',
        `${err.message}\n\nAndroid needs permission for Amazon Scout to install apps.`,
        [
          { text: 'Allow installs', onPress: () => openInstallPermissionSettings().catch(() => {}) },
          { text: 'Open in browser', onPress: () => openUpdateDownload(update.downloadUrl).catch(() => {}) },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } finally {
      setInstalling(false);
    }
  };

  const confirm = (title, message, confirmLabel, action) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: action }
    ]);
  };

  const updateAvailable = update?.success && update?.updateAvailable;

  return (
    <Screen scroll>
      <Header
        title="Settings"
        subtitle={`Amazon Scout ${CURRENT_VERSION}`}
        right={onClose ? <Button label="Done" variant="secondary" size="sm" onPress={onClose} /> : null}
      />

      <SectionTitle>Amazon marketplace</SectionTitle>
      <Card>
        <Text style={[styles.text, type.body]}>
          Prices, restrictions and links all follow this marketplace.
        </Text>
        <View style={styles.chipRow}>
          <Chip
            label="🇨🇦 Amazon.ca · CAD"
            selected={settings.marketplace === 'CA'}
            onPress={() => apply({ marketplace: 'CA' })}
          />
          <Chip
            label="🇺🇸 Amazon.com · USD"
            selected={settings.marketplace === 'US'}
            onPress={() => apply({ marketplace: 'US' })}
          />
        </View>
      </Card>

      <SectionTitle>Scanning</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          label="Vibrate on result"
          hint="A short buzz that tells you the answer without looking."
          value={settings.vibrationEnabled}
          onChange={(value) => apply({ vibrationEnabled: value })}
        />
        <Divider />
        <ToggleRow
          label="Scan case and carton codes"
          hint="ITF-14 codes are on cases, not single items. Off unless you sell in bulk."
          value={settings.scanItf14}
          onChange={(value) => apply({ scanItf14: value })}
          last
        />
      </Card>

      <SectionTitle>Update</SectionTitle>
      <Card>
        <View style={styles.versionsRow}>
          <View>
            <Text style={[styles.text, type.tiny, styles.faint]}>INSTALLED</Text>
            <Text style={[styles.text, type.title]}>v{CURRENT_VERSION}</Text>
          </View>
          {updateAvailable ? (
            <Badge label={`v${update.latestVersion} available`} tone="good" />
          ) : update?.success ? (
            <Badge label="Up to date" tone="neutral" />
          ) : null}
        </View>

        {updateAvailable && update.notes ? (
          <Text style={[styles.text, type.small, styles.muted, styles.notes]} numberOfLines={5}>
            {update.notes}
          </Text>
        ) : null}

        <Button
          label={updateAvailable ? 'Install update' : 'Check for updates'}
          icon={updateAvailable ? '⬇️' : '🔄'}
          variant={updateAvailable ? 'primary' : 'secondary'}
          loading={checking || installing}
          onPress={updateAvailable ? handleInstall : handleCheck}
          style={styles.updateButton}
        />

        {installing ? (
          <Text style={[styles.text, type.small, styles.muted]}>
            {progress > 0 ? `Downloading ${Math.round(progress * 100)}%` : 'Starting download…'}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Interface</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          label="New interface (in progress)"
          hint="A tabbed layout — Scan, Comps, History, Settings. The rebuilt screens use the new design; the rest still look like the old ones."
          value={settings.uiV2 === true}
          onChange={(value) => apply({ uiV2: value })}
          last
        />
      </Card>

      <SectionTitle>Your data</SectionTitle>
      <Card padded={false}>
        <ActionRow
          label="Clear scan history"
          tone="danger"
          onPress={() =>
            confirm('Clear scan history?', 'This removes every scan kept on this phone. It cannot be undone.', 'Clear', async () => {
              await clearScanHistory();
              Alert.alert('Cleared', 'Scan history is empty.');
            })
          }
        />
        <Divider />
        <ActionRow
          label="Discard offline queue"
          tone="danger"
          last
          onPress={() =>
            confirm('Discard queued scans?', 'Scans saved while you had no signal will be dropped.', 'Discard', async () => {
              await clearOfflineQueue();
              Alert.alert('Cleared', 'The offline queue is empty.');
            })
          }
        />
      </Card>

      <Text style={[styles.text, type.small, styles.faint, styles.footer]}>
        Everything is stored on this phone. Nothing is sent anywhere except the lookups themselves.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  faint: { color: palette.textFaint },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    paddingVertical: space.md,
    gap: space.lg
  },
  rowLast: {},
  rowText: { flex: 1, gap: space.xxs },
  action: {
    borderWidth: 0,
    borderRadius: 0,
    justifyContent: 'flex-start',
    paddingHorizontal: layout.gutter,
    paddingVertical: space.md
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  versionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md
  },
  notes: { marginTop: space.md },
  updateButton: { marginTop: space.lg },
  footer: { textAlign: 'center', marginTop: space.xl }
});
