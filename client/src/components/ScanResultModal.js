import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchEbaySoldLowest, launchEbaySold } from '../services/ebayService';
import { buildEbayQuery } from '../services/ebayQuery';
import { sellThroughBand } from '../services/ebayHtml';
import EbayCompsModal from './EbayCompsModal';

/**
 * Sell-through is an estimate built from two search-result counts, so it is coloured to be read
 * at a glance but never labelled with a word that would claim more than that. The thresholds are
 * reseller convention (60 / 30), not anything eBay publishes.
 */
const SELL_THROUGH_COLOURS = { high: '#48BB78', medium: '#ECC94B', low: '#FC8181' };

export default function ScanResultModal({ visible, item, onClose }) {
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [ebayData, setEbayData] = useState({ loading: true, price: null, currencyPrefix: 'CDN$ ' });
  const [showEbayComps, setShowEbayComps] = useState(false);
  // eBay sellers type a book's title, not its ISBN, so the title query is the default and the
  // ISBN stays available for the listings that do quote a number. See services/ebayQuery.js.
  const [ebaySearchMode, setEbaySearchMode] = useState('title');

  const ebayQuery = buildEbayQuery({
    barcode: item?.barcode,
    title: item?.title,
    author: item?.author,
    prefer: ebaySearchMode
  });

  useEffect(() => {
    let isMounted = true;
    if (!item?.barcode && !item?.title) {
      setEbayData({ loading: false, price: null, currencyPrefix: 'CDN$ ' });
      return;
    }

    setEbayData({ loading: true, price: null, currencyPrefix: item.currencyPrefix || (item.marketplace === 'US' ? '$' : 'CDN$ ') });

    fetchEbaySoldLowest({
      barcode: item.barcode,
      title: item.title,
      author: item.author,
      marketplace: item.marketplace
    })
      .then((res) => {
        if (isMounted) {
          // Spread the whole response rather than re-listing its fields. The service's shape is
          // then the single source of truth: a field it returns reaches the UI without a second
          // place that has to remember to copy it. Hand-listing fields here is what once left the
          // sell-through numbers being fetched, parsed, rendered - and dropped on the floor.
          setEbayData({
            loading: false,
            currencyPrefix: res?.currencyPrefix || (item.marketplace === 'US' ? '$' : 'CDN$ '),
            ...res
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setEbayData({ loading: false, price: null, currencyPrefix: item.currencyPrefix || 'CDN$ ' });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [item?.barcode, item?.title, item?.author, item?.marketplace]);

  // EVERY hook must be called above this guard. An early return placed between hooks means the
  // component runs a different number of them depending on whether `item` is set, and React
  // reacts to that by throwing the moment a scan (or a past scan from History) sets `item`.
  // The effect above is null-safe: its own guard handles `item` being null.
  if (!item) return null;

  const isRestricted = item.status === 'HARD_GATED' || item.status === 'RESTRICTED';
  const isApprovalRequired = item.status === 'APPROVAL_REQUIRED';
  const isSafe = item.status === 'UNGATED';
  const isUnknown = item.status === 'UNKNOWN';

  const copyToClipboard = async (text, label) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setCopyFeedback(`📋 Copied ${label || text} to clipboard!`);
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch (e) {}
  };

  const handleOpenSellerCentral = async () => {
    const asinOrQuery = item.asin || item.barcode;
    
    // Always copy ISBN/ASIN to clipboard so user can immediately paste in Seller App
    if (asinOrQuery) {
      await copyToClipboard(asinOrQuery, asinOrQuery);
    }

    // On Android: Try to launch the native Amazon Seller App directly
    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.openApplication('com.amazon.sellermobile.android');
        return;
      } catch (err) {
        // Amazon Seller app is not installed or couldn't be opened, fall through to browser
      }
    }

    // Fallback: Open productsearch URL in browser
    if (item.sellerCentralUrl) {
      try {
        const canOpen = await Linking.canOpenURL(item.sellerCentralUrl);
        if (canOpen) {
          await Linking.openURL(item.sellerCentralUrl);
          return;
        }
      } catch (err) {
        // Fall back to WebBrowser
      }
      await WebBrowser.openBrowserAsync(item.sellerCentralUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
      });
    }
  };

  const handleOpenAmazonProduct = async () => {
    if (item.amazonProductUrl) {
      await WebBrowser.openBrowserAsync(item.amazonProductUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
      });
    }
  };

  const handleOpenEbaySold = async () => {
    // Copy the search terms, not the ISBN: the terms are what the eBay app search box wants.
    if (ebayQuery) {
      await copyToClipboard(ebayQuery, 'Search terms');
    }
    await launchEbaySold({
      barcode: item.barcode,
      title: item.title,
      author: item.author,
      marketplace: item.marketplace
    });
  };

  // The URL already carries the barcode/title, so there is nothing to copy first.
  const handleOpenEbayComps = () => setShowEbayComps(true);

  const ebayBand = sellThroughBand(ebayData.sellThrough);
  const ebayCountsKnown =
    Number.isFinite(ebayData.soldCount) && Number.isFinite(ebayData.activeCount);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        // Android hardware back should dismiss the comps pane before the whole scan card.
        if (showEbayComps) {
          setShowEbayComps(false);
        } else {
          onClose();
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.cardContainer}>
          {/* Header Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: item.badgeColor || '#4A5568' }]}>
            <Text style={[styles.statusBannerText, { color: item.textColor || (isUnknown ? '#1A202C' : '#FFFFFF') }]}>
              {item.badge || 'SCANNED'}
            </Text>
          </View>

          {/* Copy Toast Feedback */}
          {copyFeedback ? (
            <View style={styles.copyToast}>
              <Text style={styles.copyToastText}>{copyFeedback}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentPadding}>
            {/* Title & Metadata */}
            <Text style={styles.titleText} numberOfLines={3}>
              {item.title || 'Unknown Product'}
            </Text>

            <View style={styles.metaRow}>
              {item.publisher ? (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaLabel}>Pub/Brand:</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{item.publisher}</Text>
                </View>
              ) : null}

              {item.category ? (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaLabel}>Category:</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{item.category}</Text>
                </View>
              ) : null}
            </View>

            {/* Restriction Alert Box */}
            <View style={[
              styles.reasonBox,
              isRestricted ? styles.reasonBoxDanger : (isApprovalRequired ? styles.reasonBoxApproval : (isUnknown ? styles.reasonBoxUnknown : (isSafe ? styles.reasonBoxSafe : styles.reasonBoxWarning)))
            ]}>
              <Text style={[styles.reasonTitle, isUnknown && styles.reasonTitleUnknown, isApprovalRequired && styles.reasonTitleApproval]}>
                {isRestricted ? '⛔ INVOICE REQUIRED (HARD GATED)' : (isApprovalRequired ? '⚠️ BRAND RESTRICTION - CHECK APPROVAL' : (isUnknown ? '❓ UNKNOWN ITEM - CHECK RESTRICTIONS' : (isSafe ? '✅ NO KNOWN GATING' : 'ℹ️ NOTE')))}
              </Text>
              <Text style={styles.reasonText}>{item.reason}</Text>
              {isApprovalRequired ? (
                <Text style={styles.approvalGuidance}>
                  💡 Tap "⚡ Open in Amazon Seller App" below. If Amazon auto-approves you on the spot, BUY IT! If it asks for invoices, PASS.
                </Text>
              ) : null}
              {item.requiresInvoices ? (
                <Text style={styles.invoicesWarning}>
                  ⛔ Requires 10-unit wholesale distributor invoices (Ingram/Baker & Taylor). DO NOT BUY from thrift stores!
                </Text>
              ) : null}
            </View>

            {/* Pricing Section */}
            <View style={styles.priceContainer}>
              <Text style={styles.sectionHeader}>
                Used Pricing ({item.marketplace === 'US' ? 'Amazon.com 🇺🇸' : 'Amazon.ca 🇨🇦'})
              </Text>

              {/* Real offer list from the Amazon product detail page — the "exact Amazon
                  pricing" the paid scouting apps show. Shown alongside the search-snippet
                  prices, never instead of them, and only when the detail scrape returned
                  something. */}
              {(item.newPrice != null || item.lowestUsed != null || item.salesRank || item.offerCount != null) ? (
                <View style={styles.offerCard}>
                  <Text style={styles.offerCardTitle}>
                    🏷️ Live Amazon Offers {item.soldByAmazon ? '• Sold by Amazon' : ''}
                  </Text>
                  <View style={styles.offerRow}>
                    {item.newPrice != null ? (
                      <View style={styles.offerCell}>
                        <Text style={styles.offerCellLabel}>New / Buy Box</Text>
                        <Text style={styles.offerCellPrice}>
                          {item.currencyPrefix}{Number(item.newPrice).toFixed(2)}
                        </Text>
                      </View>
                    ) : null}
                    {item.lowestUsed != null ? (
                      <View style={styles.offerCell}>
                        <Text style={styles.offerCellLabel}>Lowest Used</Text>
                        <Text style={styles.offerCellPrice}>
                          {item.currencyPrefix}{Number(item.lowestUsed).toFixed(2)}
                        </Text>
                      </View>
                    ) : null}
                    {item.offerCount != null ? (
                      <View style={styles.offerCell}>
                        <Text style={styles.offerCellLabel}>Offers</Text>
                        <Text style={styles.offerCellPrice}>{item.offerCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  {item.salesRank ? (
                    <Text style={styles.offerRank}>📊 {item.salesRank}</Text>
                  ) : null}
                </View>
              ) : null}

              {item.usedMin || item.usedBuyBox ? (
                <>
                  <View style={styles.priceGrid}>
                    <View style={styles.priceBox}>
                      <Text style={styles.priceBoxLabel}>Lowest Used</Text>
                      <Text style={styles.priceBoxValue}>
                        {item.usedMin ? `${item.currencyPrefix || 'CDN$ '}${Number(item.usedMin).toFixed(2)}` : 'N/A'}
                      </Text>
                    </View>

                    <View style={styles.priceBox}>
                      <Text style={styles.priceBoxLabel}>Buy Box</Text>
                      <Text style={styles.priceBoxValue}>
                        {item.usedBuyBox ? `${item.currencyPrefix || 'CDN$ '}${Number(item.usedBuyBox).toFixed(2)}` : 'N/A'}
                      </Text>
                    </View>
                  </View>
                  {item.priceSource ? (
                    <Text style={styles.priceSourceBadge}>
                      📍 {item.priceSource}
                    </Text>
                  ) : null}
                </>
              ) : (
                <TouchableOpacity
                  style={styles.livePriceQuickBtn}
                  onPress={handleOpenAmazonProduct}
                >
                  <Text style={styles.livePriceQuickBtnText}>
                    ⚡ Check Live Used Offers ({item.marketplace === 'US' ? 'Amazon.com' : 'Amazon.ca'})
                  </Text>
                  <Text style={styles.livePriceSubtext}>Tap to slide up live Canadian used offers</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* eBay Sold Lowest Section */}
            <View style={styles.ebayContainer}>
              <View style={styles.ebayHeaderRow}>
                <Text style={styles.ebayHeaderTitle}>
                  🏷️ eBay Sold Lowest ({item.marketplace === 'US' ? 'eBay.com 🇺🇸' : 'eBay.ca 🇨🇦'})
                </Text>
                <TouchableOpacity style={styles.ebayQuickLinkBtn} onPress={handleOpenEbaySold}>
                  <Text style={styles.ebayQuickLinkText}>Open eBay ↗</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.ebayModeRow}>
                <Text style={styles.ebayModeLabel}>Search by</Text>
                <TouchableOpacity
                  style={[styles.ebayModeBtn, ebaySearchMode === 'title' && styles.ebayModeBtnActive]}
                  onPress={() => setEbaySearchMode('title')}
                >
                  <Text style={[styles.ebayModeText, ebaySearchMode === 'title' && styles.ebayModeTextActive]}>
                    Title
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ebayModeBtn, ebaySearchMode === 'barcode' && styles.ebayModeBtnActive]}
                  onPress={() => setEbaySearchMode('barcode')}
                >
                  <Text style={[styles.ebayModeText, ebaySearchMode === 'barcode' && styles.ebayModeTextActive]}>
                    ISBN
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.ebayQueryText} numberOfLines={1}>
                🔎 {ebayQuery || 'no search terms available'}
              </Text>

              {ebayData.loading ? (
                <View style={styles.ebayLoadingRow}>
                  <ActivityIndicator size="small" color="#ECC94B" />
                  <Text style={styles.ebayLoadingText}>Checking eBay sold comps...</Text>
                </View>
              ) : ebayData.price || ebayBand ? (
                <View style={styles.ebayPriceRow}>
                  <View style={styles.ebayPriceColumn}>
                    {ebayData.price ? (
                      <Text style={styles.ebayPriceValue}>
                        {ebayData.currencyPrefix}{Number(ebayData.price).toFixed(2)}
                      </Text>
                    ) : null}
                    <Text style={styles.ebayPriceSub}>
                      {ebayData.price
                        ? `Lowest sold match (${ebayData.matchedBy === 'barcode' ? 'ISBN' : 'title'})`
                        : 'No sold price read from that search'}
                    </Text>

                    {ebayBand ? (
                      <View style={styles.sellThroughRow}>
                        <View style={[styles.sellThroughDot, { backgroundColor: SELL_THROUGH_COLOURS[ebayBand] }]} />
                        <Text style={styles.sellThroughText}>
                          Sell-through {ebayData.sellThrough}%
                          {ebayCountsKnown
                            ? ` · ${ebayData.soldCount} sold / ${ebayData.activeCount} listed`
                            : ''}
                        </Text>
                      </View>
                    ) : ebayData.price ? (
                      // Say so rather than showing nothing: silence here is indistinguishable from
                      // a feature that does not work.
                      <Text style={styles.sellThroughUnavailable}>
                        Sell-through unavailable for this search
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity style={styles.ebayActionBtn} onPress={handleOpenEbayComps}>
                    <Text style={styles.ebayActionBtnText}>⚡ View Sold Comps</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.ebayEmptyRow}>
                  <Text style={styles.ebayEmptyText}>
                    {item.usedMin ? 'Looking for completed comps?' : 'Amazon price unavailable?'}
                  </Text>
                  <TouchableOpacity style={styles.ebayCheckSoldBtn} onPress={handleOpenEbayComps}>
                    <Text style={styles.ebayCheckSoldBtnText}>
                      ⚡ Check Sold Comps on {item.marketplace === 'US' ? 'eBay.com' : 'eBay.ca'}
                    </Text>
                    <Text style={styles.ebayCheckSoldSubtext}>
                      Opens sold &amp; completed listings inside the app
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Barcode & ASIN with Tap-to-Copy */}
            <View style={styles.idRow}>
              <TouchableOpacity
                style={styles.idChip}
                onPress={() => copyToClipboard(item.barcode, 'Barcode')}
              >
                <Text style={styles.idText}>
                  Barcode: <Text style={styles.idHighlight}>{item.barcode}</Text> 📋
                </Text>
              </TouchableOpacity>
              {item.asin ? (
                <TouchableOpacity
                  style={styles.idChip}
                  onPress={() => copyToClipboard(item.asin, 'ASIN')}
                >
                  <Text style={styles.idText}>
                    ASIN: <Text style={styles.idHighlight}>{item.asin}</Text> 📋
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Quick Actions */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.sellerCentralButton,
                  isApprovalRequired && styles.sellerCentralButtonApproval
                ]}
                onPress={handleOpenSellerCentral}
              >
                <Text style={styles.sellerCentralButtonText}>
                  {isApprovalRequired ? '⚡ Open in Amazon Seller App (Auto-Copies ISBN)' : `⚡ Open in Amazon Seller App (${item.marketplace === 'US' ? '.com' : '.ca'})`}
                </Text>
              </TouchableOpacity>

              <Text style={styles.sellerAppHelpText}>
                📌 Auto-copies {item.asin || item.barcode} to clipboard — simply paste into Seller App search!
              </Text>

              <TouchableOpacity
                style={styles.amazonButton}
                onPress={handleOpenAmazonProduct}
              >
                <Text style={styles.amazonButtonText}>
                  🌐 View Live on {item.marketplace === 'US' ? 'Amazon.com' : 'Amazon.ca'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Dismiss / Scan Next Button */}
          <TouchableOpacity style={styles.scanNextButton} onPress={onClose}>
            <Text style={styles.scanNextButtonText}>SCAN NEXT ITEM ⏩</Text>
          </TouchableOpacity>
        </View>

        {/* Mounted only while open, so each open starts from fresh state. */}
        {showEbayComps ? (
          <EbayCompsModal
            onClose={() => setShowEbayComps(false)}
            query={ebayQuery}
            marketplace={item.marketplace}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  cardContainer: {
    backgroundColor: '#1A202C',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%'
  },
  statusBanner: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBannerText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1.5
  },
  copyToast: {
    backgroundColor: '#38A169',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  copyToastText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  contentScroll: {
    flexGrow: 0
  },
  contentPadding: {
    padding: 20
  },
  titleText: {
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 12
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16
  },
  metaBadge: {
    backgroundColor: '#2D3748',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  metaLabel: {
    color: '#A0AEC0',
    fontSize: 12,
    marginRight: 4
  },
  metaValue: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600'
  },
  reasonBox: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 16
  },
  reasonBoxDanger: {
    backgroundColor: 'rgba(229, 62, 62, 0.15)',
    borderColor: '#E53E3E',
    borderWidth: 1.5
  },
  reasonBoxSafe: {
    backgroundColor: 'rgba(56, 161, 105, 0.15)',
    borderColor: '#38A169',
    borderWidth: 1.5
  },
  reasonBoxWarning: {
    backgroundColor: 'rgba(221, 107, 32, 0.15)',
    borderColor: '#DD6B20',
    borderWidth: 1.5
  },
  reasonBoxApproval: {
    backgroundColor: 'rgba(221, 107, 32, 0.22)',
    borderColor: '#DD6B20',
    borderWidth: 2
  },
  reasonBoxUnknown: {
    backgroundColor: 'rgba(236, 201, 75, 0.15)',
    borderColor: '#ECC94B',
    borderWidth: 1.5
  },
  reasonTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 4
  },
  reasonTitleApproval: {
    color: '#F6AD55'
  },
  reasonTitleUnknown: {
    color: '#ECC94B'
  },
  approvalGuidance: {
    color: '#FBD38D',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 18
  },
  reasonText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20
  },
  invoicesWarning: {
    color: '#FC8181',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18
  },
  priceContainer: {
    backgroundColor: '#2D3748',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16
  },
  sectionHeader: {
    color: '#CBD5E0',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase'
  },
  priceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  priceBox: {
    flex: 1,
    backgroundColor: '#1A202C',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  priceBoxLabel: {
    color: '#A0AEC0',
    fontSize: 12,
    marginBottom: 4
  },
  priceBoxValue: {
    color: '#48BB78',
    fontSize: 20,
    fontWeight: '900'
  },
  priceSourceBadge: {
    color: '#A0AEC0',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6
  },
  offerCard: {
    backgroundColor: '#EBF8FF',
    borderColor: '#3182CE',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12
  },
  offerCardTitle: {
    color: '#2B6CB0',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10
  },
  offerRow: {
    flexDirection: 'row',
    gap: 10
  },
  offerCell: {
    flex: 1,
    backgroundColor: 'rgba(49, 130, 206, 0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  offerCellLabel: {
    color: '#4A5568',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 3
  },
  offerCellPrice: {
    color: '#2C5282',
    fontSize: 16,
    fontWeight: '800'
  },
  offerRank: {
    color: '#4A5568',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 15
  },
  livePriceQuickBtn: {
    backgroundColor: 'rgba(72, 187, 120, 0.15)',
    borderColor: '#48BB78',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center'
  },
  livePriceQuickBtnText: {
    color: '#48BB78',
    fontWeight: '800',
    fontSize: 14
  },
  livePriceSubtext: {
    color: '#A0AEC0',
    fontSize: 11,
    marginTop: 3
  },
  idRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16
  },
  idChip: {
    backgroundColor: '#2D3748',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  idText: {
    color: '#A0AEC0',
    fontSize: 12
  },
  idHighlight: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  sellerAppHelpText: {
    color: '#CBD5E0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 4
  },
  actionButtonsContainer: {
    gap: 10,
    marginBottom: 10
  },
  sellerCentralButton: {
    backgroundColor: '#FF9900', // Amazon Orange
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  sellerCentralButtonApproval: {
    backgroundColor: '#DD6B20',
    borderWidth: 2,
    borderColor: '#FBD38D'
  },
  sellerCentralButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '800'
  },
  amazonButton: {
    backgroundColor: '#4A5568',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  amazonButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  ebayContainer: {
    backgroundColor: '#171923',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2D3748'
  },
  ebayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  ebayHeaderTitle: {
    color: '#ECC94B',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  ebayModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  ebayModeLabel: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 8
  },
  ebayModeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#2D3748',
    marginRight: 6
  },
  ebayModeBtnActive: {
    backgroundColor: '#3182CE'
  },
  ebayModeText: {
    color: '#A0AEC0',
    fontSize: 11,
    fontWeight: '800'
  },
  ebayModeTextActive: {
    color: '#FFFFFF'
  },
  ebayQueryText: {
    color: '#68D391',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10
  },
  ebayQuickLinkBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6
  },
  ebayQuickLinkText: {
    color: '#63B3ED',
    fontSize: 12,
    fontWeight: '700'
  },
  ebayLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8
  },
  ebayLoadingText: {
    color: '#A0AEC0',
    fontSize: 13,
    fontWeight: '600'
  },
  ebayPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4
  },
  ebayPriceColumn: {
    flex: 1,
    paddingRight: 10
  },
  sellThroughRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5
  },
  sellThroughDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  sellThroughText: {
    color: '#A0AEC0',
    fontSize: 11,
    fontWeight: '700'
  },
  sellThroughUnavailable: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5
  },
  ebayPriceValue: {
    color: '#48BB78',
    fontSize: 22,
    fontWeight: '900'
  },
  ebayPriceSub: {
    color: '#A0AEC0',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2
  },
  ebayActionBtn: {
    backgroundColor: '#2D3748',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A5568'
  },
  ebayActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700'
  },
  ebayEmptyRow: {
    paddingTop: 4
  },
  ebayEmptyText: {
    color: '#A0AEC0',
    fontSize: 12,
    marginBottom: 8
  },
  ebayCheckSoldBtn: {
    backgroundColor: '#2C5282',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  ebayCheckSoldBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  ebayCheckSoldSubtext: {
    color: '#BEE3F8',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500'
  },
  scanNextButton: {
    backgroundColor: '#3182CE',
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: Platform.OS === 'android' ? 60 : 24, // High clearance above Android Home button & nav bar
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  scanNextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1
  }
});
