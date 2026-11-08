import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import {
  Screen,
  Header,
  Card,
  Button,
  Badge,
  Chip,
  Stat,
  SectionTitle,
  Divider
} from '../design/primitives';
import { palette, space, type, layout } from '../design/theme';
import { buildEbayQuery } from '../services/ebayQuery';
import EbayCompsModal from '../components/EbayCompsModal';

/** Verdicts are advisory, so they get the tone of a warning at most - never a green light. */
function toneForStatus(status) {
  if (status === 'UNGATED') return 'neutral';
  if (status === 'CAUTION' || status === 'APPROVAL_REQUIRED') return 'warn';
  if (status === 'HARD_GATED' || status === 'RESTRICTED') return 'bad';
  return 'neutral';
}

function money(value, prefix) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return `${prefix || '$'}${amount.toFixed(2)}`;
}

/**
 * One item, however it was found.
 *
 * This is the single result view the whole app shares: a barcode scan, a printed ISBN and a
 * photograph all end here, and so does tapping an old scan in History. The old app had a separate
 * modal with its own layout and its own styles; the point of this one is that "what did I just
 * find" looks the same everywhere and says the same things in the same order.
 *
 * Two deliberate omissions from the old card:
 *
 *  - no scraped eBay price. Those requests are refused by eBay (HTTP 403), so the figure was
 *    usually absent and occasionally stale. The comps view is where eBay's data is real, so this
 *    screen offers that instead of guessing.
 *  - no "can sell" reassurance. The verdict is a local heuristic; the screen says so plainly and
 *    points at Seller Central rather than implying an answer it does not have.
 */
export default function ItemScreen({ item, onClose }) {
  const [prefer, setPrefer] = useState('title');
  const [compsVisible, setCompsVisible] = useState(false);
  const [copied, setCopied] = useState(null);

  if (!item) return null;

  const tone = toneForStatus(item.status);
  const prefix = item.currencyPrefix || (item.marketplace === 'US' ? '$' : 'CDN$ ');
  const query = buildEbayQuery({
    barcode: item.barcode,
    title: item.title,
    author: item.author,
    prefer
  });

  const copy = async (value, label) => {
    if (!value) return;
    try {
      await Clipboard.setStringAsync(String(value));
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch (_e) {
      // Clipboard is a convenience; failing it silently is better than an alert.
    }
  };

  const open = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const meta = [item.author, item.publisher, item.category].filter(Boolean).join(' · ');

  return (
    <Screen scroll>
      <Header
        title="Scan result"
        subtitle={copied ? `Copied ${copied}` : undefined}
        right={<Button label="Close" variant="secondary" size="sm" onPress={onClose} />}
      />

      <Text style={[styles.text, type.display]} numberOfLines={4}>
        {item.title || 'Unknown item'}
      </Text>
      {meta ? <Text style={[styles.text, type.small, styles.muted, styles.meta]}>{meta}</Text> : null}

      <View style={styles.badgeRow}>
        <Badge label={item.badge || 'NO VERDICT'} tone={tone} />
        {item.requiresInvoices ? <Badge label="Invoices required" tone="warn" /> : null}
      </View>

      {item.reason ? (
        <Card tone={tone} style={styles.reasonCard}>
          <Text style={[styles.text, type.body]}>{item.reason}</Text>
          <Text style={[styles.text, type.small, styles.muted, styles.reasonNote]}>
            This is a local guess from the publisher and ISBN, not an answer from Amazon. Check
            Seller Central before you buy.
          </Text>
        </Card>
      ) : null}

      <SectionTitle>Amazon prices</SectionTitle>
      <Card>
        <View style={styles.statRow}>
          <Stat
            label="Buy box"
            value={money(item.newPrice, prefix)}
            hint={item.soldByAmazon ? 'Amazon is selling this' : null}
            tone={item.soldByAmazon ? 'warn' : 'neutral'}
          />
          <Stat label="Lowest used" value={money(item.usedMin || item.lowestUsed, prefix)} />
        </View>

        {item.offerCount || item.salesRank ? (
          <>
            <Divider style={styles.divider} />
            <Text style={[styles.text, type.small, styles.muted]}>
              {[
                item.offerCount ? `${item.offerCount} offers` : null,
                item.salesRank ? `sales rank ${item.salesRank}` : null,
                item.priceSource ? `source: ${item.priceSource}` : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </>
        ) : null}
      </Card>

      <SectionTitle>eBay sold comps</SectionTitle>
      <Card>
        <View style={styles.chipRow}>
          <Chip label="Title" selected={prefer === 'title'} onPress={() => setPrefer('title')} />
          <Chip label="ISBN / code" selected={prefer === 'barcode'} onPress={() => setPrefer('barcode')} />
        </View>
        <Text style={[styles.text, type.body, styles.query]} numberOfLines={2}>
          {query || 'No searchable name or number'}
        </Text>
        <Button
          label="View sold comps"
          icon="🏷️"
          onPress={() => setCompsVisible(true)}
          style={styles.compsButton}
        />
        <Text style={[styles.text, type.small, styles.muted, styles.compsNote]}>
          Sell-through and the sold counts are read from eBay inside the comps view, where the page
          is actually loaded.
        </Text>
      </Card>

      <SectionTitle>Identifiers</SectionTitle>
      <Card padded={false}>
        <View style={styles.idRow}>
          <View style={styles.idText}>
            <Text style={[styles.text, type.tiny, styles.faint]}>BARCODE</Text>
            <Text style={[styles.text, type.body]} selectable>{item.barcode || '—'}</Text>
          </View>
          <Button label="Copy" variant="ghost" size="sm" onPress={() => copy(item.barcode, 'barcode')} />
        </View>
        <Divider />
        <View style={styles.idRow}>
          <View style={styles.idText}>
            <Text style={[styles.text, type.tiny, styles.faint]}>ASIN</Text>
            <Text style={[styles.text, type.body]} selectable>{item.asin || '—'}</Text>
          </View>
          <Button label="Copy" variant="ghost" size="sm" onPress={() => copy(item.asin, 'ASIN')} />
        </View>
      </Card>

      <SectionTitle>Open</SectionTitle>
      <View style={styles.openRow}>
        <Button
          label="Amazon"
          icon="🛒"
          variant="secondary"
          onPress={() => open(item.amazonProductUrl)}
          disabled={!item.amazonProductUrl}
          style={styles.openButton}
        />
        <Button
          label="Seller Central"
          icon="📋"
          variant="secondary"
          onPress={() => open(item.sellerCentralUrl)}
          disabled={!item.sellerCentralUrl}
          style={styles.openButton}
        />
      </View>

      <Button label="Scan next" onPress={onClose} style={styles.doneButton} />

      {compsVisible ? (
        <EbayCompsModal
          onClose={() => setCompsVisible(false)}
          query={query}
          marketplace={item.marketplace}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  faint: { color: palette.textFaint },
  meta: { marginTop: space.xs },
  badgeRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
  reasonCard: { marginTop: space.lg },
  reasonNote: { marginTop: space.sm },
  statRow: { flexDirection: 'row', gap: space.xl },
  divider: { marginVertical: space.md },
  chipRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  query: { color: palette.textMuted },
  compsButton: { marginTop: space.lg },
  compsNote: { marginTop: space.sm },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    paddingVertical: space.md,
    gap: space.md
  },
  idText: { flex: 1, gap: space.xxs },
  openRow: { flexDirection: 'row', gap: space.sm },
  openButton: { flex: 1 },
  doneButton: { marginTop: space.xl }
});
