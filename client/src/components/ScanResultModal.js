import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export default function ScanResultModal({ visible, item, onClose }) {
  if (!item) return null;

  const isRestricted = item.status === 'HARD_GATED' || item.status === 'RESTRICTED';
  const isSafe = item.status === 'UNGATED';
  const isUnknown = item.status === 'UNKNOWN';

  const handleOpenSellerCentral = async () => {
    if (item.sellerCentralUrl) {
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.cardContainer}>
          {/* Header Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: item.badgeColor || '#4A5568' }]}>
            <Text style={[styles.statusBannerText, { color: item.textColor || (isUnknown ? '#1A202C' : '#FFFFFF') }]}>
              {item.badge || 'SCANNED'}
            </Text>
          </View>

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
              isRestricted ? styles.reasonBoxDanger : (isUnknown ? styles.reasonBoxUnknown : (isSafe ? styles.reasonBoxSafe : styles.reasonBoxWarning))
            ]}>
              <Text style={[styles.reasonTitle, isUnknown && styles.reasonTitleUnknown]}>
                {isRestricted ? '⚠️ RESTRICTION ALERT' : (isUnknown ? '❓ UNKNOWN ITEM - CHECK RESTRICTIONS' : (isSafe ? '✅ ELIGIBILITY STATUS' : 'ℹ️ NOTE'))}
              </Text>
              <Text style={styles.reasonText}>{item.reason}</Text>
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

            {/* Barcode & ASIN */}
            <View style={styles.idRow}>
              <Text style={styles.idText}>Barcode: {item.barcode}</Text>
              {item.asin ? <Text style={styles.idText}>ASIN: {item.asin}</Text> : null}
            </View>

            {/* Quick Actions */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={styles.sellerCentralButton}
                onPress={handleOpenSellerCentral}
              >
                <Text style={styles.sellerCentralButtonText}>
                  ⚡ 1-Tap Seller Central ({item.marketplace === 'US' ? '.com' : '.ca'})
                </Text>
              </TouchableOpacity>

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
  reasonTitleUnknown: {
    color: '#ECC94B'
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
    marginBottom: 16
  },
  idText: {
    color: '#718096',
    fontSize: 12
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
  scanNextButton: {
    backgroundColor: '#3182CE',
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: Platform.OS === 'android' ? 38 : 20, // Clean clearance above Android Home button & nav bar
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
