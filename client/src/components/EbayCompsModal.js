import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { getEbaySoldUrl, EBAY_MOBILE_USER_AGENT } from '../services/ebayService';

/**
 * Full-screen in-app pane showing eBay's sold & completed comps for the scanned item.
 *
 * Two deliberate choices:
 *
 * 1. It renders as an absolutely-positioned overlay rather than a nested <Modal>.
 *    ScanResultModal is itself a Modal, and presenting a second Modal from inside the first
 *    fails on iOS ("attempt to present ... which is already presenting"). An overlay that
 *    fills the parent looks identical and has no such limitation.
 *
 * 2. The page shown is eBay's own sold/completed search rather than scraped data. That is
 *    what makes this dependable: the app renders the same page the user would see, so there
 *    is no HTML parsing to break, and no request the app has to disguise.
 *
 * 3. The parent mounts it only while it is open, so every open begins from fresh state. That
 *    is deliberate: resetting state inside an effect causes cascading renders, and the linter
 *    rejects it.
 *
 * If the embedded view cannot load (eBay sometimes blocks embedded browsers or interposes a
 * consent step), the header's "Browser" button and the failure card both fall back to an
 * in-app browser tab, so the user still never leaves the app.
 */
export default function EbayCompsModal({ onClose, query, marketplace = 'CA' }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const webRef = useRef(null);

  const url = getEbaySoldUrl(query, marketplace);
  const marketplaceLabel = marketplace === 'US' ? 'eBay.com' : 'eBay.ca';

  const openInBrowserTab = async () => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
      });
    } catch (e) {
      // Nothing more we can do; the user can close and try the eBay app.
    }
  };

  // Keep external/deep links from silently dead-ending inside the WebView.
  const handleShouldStartLoad = (request) => {
    if (request.url.startsWith('http')) return true;
    Linking.openURL(request.url).catch(() => {});
    return false;
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        {canGoBack ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => webRef.current?.goBack()}
            accessibilityLabel="Back"
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>eBay Sold Comps</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {marketplaceLabel}
            {query ? ` · ${query}` : ''}
          </Text>
        </View>

        <TouchableOpacity style={styles.headerBtn} onPress={openInBrowserTab}>
          <Text style={styles.headerBtnText}>Browser</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {failed ? (
        <View style={styles.failedWrap}>
          <Text style={styles.failedTitle}>eBay would not load in the app</Text>
          <Text style={styles.failedText}>
            This usually means eBay blocked the embedded view or asked for a consent step first.
          </Text>
          <TouchableOpacity style={styles.failedBtn} onPress={openInBrowserTab}>
            <Text style={styles.failedBtnText}>Open in in-app browser</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: url }}
          style={styles.webview}
          userAgent={EBAY_MOBILE_USER_AGENT}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onNavigationStateChange={(state) => setCanGoBack(!!state.canGoBack)}
        />
      )}

      {loading && !failed ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ECC94B" />
          <Text style={styles.loadingText}>Loading sold comps...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1A202C',
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748'
  },
  backBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4
  },
  backBtnText: {
    color: '#ECC94B',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 32
  },
  headerTextWrap: {
    flex: 1
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800'
  },
  headerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1
  },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
    marginRight: 6
  },
  headerBtnText: {
    color: '#CBD5E0',
    fontSize: 12,
    fontWeight: '700'
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#38A169'
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800'
  },
  webview: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)'
  },
  loadingText: {
    color: '#ECC94B',
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700'
  },
  failedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28
  },
  failedTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center'
  },
  failedText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19
  },
  failedBtn: {
    marginTop: 18,
    backgroundColor: '#3182CE',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 8
  },
  failedBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});
