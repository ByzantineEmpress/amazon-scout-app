import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { getSettings, saveSettings, clearScanHistory, clearOfflineQueue } from '../services/storage';
import { checkForUpdate, openUpdateDownload, CURRENT_VERSION } from '../services/updateService';

export default function SettingsModal({ visible, onClose, onSettingsUpdated }) {
  const [marketplace, setMarketplace] = useState('CA');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [githubToken, setGithubToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  useEffect(() => {
    if (visible) {
      loadCurrentSettings();
      setUpdateResult(null);
    }
  }, [visible]);

  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const res = await checkForUpdate();
      setUpdateResult(res);
      if (res.success && !res.updateAvailable) {
        Alert.alert(
          'Up to Date ✅',
          `You are running the latest version of Amazon Scout (v${CURRENT_VERSION}).`
        );
      } else if (!res.success) {
        Alert.alert('Update Check Failed', res.error || 'Could not connect to GitHub Releases.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to check for updates');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async (url) => {
    try {
      await openUpdateDownload(url);
    } catch (err) {
      Alert.alert('Download Error', 'Could not open update link: ' + err.message);
    }
  };

  const loadCurrentSettings = async () => {
    const s = await getSettings();
    setMarketplace(s.marketplace || 'CA');
    setSoundEnabled(s.soundEnabled !== false);
    setVibrationEnabled(s.vibrationEnabled !== false);
    setGithubToken(s.githubToken || '');
  };

  const handleSave = async () => {
    const updated = {
      marketplace,
      soundEnabled,
      vibrationEnabled,
      githubToken: (githubToken || '').trim()
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
            {/* Marketplace Selection */}
            <View style={styles.marketplaceSection}>
              <Text style={styles.sectionLabel}>Target Amazon Marketplace</Text>
              <View style={styles.marketplaceRow}>
                <TouchableOpacity
                  style={[styles.marketBtn, marketplace === 'CA' && styles.marketBtnActive]}
                  onPress={() => setMarketplace('CA')}
                >
                  <Text style={[styles.marketBtnText, marketplace === 'CA' && styles.marketBtnTextActive]}>
                    🇨🇦 Amazon.ca (CAD)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.marketBtn, marketplace === 'US' && styles.marketBtnActive]}
                  onPress={() => setMarketplace('US')}
                >
                  <Text style={[styles.marketBtnText, marketplace === 'US' && styles.marketBtnTextActive]}>
                    🇺🇸 Amazon.com (USD)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Serverless Badge */}
            <View style={styles.modeCard}>
              <Text style={styles.modeCardTitle}>⚡ 100% Serverless & Canadian Optimized</Text>
              <Text style={styles.modeCardText}>
                Tailored for Canadian resellers! Includes gating rules for Nelson Education Canada, McGraw-Hill Ryerson, eOne Canada, Pearson, and Disney.
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

            {/* App Version & Updates */}
            <View style={styles.updateSection}>
              <View style={styles.versionHeaderRow}>
                <View>
                  <Text style={styles.sectionLabel}>App Version</Text>
                  <Text style={styles.versionNumber}>v{CURRENT_VERSION}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.checkUpdateBtn, checkingUpdate && styles.btnDisabled]}
                  onPress={handleCheckForUpdate}
                  disabled={checkingUpdate}
                >
                  {checkingUpdate ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.checkUpdateBtnText}>🔄 Check for Updates</Text>
                  )}
                </TouchableOpacity>
              </View>

              {updateResult?.success && updateResult.updateAvailable && (
                <View style={styles.updateCard}>
                  <Text style={styles.updateCardTitle}>🎉 New Version: {updateResult.latestTag}</Text>
                  {updateResult.notes ? (
                    <Text style={styles.updateCardNotes} numberOfLines={3}>
                      {updateResult.notes}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.downloadUpdateBtn}
                    onPress={() => handleDownloadUpdate(updateResult.downloadUrl)}
                  >
                    <Text style={styles.downloadUpdateBtnText}>
                      ⬇️ Download & Install ({updateResult.isDirectApk ? 'APK' : 'GitHub'})
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Private Repo Token Toggle */}
              <TouchableOpacity
                style={styles.tokenToggleBtn}
                onPress={() => setShowTokenInput(!showTokenInput)}
              >
                <Text style={styles.tokenToggleText}>
                  {showTokenInput ? '▲ Hide Private Token' : '🔑 Configure GitHub Token (for Private Repos)'}
                </Text>
              </TouchableOpacity>

              {showTokenInput ? (
                <View style={styles.tokenContainer}>
                  <Text style={styles.tokenHint}>
                    Required only if your GitHub repo is set to Private.
                  </Text>
                  <TextInput
                    style={styles.tokenInput}
                    placeholder="Paste ghp_xxxx Personal Token..."
                    placeholderTextColor="#718096"
                    value={githubToken}
                    onChangeText={setGithubToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>
              ) : null}
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
  marketplaceSection: {
    marginBottom: 16
  },
  sectionLabel: {
    color: '#CBD5E0',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8
  },
  marketplaceRow: {
    flexDirection: 'row',
    gap: 8
  },
  marketBtn: {
    flex: 1,
    backgroundColor: '#2D3748',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent'
  },
  marketBtnActive: {
    borderColor: '#38A169',
    backgroundColor: 'rgba(56, 161, 105, 0.2)'
  },
  marketBtnText: {
    color: '#A0AEC0',
    fontWeight: '700',
    fontSize: 13
  },
  marketBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800'
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
  dangerButton: {
    marginTop: 12,
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
  },
  updateSection: {
    marginTop: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: '#232D3F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151'
  },
  versionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  versionNumber: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800'
  },
  checkUpdateBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140
  },
  checkUpdateBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  btnDisabled: {
    opacity: 0.6
  },
  updateCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(56, 161, 105, 0.2)',
    borderColor: '#38A169',
    borderWidth: 1.5,
    borderRadius: 10
  },
  updateCardTitle: {
    color: '#48BB78',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 4
  },
  updateCardNotes: {
    color: '#CBD5E0',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10
  },
  downloadUpdateBtn: {
    backgroundColor: '#38A169',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  downloadUpdateBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  tokenToggleBtn: {
    marginTop: 10,
    paddingVertical: 4
  },
  tokenToggleText: {
    color: '#94A3B8',
    fontSize: 12,
    textDecorationLine: 'underline'
  },
  tokenContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  tokenHint: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6
  },
  tokenInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#475569'
  }
});
