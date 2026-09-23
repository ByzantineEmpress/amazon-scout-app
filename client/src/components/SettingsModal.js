import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert
} from 'react-native';
import { getSettings, saveSettings, clearScanHistory, clearOfflineQueue } from '../services/storage';
import { testServerConnection } from '../services/api';

export default function SettingsModal({ visible, onClose, onSettingsUpdated }) {
  const [serverUrl, setServerUrl] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (visible) {
      loadCurrentSettings();
    }
  }, [visible]);

  const loadCurrentSettings = async () => {
    const s = await getSettings();
    setServerUrl(s.serverUrl || 'http://localhost:3000');
    setSoundEnabled(s.soundEnabled !== false);
    setVibrationEnabled(s.vibrationEnabled !== false);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const start = Date.now();
    const res = await testServerConnection(serverUrl);
    const latency = Date.now() - start;
    setTesting(false);

    if (res.ok) {
      setTestResult({
        success: true,
        message: `Connected (${latency}ms) - Mode: ${res.data.mode}`
      });
    } else {
      setTestResult({
        success: false,
        message: `Connection failed: ${res.error}`
      });
    }
  };

  const handleSave = async () => {
    const updated = {
      serverUrl: serverUrl.trim(),
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>⚙️ App Settings</Text>

          {/* Server URL Input */}
          <Text style={styles.label}>Backend Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.X:3000"
            placeholderTextColor="#718096"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            💡 For phones on local Wi-Fi, enter your computer's local IP (e.g. http://192.168.1.15:3000), or your deployed cloud server URL.
          </Text>

          {/* Test Connection Button */}
          <TouchableOpacity
            style={styles.testButton}
            onPress={handleTestConnection}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.testButtonText}>Test Server Connection</Text>
            )}
          </TouchableOpacity>

          {testResult ? (
            <View style={[styles.testBox, testResult.success ? styles.testSuccess : styles.testError]}>
              <Text style={[styles.testText, testResult.success ? styles.testTextSuccess : styles.testTextError]}>
                {testResult.message}
              </Text>
            </View>
          ) : null}

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

          {/* Data Management */}
          <TouchableOpacity style={styles.dangerButton} onPress={handleClearHistory}>
            <Text style={styles.dangerButtonText}>Clear Local Scan History</Text>
          </TouchableOpacity>

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
    padding: 24
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center'
  },
  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6
  },
  input: {
    backgroundColor: '#2D3748',
    color: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#4A5568',
    marginBottom: 6
  },
  hint: {
    color: '#A0AEC0',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 16
  },
  testButton: {
    backgroundColor: '#4A5568',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12
  },
  testButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  testBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 16
  },
  testSuccess: {
    backgroundColor: 'rgba(56, 161, 105, 0.2)',
    borderColor: '#38A169',
    borderWidth: 1
  },
  testError: {
    backgroundColor: 'rgba(229, 62, 62, 0.2)',
    borderColor: '#E53E3E',
    borderWidth: 1
  },
  testText: {
    fontSize: 12,
    fontWeight: '600'
  },
  testTextSuccess: {
    color: '#48BB78'
  },
  testTextError: {
    color: '#FC8181'
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
  dangerButton: {
    marginTop: 18,
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
    marginTop: 20
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
