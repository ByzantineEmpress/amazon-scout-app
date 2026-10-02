import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

import { scanBarcode } from './src/services/api';
import { getSettings, addScanToHistory, getOfflineQueue } from './src/services/storage';
import ScanResultModal from './src/components/ScanResultModal';
import SettingsModal from './src/components/SettingsModal';
import HistoryModal from './src/components/HistoryModal';
import OfflineQueueModal from './src/components/OfflineQueueModal';
import ManualEntryModal from './src/components/ManualEntryModal';
import IsbnScanModal from './src/components/IsbnScanModal';
import ItemCompsModal from './src/components/ItemCompsModal';
import { checkForUpdate } from './src/services/updateService';
import {
  SCANNER_BARCODE_TYPES,
  validateScannedCode,
  confirmScan,
  EMPTY_CONFIRMATION
} from './src/services/barcodeValidation';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanningActive, setScanningActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [scannedItem, setScannedItem] = useState(null);
  const [resultModalVisible, setResultModalVisible] = useState(false);

  // Modals
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [isbnScanVisible, setIsbnScanVisible] = useState(false);
  const [itemCompsVisible, setItemCompsVisible] = useState(false);

  // Camera focus & zoom
  const [autofocusMode, setAutofocusMode] = useState('on');
  const [zoom, setZoom] = useState(0);
  const [focusPoint, setFocusPoint] = useState(null);
  const focusTimeoutRef = useRef(null);

  // Settings & state
  const [settings, setSettings] = useState({
    marketplace: 'CA',
    soundEnabled: true,
    vibrationEnabled: true,
    scanCooldownMs: 1500
  });
  const [offlineCount, setOfflineCount] = useState(0);
  const [hasUpdate, setHasUpdate] = useState(false);

  const lastScannedTime = useRef(0);
  const lastBarcode = useRef('');
  // Frame-agreement gate state, plus the code currently awaiting a confirming frame. The
  // pending code drives the "hold steady" hint, so a code that was seen but not yet trusted is
  // visibly not being ignored.
  const scanConfirmRef = useRef(EMPTY_CONFIRMATION);
  const [pendingCode, setPendingCode] = useState('');

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    const s = await getSettings();
    setSettings(s);
    refreshOfflineCount();

    // Silent check for update on app startup
    checkForUpdate().then((res) => {
      if (res?.success && res?.updateAvailable) {
        setHasUpdate(true);
      }
    }).catch(() => {});
  };

  const refreshOfflineCount = async () => {
    const q = await getOfflineQueue();
    setOfflineCount(q.length);
  };

  const triggerHaptic = (status) => {
    if (!settings.vibrationEnabled) return;
    try {
      if (status === 'HARD_GATED' || status === 'RESTRICTED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (status === 'UNKNOWN' || status === 'CAUTION' || status === 'APPROVAL_REQUIRED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      // Haptics not supported on device
    }
  };

  const handleBarcodeScanned = async ({ data }) => {
    if (!scanningActive || loading) return;

    // 1. Only product barcodes get past this. A QR code or an asset tag would otherwise have
    //    its letters stripped by normalizeBarcode and be looked up as a real barcode.
    const verdict = validateScannedCode(data);
    if (!verdict.ok) {
      scanConfirmRef.current = EMPTY_CONFIRMATION;
      if (pendingCode) setPendingCode('');
      return;
    }

    // 2. Require the same code on consecutive frames, so a single-frame misread cannot trigger
    //    a lookup. One extra frame is imperceptible but removes most bad reads.
    const step = confirmScan(scanConfirmRef.current, verdict.code);
    scanConfirmRef.current = step.state;
    if (!step.accept) {
      if (pendingCode !== verdict.code) setPendingCode(verdict.code);
      return;
    }

    const code = verdict.code;
    const now = Date.now();

    // 3. Debounce an immediate re-scan of the same code (e.g. straight after closing the card).
    if (code === lastBarcode.current && now - lastScannedTime.current < (settings.scanCooldownMs || 1500)) {
      return;
    }

    scanConfirmRef.current = EMPTY_CONFIRMATION;
    if (pendingCode) setPendingCode('');
    lastBarcode.current = code;
    lastScannedTime.current = now;
    setScanningActive(false);
    setLoading(true);

    try {
      const result = await scanBarcode(code, settings.marketplace || 'CA');
      setLoading(false);
      setScannedItem(result.data);
      setResultModalVisible(true);

      // Trigger sensory cues
      triggerHaptic(result.data.status);

      // Save to local scan history
      await addScanToHistory(result.data);
      refreshOfflineCount();
    } catch (err) {
      setLoading(false);
      setScanningActive(true);
      Alert.alert('Scan Error', 'Failed to process barcode.');
    }
  };

  const triggerFocus = (coords) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    if (coords) {
      setFocusPoint(coords);
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        setFocusPoint(null);
      }, 1200);
    }

    // Force refocus cycle in CameraX
    setAutofocusMode('off');
    setTimeout(() => {
      setAutofocusMode('on');
    }, 60);
  };

  const handleManualLookup = async (barcodeToLookup) => {
    const code = (barcodeToLookup || '').trim();
    if (!code) return;
    setManualModalVisible(false);
    setLoading(true);

    try {
      const result = await scanBarcode(code, settings.marketplace || 'CA');
      setLoading(false);
      setScannedItem(result.data);
      setResultModalVisible(true);

      triggerHaptic(result.data.status);
      await addScanToHistory(result.data);
      refreshOfflineCount();
    } catch (err) {
      setLoading(false);
      Alert.alert('Lookup Error', 'Failed to resolve item.');
    }
  };

  const handleCloseResultModal = () => {
    setResultModalVisible(false);
    setScannedItem(null);
    // Short delay before re-enabling camera scan to prevent instant re-trigger
    setTimeout(() => {
      setScanningActive(true);
    }, 400);
  };

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3182CE" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSubtitle}>
          To instantly scan barcodes on books, DVDs, and games, please allow camera permission.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {/* Top HUD Bar */}
        <View style={styles.topHud}>
          <TouchableOpacity
            style={styles.hudButton}
            onPress={() => setTorch(!torch)}
          >
            <Text style={styles.hudButtonText}>{torch ? '🔦 On' : '🔦 Off'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hudButton}
            onPress={() => triggerFocus()}
          >
            <Text style={styles.hudButtonText}>🎯 Focus</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hudButton}
            onPress={() => {
              if (zoom === 0) setZoom(0.07);
              else if (zoom === 0.07) setZoom(0.15);
              else setZoom(0);
            }}
          >
            <Text style={styles.hudButtonText}>
              {zoom === 0 ? '🔍 1x' : (zoom === 0.07 ? '🔍 1.5x' : '🔍 2x')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.marketPill}
            onPress={() => {
              const next = settings.marketplace === 'CA' ? 'US' : 'CA';
              const updated = { ...settings, marketplace: next };
              setSettings(updated);
              saveSettings(updated);
            }}
          >
            <Text style={styles.marketPillText}>
              {settings.marketplace === 'US' ? '🇺🇸 US' : '🇨🇦 CA'}
            </Text>
          </TouchableOpacity>

          {offlineCount > 0 ? (
            <TouchableOpacity
              style={styles.offlinePill}
              onPress={() => setOfflineVisible(true)}
            >
              <Text style={styles.offlinePillText}>📡 {offlineCount}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.hudRightGroup}>
            <TouchableOpacity
              style={styles.hudButton}
              onPress={() => setHistoryVisible(true)}
            >
              <Text style={styles.hudButtonText}>📜</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.hudButton}
              onPress={() => setSettingsVisible(true)}
            >
              <Text style={styles.hudButtonText}>⚙️</Text>
              {hasUpdate ? <View style={styles.updateDot} /> : null}
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Camera Viewfinder */}
        <View style={styles.cameraContainer}>
          {/* Only one camera can hold the device at a time: Android gives a second CameraView a
              black preview rather than an error. Both child screens need the camera, so this
              preview unmounts while either is open. expo-camera's `active` prop would be tidier,
              but it is iOS-only. The placeholder keeps the layout from collapsing. */}
          {isbnScanVisible || itemCompsVisible ? (
            <View style={styles.camera} />
          ) : (
            <CameraView
              style={styles.camera}
              facing="back"
              enableTorch={torch}
              autofocus={autofocusMode}
              zoom={zoom}
              barcodeScannerSettings={{
                barcodeTypes: SCANNER_BARCODE_TYPES
              }}
              onBarcodeScanned={scanningActive ? handleBarcodeScanned : undefined}
              onMountError={(err) => {
                console.warn('Camera mount error:', err);
                Alert.alert('Camera Error', err?.message || 'Could not access camera preview.');
              }}
            />
          )}

          {/* Touch-to-Focus Transparent Touch Layer */}
          <TouchableWithoutFeedback
            onPress={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              triggerFocus({ x: locationX, y: locationY });
            }}
          >
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>

          {/* Visual Focus Ring Indicator */}
          {focusPoint ? (
            <View
              pointerEvents="none"
              style={[
                styles.focusRing,
                { left: focusPoint.x - 32, top: focusPoint.y - 32 }
              ]}
            >
              <View style={styles.focusCenterDot} />
            </View>
          ) : null}

          {/* Laser Scanner Reticle Overlay */}
          <View style={styles.reticleOverlay} pointerEvents="none">
            <View style={styles.reticleBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <View style={styles.laserLine} />
            </View>
            <Text style={[styles.reticleHint, pendingCode ? styles.reticleHintConfirming : null]}>
              {pendingCode ? 'Hold steady to confirm...' : 'Align barcode / ISBN • Tap screen to focus'}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#48BB78" />
              <Text style={styles.loadingText}>Looking up item & prices...</Text>
            </View>
          ) : null}
        </View>

        {/* Bottom Controls Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarRow}>
            <TouchableOpacity
              style={[styles.manualEntryBtn, styles.bottomBarButtonSpaced]}
              onPress={() => setIsbnScanVisible(true)}
            >
              <Text style={styles.manualEntryBtnText}>📖 Printed ISBN</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.manualEntryBtn, styles.bottomBarButtonSpaced]}
              onPress={() => setItemCompsVisible(true)}
            >
              <Text style={styles.manualEntryBtnText}>📷 Photo Comps</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manualEntryBtn}
              onPress={() => setManualModalVisible(true)}
            >
              <Text style={styles.manualEntryBtnText}>⌨️ Type In</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Photograph any item and look up its eBay sold comps. Nothing is written to History:
            this is a lookup, not a scan. */}
        {itemCompsVisible ? (
          <ItemCompsModal
            onClose={() => setItemCompsVisible(false)}
            marketplace={settings.marketplace || 'CA'}
          />
        ) : null}

        {/* Read a book with no barcode: printed ISBN, or title for pre-1970 books.
            Mounted only while open, so each visit starts from fresh state. */}
        {isbnScanVisible ? (
          <IsbnScanModal
            onClose={() => setIsbnScanVisible(false)}
            onLookup={handleManualLookup}
          />
        ) : null}

        {/* Manual Barcode Entry Modal */}
        <ManualEntryModal
          visible={manualModalVisible}
          onClose={() => setManualModalVisible(false)}
          onSubmit={handleManualLookup}
        />

      {/* Result Modal */}
      <ScanResultModal
        visible={resultModalVisible}
        item={scannedItem}
        onClose={handleCloseResultModal}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onSettingsUpdated={(newSettings) => setSettings(newSettings)}
      />

      {/* History Modal */}
      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        onItemSelect={(item) => {
          setScannedItem(item);
          setResultModalVisible(true);
        }}
      />

      {/* Offline Queue Modal */}
      <OfflineQueueModal
        visible={offlineVisible}
        onClose={() => {
          setOfflineVisible(false);
          refreshOfflineCount();
        }}
        onSyncComplete={refreshOfflineCount}
      />
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
  safeArea: {
    flex: 1
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#1A202C',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12
  },
  permissionSubtitle: {
    color: '#A0AEC0',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24
  },
  permissionButton: {
    backgroundColor: '#3182CE',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700'
  },
  topHud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10
  },
  hudRightGroup: {
    flexDirection: 'row',
    gap: 8
  },
  hudButton: {
    backgroundColor: '#2D3748',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    position: 'relative'
  },
  updateDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#38A169',
    borderWidth: 1.5,
    borderColor: '#1A202C'
  },
  hudButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  offlinePill: {
    backgroundColor: '#DD6B20',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20
  },
  offlinePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800'
  },
  marketPill: {
    backgroundColor: '#2D3748',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A5568'
  },
  marketPillText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden'
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%'
  },
  reticleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5
  },
  reticleBox: {
    width: 300,
    height: 140,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#48BB78',
    borderWidth: 4
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 10
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 10
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4
  },
  reticleHint: {
    color: '#FFFFFF',
    marginTop: 18,
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8
  },
  reticleHintConfirming: {
    color: '#48BB78'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600'
  },
  focusRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderWidth: 2,
    borderColor: '#ECC94B',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
  },
  focusCenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ECC94B'
  },
  bottomBar: {
    backgroundColor: '#1A202C',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 60 : 24 // Elevated clearance above Android home button
  },
  bottomBarRow: {
    flexDirection: 'row'
  },
  bottomBarButtonSpaced: {
    marginRight: 8
  },
  manualEntryBtn: {
    flex: 1,
    backgroundColor: '#2D3748',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4A5568'
  },
  manualEntryBtnText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  }
});
