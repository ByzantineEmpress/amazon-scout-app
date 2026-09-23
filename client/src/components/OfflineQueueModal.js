import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { getOfflineQueue, clearOfflineQueue, addScanToHistory } from '../services/storage';
import { syncOfflineQueue } from '../services/api';

export default function OfflineQueueModal({ visible, onClose, onSyncComplete }) {
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (visible) {
      loadQueue();
    }
  }, [visible]);

  const loadQueue = async () => {
    const q = await getOfflineQueue();
    setQueue(q);
  };

  const handleSync = async () => {
    if (queue.length === 0) return;
    setSyncing(true);
    try {
      const res = await syncOfflineQueue();
      setSyncing(false);
      Alert.alert('Sync Successful', `Successfully resolved ${res.items?.length || 0} queued scans.`);
      if (onSyncComplete) onSyncComplete();
      onClose();
    } catch (err) {
      setSyncing(false);
      Alert.alert('Sync Failed', 'Could not resolve items. Verify your internet/cell connection.');
    }
  };

  const handleClear = () => {
    Alert.alert('Clear Queue', 'Discard queued offline scans?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => {
        await clearOfflineQueue();
        setQueue([]);
      }}
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>📡 Offline Queue ({queue.length})</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            These barcodes were scanned while cell service was down. Tap &quot;Sync Queue Now&quot; to look up all items in one batch.
          </Text>

          {queue.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Queue is empty. All scans are synced!</Text>
            </View>
          ) : (
            <>
              <FlatList
                data={queue}
                keyExtractor={(item) => item}
                renderItem={({ item, index }) => (
                  <View style={styles.queueRow}>
                    <Text style={styles.queueIndex}>#{index + 1}</Text>
                    <Text style={styles.queueBarcode}>Barcode: {item}</Text>
                  </View>
                )}
                style={styles.list}
              />

              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.syncButtonText}>⚡ Sync Queue Now ({queue.length} items)</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                <Text style={styles.clearButtonText}>Discard Queue</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end'
  },
  container: {
    backgroundColor: '#1A202C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800'
  },
  closeBtn: {
    padding: 6
  },
  closeBtnText: {
    color: '#A0AEC0',
    fontSize: 18,
    fontWeight: '700'
  },
  hint: {
    color: '#A0AEC0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center'
  },
  emptyText: {
    color: '#48BB78',
    fontSize: 16,
    fontWeight: '600'
  },
  list: {
    maxHeight: 250,
    marginBottom: 16
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D3748',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6
  },
  queueIndex: {
    color: '#ECC94B',
    fontWeight: '800',
    width: 35
  },
  queueBarcode: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  syncButton: {
    backgroundColor: '#38A169',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800'
  },
  clearButton: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  clearButtonText: {
    color: '#E53E3E',
    fontSize: 13
  }
});
