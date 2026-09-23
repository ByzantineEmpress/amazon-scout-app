import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert
} from 'react-native';
import { getSettings, saveSettings, clearScanHistory, clearOfflineQueue } from '../services/storage';

export default function SettingsModal({ visible, onClose, onSettingsUpdated }) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  useEffect(() => {
    if (visible) {
      loadCurrentSettings();
    }
  }, [visible]);

  const loadCurrentSettings = async () => {
    const s = await getSettings();
    setSoundEnabled(s.soundEnabled !== false);
    setVibrationEnabled(s.vibrationEnabled !== false);
  };

  const handleSave = async () => {
    const updated = {
      soundEnabled,
      vibrationEnabled
    };
    await saveSettings(updated);
    if (onSettingsUpdated) onSettingsUpdated(updated);
    onClose();
  };

  const handleClearHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to clear your local scan history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await clearScanHistory();
        Alert.alert('Cleared', 'Scan history has been cleared.');
      }}
    ]);
  };

  const handleClearOffline = () => {
    Alert.alert('Clear Offline Queue', 'Discard queued offline scans?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => {
        await clearOfflineQueue();
        Alert.alert('Cleared', 'Offline queue has been cleared.');
      }}
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>⚙️ App Settings</Text>

          <ScrollView style={styles.scroll}>
            {/* Serverless Badge */}
            <View style={styles.modeCard}>
              <Text style={styles.modeCardTitle}>⚡ 100% Serverless Mode</Text>
              <Text style={styles.modeCardText}>
                No server required! All barcode recognition, publisher restrictions (Pearson, McGraw-Hill, Wiley, etc.), and media studio checks run directly on your phone with zero monthly fees ($0.00).
              </Text>
            </View>

            {/* Feedback Toggles */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Vibration / Haptics on Scan</Text>
              <Switch
                value={vibrationEnabled}
                onValueChange={setVibrationEnabled}
                trackColor={{ false: '#4A5568', true: '#48BB78' }}
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Audio Chimes</Text>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: '#4A5568', true: '#48BB78' }}
              />
            </View>

            {/* Gating Rules Summary */}
            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Active Restriction Checks</Text>
              <Text style={styles.infoSectionBullet}>• Textbooks: Pearson, McGraw-Hill, Cengage, Wiley, Elsevier, Oxford, Cambridge, Norton</Text>
              <Text style={styles.infoSectionBullet}>• DVDs: Disney, Warner Bros, Sony, HBO, Paramount + $25 MSRP cap</Text>
              <Text style={styles.infoSectionBullet}>• Games: Nintendo, PlayStation, Xbox first-party</Text>
            </View>

            {/* Data Management */}
            <TouchableOpacity style={styles.dangerButton} onPress={handleClearHistory}>
              <Text style={styles.dangerButtonText}>Clear Local Scan History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dangerButton} onPress={handleClearOffline}>
              <Text style={styles.dangerButtonText}>Clear Offline Queue</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20
  },
  container: {
    backgroundColor: '#1A202C',
    borderRadius: 20,
    padding: 24,
    maxHeight: '85%'
  },
  scroll: {
    flexGrow: 0
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center'
  },
  modeCard: {
    backgroundColor: 'rgba(56, 161, 105, 0.15)',
    borderColor: '#38A169',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18
  },
  modeCardTitle: {
    color: '#48BB78',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 4
  },
  modeCardText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 18
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748'
  },
  toggleLabel: {
    color: '#E2E8F0',
    fontSize: 15
  },
  infoSection: {
    backgroundColor: '#2D3748',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    marginBottom: 12
  },
  infoSectionTitle: {
    color: '#CBD5E0',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  infoSectionBullet: {
    color: '#A0AEC0',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4
  },
  dangerButton: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  dangerButtonText: {
    color: '#E53E3E',
    fontSize: 13,
    fontWeight: '600'
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2D3748',
    alignItems: 'center'
  },
  cancelButtonText: {
    color: '#A0AEC0',
    fontSize: 15,
    fontWeight: '700'
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#38A169',
    alignItems: 'center'
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  }
});
