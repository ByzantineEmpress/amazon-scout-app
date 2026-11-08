import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

import { scanBarcode } from '../services/api';
import { getSettings, saveSettings, addScanToHistory, getOfflineQueue } from '../services/storage';
import {
  SCANNER_BARCODE_TYPES,
  DEFAULT_SCANNER_BARCODE_TYPES,
  validateScannedCode,
  confirmScan,
  EMPTY_CONFIRMATION
} from '../services/barcodeValidation';
import { palette, space, type, radius, layout } from '../design/theme';
import { Button, Chip, Screen, EmptyState, Loading } from '../design/primitives';
import ManualEntryDialog from './ManualEntryDialog';
import IsbnToolScreen from './IsbnToolScreen';

const ZOOM_STEPS = [0, 0.07, 0.15];
const ZOOM_LABELS = ['1x', '1.5x', '2x'];

/**
 * The scanner: the screen this app is for.
 *
 * The scan path is unchanged from the old root - validate the symbology, require two agreeing
 * frames in the same place, debounce, look it up, remember it in history - because that gate is
 * what stops a misread becoming a purchased pallet. Only the presentation is new.
 */
export default function ScanScreen({ onNavigate, onScanned }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [settings, setSettings] = useState({
    marketplace: 'CA',
    vibrationEnabled: true,
    scanItf14: false,
    scanCooldownMs: 1500
  });
  const [torch, setTorch] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [autofocus, setAutofocus] = useState('on');
  const [focusPoint, setFocusPoint] = useState(null);

  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingCode, setPendingCode] = useState('');
  const [rejected, setRejected] = useState(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [manualVisible, setManualVisible] = useState(false);
  const [isbnVisible, setIsbnVisible] = useState(false);

  const lastCode = useRef('');
  const lastTime = useRef(0);
  const confirmRef = useRef(EMPTY_CONFIRMATION);
  const focusTimer = useRef(null);
  const rejectTimer = useRef(null);

  // Settings are read on mount. Tabs unmount when you leave them, so returning from Settings
  // always re-reads them - no notification plumbing needed for the marketplace or the code types.
  useEffect(() => {
    let alive = true;
    getSettings().then((stored) => {
      // Functional update: the effect must not capture `settings`, or it would need it as a
      // dependency and re-run every time a setting changes.
      if (alive) setSettings((previous) => ({ ...previous, ...stored }));
    });
    getOfflineQueue().then((queue) => {
      if (alive) setOfflineCount(Array.isArray(queue) ? queue.length : 0);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission, requestPermission]);

  const barcodeTypes = settings.scanItf14 ? SCANNER_BARCODE_TYPES : DEFAULT_SCANNER_BARCODE_TYPES;

  const buzz = (status) => {
    if (settings.vibrationEnabled === false) return;
    try {
      if (status === 'HARD_GATED' || status === 'RESTRICTED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (status === 'UNKNOWN' || status === 'CAUTION' || status === 'APPROVAL_REQUIRED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (_e) {
      // Haptics are a nicety; a device without them still works.
    }
  };

  const flashRejection = (code) => {
    setRejected(code);
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    rejectTimer.current = setTimeout(() => setRejected(null), 1800);
  };

  const focusAt = (point) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_e) {
      // ignore
    }
    if (point) {
      setFocusPoint(point);
      if (focusTimer.current) clearTimeout(focusTimer.current);
      focusTimer.current = setTimeout(() => setFocusPoint(null), 1200);
    }
    setAutofocus('off');
    setTimeout(() => setAutofocus('on'), 60);
  };

  /** Look an item up and hand it to the shell, which shows it over the tabs. */
  const lookUp = async (code) => {
    setLoading(true);
    try {
      const result = await scanBarcode(code, settings.marketplace || 'CA');
      setLoading(false);
      buzz(result.data.status);
      // History first, so the row is there when the user comes back from the result.
      await addScanToHistory(result.data);
      const queue = await getOfflineQueue();
      setOfflineCount(Array.isArray(queue) ? queue.length : 0);
      if (onScanned) onScanned(result.data);
    } catch (_e) {
      setLoading(false);
      setScanning(true);
      Alert.alert('Scan failed', 'Could not look that barcode up. Check your signal and try again.');
    }
  };

  const handleScanned = async ({ data, bounds }) => {
    if (!scanning || loading) return;

    // 1. Only product codes get past this. A QR code would otherwise have its letters stripped by
    //    normalizeBarcode and be looked up as a real barcode.
    const verdict = validateScannedCode(data);
    if (!verdict.ok) {
      confirmRef.current = EMPTY_CONFIRMATION;
      if (pendingCode) setPendingCode('');
      flashRejection(String(data || '').slice(0, 20));
      return;
    }

    // 2. The same code, in the same place, twice. A steady misread never gets through.
    const now = Date.now();
    const step = confirmScan(confirmRef.current, verdict.code, now, bounds);
    confirmRef.current = step.state;
    if (!step.accept) {
      if (pendingCode !== verdict.code) setPendingCode(verdict.code);
      return;
    }

    // 3. Do not instantly re-scan what was just closed.
    if (verdict.code === lastCode.current && now - lastTime.current < (settings.scanCooldownMs || 1500)) {
      return;
    }

    confirmRef.current = EMPTY_CONFIRMATION;
    if (pendingCode) setPendingCode('');
    lastCode.current = verdict.code;
    lastTime.current = now;
    setScanning(false);
    await lookUp(verdict.code);
  };

  const cycleMarketplace = () => {
    const marketplace = settings.marketplace === 'CA' ? 'US' : 'CA';
    const next = { ...settings, marketplace };
    setSettings(next);
    saveSettings(next).catch(() => {});
  };

  if (!permission) {
    return (
      <Screen>
        <View style={styles.centred}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <EmptyState
          icon="📷"
          title="Camera access needed"
          body="Scanning needs the camera. Nothing is recorded or sent; the preview is only read to find a barcode."
          action={<Button label="Allow camera" onPress={requestPermission} />}
        />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Only one CameraView may hold the device at a time: Android gives the second one a black
          preview. The printed-ISBN tool opens its own camera, so this one steps aside while it is
          open. (The Comps tab needs no guard here - tabs unmount when you leave them.) */}
      {isbnVisible ? (
        <View style={StyleSheet.absoluteFill} />
      ) : (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          autofocus={autofocus}
          zoom={ZOOM_STEPS[zoomIndex]}
          barcodeScannerSettings={{ barcodeTypes }}
          onBarcodeScanned={scanning ? handleScanned : undefined}
          onMountError={(err) => {
            Alert.alert('Camera error', err?.message || 'The camera could not start.');
          }}
        />
      )}

      {/* Tap anywhere on the preview to refocus. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(event) => {
          const { locationX, locationY } = event.nativeEvent;
          focusAt({ x: locationX, y: locationY });
        }}
      />

      {focusPoint ? (
        <View
          pointerEvents="none"
          style={[styles.focusRing, { left: focusPoint.x - 30, top: focusPoint.y - 30 }]}
        />
      ) : null}

      {/* Top controls */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Chip
          label={settings.marketplace === 'US' ? '🇺🇸 Amazon.com' : '🇨🇦 Amazon.ca'}
          onPress={cycleMarketplace}
        />
        <View style={styles.topActions}>
          <Pressable
            onPress={() => setTorch((on) => !on)}
            style={[styles.iconButton, torch && styles.iconButtonOn]}
            accessibilityLabel="Torch"
          >
            <Text style={styles.iconText}>🔦</Text>
          </Pressable>
          <Pressable
            onPress={() => setZoomIndex((index) => (index + 1) % ZOOM_STEPS.length)}
            style={styles.iconButton}
            accessibilityLabel="Zoom"
          >
            <Text style={styles.iconText}>{ZOOM_LABELS[zoomIndex]}</Text>
          </Pressable>
        </View>
      </View>

      {/* Reticle and the one line of instruction */}
      <View style={styles.reticleWrap} pointerEvents="none">
        <View style={[styles.reticle, pendingCode && styles.reticleConfirming]}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <Text style={[styles.hint, pendingCode && styles.hintConfirming]}>
          {pendingCode ? 'Hold steady…' : 'Point at a barcode'}
        </Text>
      </View>

      {/* Bottom: state, then the two tools that are not the camera */}
      <View style={styles.bottom} pointerEvents="box-none">
        {loading ? (
          <View style={styles.statusCard}>
            <Loading label="Looking up the item…" />
          </View>
        ) : rejected ? (
          <View style={[styles.statusCard, styles.statusCardWarn]}>
            <Text style={[styles.text, type.small, { color: palette.warn }]} numberOfLines={1}>
              Not a product barcode{rejected ? ` (${rejected})` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.toolRow}>
          <Button
            label="Printed ISBN"
            icon="📖"
            variant="secondary"
            size="sm"
            onPress={() => setIsbnVisible(true)}
            style={styles.toolButton}
          />
          <Button
            label="Type it in"
            icon="⌨️"
            variant="secondary"
            size="sm"
            onPress={() => setManualVisible(true)}
            style={styles.toolButton}
          />
          {offlineCount > 0 ? (
            <Chip
              label={`📡 ${offlineCount}`}
              tone="warn"
              onPress={() => onNavigate && onNavigate('history')}
            />
          ) : null}
        </View>
      </View>

      {/* The result is a screen in the shell, not a modal here: the shell swaps the tabs for it,
          which also releases this camera. */}

      {manualVisible ? (
        <ManualEntryDialog
          onClose={() => setManualVisible(false)}
          onSubmit={(code) => {
            setManualVisible(false);
            lookUp(code);
          }}
        />
      ) : null}

      {isbnVisible ? (
        <IsbnToolScreen
          onClose={() => setIsbnVisible(false)}
          onLookup={(code) => {
            setIsbnVisible(false);
            lookUp(code);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: palette.text },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: layout.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topActions: { flexDirection: 'row', gap: space.sm },
  iconButton: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5, 10, 18, 0.62)',
    borderWidth: layout.hairline,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconButtonOn: { backgroundColor: 'rgba(245, 181, 68, 0.85)', borderColor: palette.warn },
  iconText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: '78%', height: 120, borderRadius: radius.md },
  reticleConfirming: { transform: [{ scale: 0.97 }] },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: palette.accent },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.md },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },
  hint: {
    marginTop: space.lg,
    color: '#FFFFFF',
    ...type.small,
    backgroundColor: 'rgba(5, 10, 18, 0.6)',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    overflow: 'hidden'
  },
  hintConfirming: { color: palette.accent },

  focusRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: palette.accent
  },

  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.gutter,
    paddingBottom: space.lg,
    gap: space.sm
  },
  statusCard: {
    backgroundColor: 'rgba(5, 10, 18, 0.82)',
    borderWidth: layout.hairline,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm
  },
  statusCardWarn: { borderColor: 'rgba(245, 181, 68, 0.5)' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  toolButton: { flex: 1 }
});
