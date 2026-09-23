import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SETTINGS: '@amazon_scout_settings',
  HISTORY: '@amazon_scout_history',
  OFFLINE_QUEUE: '@amazon_scout_offline_queue'
};

const DEFAULT_SETTINGS = {
  serverUrl: 'http://localhost:3000', // Change to computer's local IP or deployed URL
  soundEnabled: true,
  vibrationEnabled: true,
  scanCooldownMs: 1500
};

export async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  try {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export async function getScanHistory() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function addScanToHistory(item) {
  try {
    const history = await getScanHistory();
    // Prepend new item and limit history to last 100 items
    const updated = [item, ...history.filter(h => h.barcode !== item.barcode)].slice(0, 100);
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to add scan to history:', e);
  }
}

export async function clearScanHistory() {
  try {
    await AsyncStorage.removeItem(KEYS.HISTORY);
  } catch (e) {
    console.error('Failed to clear history:', e);
  }
}

export async function getOfflineQueue() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function addToOfflineQueue(barcode) {
  try {
    const queue = await getOfflineQueue();
    if (!queue.includes(barcode)) {
      const updated = [...queue, barcode];
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(updated));
      return updated;
    }
    return queue;
  } catch (e) {
    console.error('Failed to add to offline queue:', e);
  }
}

export async function clearOfflineQueue() {
  try {
    await AsyncStorage.removeItem(KEYS.OFFLINE_QUEUE);
  } catch (e) {
    console.error('Failed to clear offline queue:', e);
  }
}
