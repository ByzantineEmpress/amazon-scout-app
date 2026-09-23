import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput
} from 'react-native';
import { getScanHistory } from '../services/storage';

export default function HistoryModal({ visible, onClose, onItemSelect }) {
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) {
      loadHistory();
    }
  }, [visible]);

  const loadHistory = async () => {
    const list = await getScanHistory();
    setHistory(list);
  };

  const filteredHistory = history.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.barcode && item.barcode.includes(q)) ||
      (item.publisher && item.publisher.toLowerCase().includes(q))
    );
  });

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemRow}
      onPress={() => {
        onItemSelect(item);
        onClose();
      }}
    >
      <View style={[styles.badgeIndicator, { backgroundColor: item.badgeColor || '#718096' }]} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title || 'Unknown Item'}</Text>
        <Text style={styles.itemSubtitle}>
          {item.barcode} {item.publisher ? `• ${item.publisher}` : ''}
        </Text>
      </View>
      <View style={styles.priceTag}>
        <Text style={styles.statusLabel}>{item.badge}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>📜 Scan History ({history.length})</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search scanned items..."
            placeholderTextColor="#718096"
            value={search}
            onChangeText={setSearch}
          />

          {filteredHistory.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No scans recorded yet.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredHistory}
              keyExtractor={(item, idx) => `${item.barcode}-${idx}`}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
            />
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
    maxHeight: '85%',
    padding: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
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
  searchInput: {
    backgroundColor: '#2D3748',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    fontSize: 14
  },
  listContent: {
    paddingBottom: 20
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D3748',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8
  },
  badgeIndicator: {
    width: 6,
    height: 36,
    borderRadius: 3,
    marginRight: 10
  },
  itemInfo: {
    flex: 1,
    marginRight: 10
  },
  itemTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3
  },
  itemSubtitle: {
    color: '#A0AEC0',
    fontSize: 12
  },
  priceTag: {
    alignItems: 'flex-end'
  },
  statusLabel: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700'
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center'
  },
  emptyText: {
    color: '#718096',
    fontSize: 15
  }
});
