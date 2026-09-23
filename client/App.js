import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

import { scanBarcode } from './src/services/api';
import { getSettings, addScanToHistory, getOfflineQueue } from './src/services/storage';
import ScanResultModal from './src/components/ScanResultModal';
import SettingsModal from './src/components/SettingsModal';
import HistoryModal from './src/components/HistoryModal';
import OfflineQueueModal from './src/components/OfflineQueueModal';

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

  // Manual input
  const [manualInputVisible, setManualInputVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  // Settings & state
  const [settings, setSettings] = useState({
    serverUrl: 'http://localhost:3000',
    soundEnabled: true,
    vibrationEnabled: true,
    scanCooldownMs: 1500
  });
  const [offlineCount, setOfflineCount] = useState(0);

  const lastScannedTime = useRef(0);
  const lastBarcode = useRef('');

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    const s = await getSettings();
    setSettings(s);
    refreshOfflineCount();
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
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      // Haptics not supported on device
    }
  };

  const handleBarcodeScanned = async ({ data }) => {
    if (!scanningActive || loading) return;

    const now = Date.now();
    // Debounce duplicate scans
    if (data === lastBarcode.current && now - lastScannedTime.current < (settings.scanCooldownMs || 1500)) {
      return;
    }

    lastBarcode.current = data;
    lastScannedTime.current = now;
    setScanningActive(false);
    setLoading(true);

    try {
      const result = await scanBarcode(data);
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

  const handleManualLookup = async () => {
    if (!manualBarcode.trim()) return;
    setManualInputVisible(false);
    setLoading(true);

    try {
      const result = await scanBarcode(manualBarcode.trim());
      setLoading(false);
      setManualBarcode('');
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
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {/* Top HUD Bar */}
        <View style={styles.topHud}>
          <TouchableOpacity
            style={styles.hudButton}
            onPress={() => setTorch(!torch)}
          >
            <Text style={styles.hudButtonText}>{torch ? '🔦 On' : '🔦 Off'}</Text>
          </TouchableOpacity>

          {offlineCount > 0 ? (
            <TouchableOpacity
              style={styles.offlinePill}
              onPress={() => setOfflineVisible(true)}
            >
              <Text style={styles.offlinePillText}>📡 Offline: {offlineCount}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.hudRightGroup}>
            <TouchableOpacity
              style={styles.hudButton}
              onPress={() => setHistoryVisible(true)}
            >
              <Text style={styles.hudButtonText}>📜 History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.hudButton}
              onPress={() => setSettingsVisible(true)}
            >
              <Text style={styles.hudButtonText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Camera Viewfinder */}
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code128', 'qr']
            }}
            onBarcodeScanned={scanningActive ? handleBarcodeScanned : undefined}
            onMountError={(err) => {
              console.warn('Camera mount error:', err);
              Alert.alert('Camera Error', err?.message || 'Could not access camera preview.');
            }}
          />

          {/* Laser Scanner Reticle Overlay */}
          <View style={styles.reticleOverlay} pointerEvents="none">
            <View style={styles.reticleBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <View style={styles.laserLine} />
            </View>
            <Text style={styles.reticleHint}>Align barcode / ISBN within the frame</Text>
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
        <TouchableOpacity
          style={styles.manualEntryBtn}
          onPress={() => setManualInputVisible(!manualInputVisible)}
        >
          <Text style={styles.manualEntryBtnText}>⌨️ Type Barcode / ISBN</Text>
        </TouchableOpacity>

        {manualInputVisible ? (
          <View style={styles.manualInputRow}>
            <TextInput
              style={styles.manualTextInput}
              placeholder="e.g. 9780132350884"
              placeholderTextColor="#718096"
              keyboardType="numeric"
              value={manualBarcode}
              onChangeText={setManualBarcode}
              autoFocus
            />
            <TouchableOpacity style={styles.manualSubmitBtn} onPress={handleManualLookup}>
              <Text style={styles.manualSubmitBtnText}>Look Up</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 12,
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
    borderRadius: 8
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
  cameraContainer: {
    flex: 1,
    overflow: 'hidden'
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%'
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reticleBox: {
    width: 280,
    height: 180,
    position: 'relative',
    justifyContent: 'center'
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#48BB78',
    borderWidth: 4
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0
  },
  laserLine: {
    height: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    shadowColor: '#EF4444',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4
  },
  reticleHint: {
    color: '#FFFFFF',
    marginTop: 20,
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4
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
  bottomBar: {
    backgroundColor: '#1A202C',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 28 : 16
  },
  manualEntryBtn: {
    backgroundColor: '#2D3748',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  manualEntryBtnText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700'
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12
  },
  manualTextInput: {
    flex: 1,
    backgroundColor: '#000000',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#4A5568'
  },
  manualSubmitBtn: {
    backgroundColor: '#3182CE',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8
  },
  manualSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800'
  }
});
