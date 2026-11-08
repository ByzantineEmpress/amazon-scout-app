import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Screen, Header, Card, Badge, Field, Button, EmptyState } from '../design/primitives';
import { palette, space, type, layout } from '../design/theme';
import { getScanHistory } from '../services/storage';

/** Verdicts mean one of three things, so they get one of three tones. */
function toneForStatus(status) {
  if (status === 'UNGATED') return 'good';
  if (status === 'CAUTION' || status === 'APPROVAL_REQUIRED') return 'warn';
  if (status === 'HARD_GATED' || status === 'RESTRICTED') return 'bad';
  return 'neutral';
}

/** History is read in "how long ago", not timestamps. */
function timeAgo(timestamp) {
  if (!timestamp) return '';
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function priceLabel(item) {
  const value = Number(item?.usedMin);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${item.currencyPrefix || '$'}${value.toFixed(2)}`;
}

/**
 * Every scan this device has kept, newest first, searchable.
 *
 * A screen rather than a modal: it is somewhere you go, not an interruption. `onClose` is
 * optional so the same component works as a modal today and as a tab once the shell exists.
 */
export default function HistoryScreen({ onClose, onItemSelect }) {
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getScanHistory()
      .then((list) => {
        if (alive) setHistory(Array.isArray(list) ? list : []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return history;
    return history.filter((item) => {
      const haystack = `${item?.title ?? ''} ${item?.barcode ?? ''} ${item?.publisher ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [history, search]);

  const renderRow = ({ item }) => {
    const price = priceLabel(item);
    return (
      <Card onPress={onItemSelect ? () => onItemSelect(item) : undefined} style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={[styles.text, type.heading]} numberOfLines={2}>
            {item?.title || 'Unknown item'}
          </Text>
          <Text style={[styles.text, type.small, styles.muted]} numberOfLines={1}>
            {[item?.barcode, item?.publisher, timeAgo(item?.timestamp)].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View style={styles.rowSide}>
          {price ? <Text style={[styles.text, type.heading, styles.price]}>{price}</Text> : null}
          {item?.badge ? <Badge label={item.badge} tone={toneForStatus(item.status)} /> : null}
        </View>
      </Card>
    );
  };

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Header
          title="History"
          subtitle={history.length === 1 ? '1 scan on this device' : `${history.length} scans on this device`}
          right={onClose ? <Button label="Done" variant="secondary" size="sm" onPress={onClose} /> : null}
        />
        <Field
          placeholder="Search title, barcode or publisher"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon="🔎"
          title={history.length === 0 ? 'Nothing scanned yet' : 'No matches'}
          body={
            history.length === 0
              ? 'Scans you make are kept here, so you can look one up again without walking back to the shelf.'
              : 'Try a shorter search — part of a title or a few digits of the barcode.'
          }
          action={
            search ? (
              <Button label="Clear search" variant="secondary" size="sm" onPress={() => setSearch('')} />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => `${item?.barcode ?? 'item'}-${index}`}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  price: { color: palette.good },
  head: { paddingHorizontal: layout.gutter },
  list: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.sm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    gap: space.md
  },
  rowMain: { flex: 1, gap: space.xxs },
  rowSide: { alignItems: 'flex-end', gap: space.xs }
});
