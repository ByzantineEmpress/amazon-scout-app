import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { getEbaySoldUrl, getEbayActiveUrl, EBAY_MOBILE_USER_AGENT } from '../services/ebayService';
import { pickEbayCategory } from '../services/ebayCategory';
import { sellThroughRate, sellThroughBand } from '../services/ebayHtml';

/**
 * Sell-through is an estimate built from two result counts, so it is coloured to be read at a
 * glance but never labelled with a word that would claim more than that. The thresholds are
 * reseller convention (60 / 30), not anything eBay publishes.
 */
const SELL_THROUGH_COLOURS = { high: '#48BB78', medium: '#ECC94B', low: '#FC8181' };

/**
 * Runs inside a loaded results page and reports back what it finds.
 *
 * The counts have to be read here rather than fetched by the app: eBay answers this project's HTTP
 * requests with 403, so the only requests that succeed are the ones a real browser engine makes -
 * which is exactly what this WebView is.
 *
 * The count is looked for in eBay's own count heading first, and only then at the top of the page
 * text, so a listing titled "3 Results of a Study" cannot be mistaken for the number of results.
 * Every message carries the page URL so the caller can ignore anything that is not a search page
 * (a listing page the user navigated into has no result count at all).
 */
function pageReader(kind, reportCategories) {
  return `
(function () {
  function post(payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
  }
  var here = String(window.location.href || '');
  var out = { type: '${kind}', count: null, url: here };
  try {
    var heading = document.querySelector('[class*="srp-controls__count"], [class*="s-item__count"]');
    var body = (document.body && (document.body.innerText || document.body.textContent)) || '';
    var sources = [heading ? heading.textContent : '', String(body).slice(0, 3000)];
    for (var i = 0; i < sources.length && out.count === null; i++) {
      var m = String(sources[i]).match(/([0-9][0-9,]{0,14})\\+?\\s*results?\\b/i);
      if (m) { out.count = parseInt(m[1].replace(/,/g, ''), 10); }
    }
  } catch (e) {}
  post(out);
  if (${reportCategories ? 'true' : 'false'}) {
    try {
      var links = document.querySelectorAll('a[href*="_sacat="]');
      var items = [];
      for (var j = 0; j < links.length && items.length < 25; j++) {
        items.push({ href: links[j].getAttribute('href') || '', text: links[j].textContent || '' });
      }
      post({ type: 'categories', items: items, url: here });
    } catch (e) {}
  }
})();
true;
`;
}

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
  const [category, setCategory] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [soldCount, setSoldCount] = useState(null);
  const [activeCount, setActiveCount] = useState(null);
  const [visibleReady, setVisibleReady] = useState(false);
  const scopeApplied = useRef(false);
  const webRef = useRef(null);

  const soldUrl = getEbaySoldUrl(query, marketplace, category?.id);
  const activeUrl = getEbayActiveUrl(query, marketplace, category?.id);
  const marketplaceLabel = marketplace === 'US' ? 'eBay.com' : 'eBay.ca';

  const rate = sellThroughRate(soldCount, activeCount);
  const band = sellThroughBand(rate);
  const countsKnown = Number.isFinite(soldCount) && Number.isFinite(activeCount);
  const categoryOffer = suggested && suggested.id !== category?.id ? suggested : null;

  /**
   * Both WebViews report through here. Counts are only accepted from a search page: once the user
   * taps into a listing there is no result count to read, and that must not wipe the figures
   * already shown.
   */
  const handleMessage = (event) => {
    let message = null;
    try {
      message = JSON.parse(event?.nativeEvent?.data);
    } catch (_e) {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (!String(message.url ?? '').includes('_nkw=')) return;

    // A page that managed to run the reader has loaded, whichever callback fired last. This is the
    // dependable end-of-load signal: onLoadEnd is skipped when a load is interrupted - eBay
    // redirecting, for instance - which used to leave the page sitting under a loading scrim.
    setLoading(false);

    if (message.type === 'soldCount') {
      setSoldCount(Number.isFinite(message.count) ? message.count : null);
    } else if (message.type === 'activeCount') {
      setActiveCount(Number.isFinite(message.count) ? message.count : null);
    } else if (message.type === 'categories') {
      const best = pickEbayCategory(message.items);
      if (best) {
        setSuggested(best);
        // Apply the first category eBay offers, without being asked. Reading it from the page is
        // only worth doing if the search actually lands in that department; leaving it as an
        // offer meant an unscoped search full of unrelated items. It is named in the header, one
        // tap clears it, and clearing it is remembered for the rest of this visit.
        if (!scopeApplied.current && !category) {
          scopeApplied.current = true;
          setCategory(best);
        }
      }
    }
  };

  const openInBrowserTab = async () => {
    try {
      await WebBrowser.openBrowserAsync(soldUrl, {
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
            {category ? ` · ${category.name}` : ''}
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

      {/* Sell-through, and the offer to narrow the search to one category. The category id comes
          from eBay's own refinement links rather than a table in the app: a wrong id would return
          nothing at all, and it would be wrong silently. */}
      <View style={styles.statusRow}>
        {band ? (
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: SELL_THROUGH_COLOURS[band] }]} />
            <Text style={styles.statusText}>
              Sell-through {rate}%
              {countsKnown ? ` · ${soldCount} sold / ${activeCount} listed` : ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.statusMuted}>
            {loading ? 'Sell-through: reading eBay…' : 'Sell-through unavailable for this search'}
          </Text>        )}

        {category ? (
          <TouchableOpacity
            style={styles.scopeChip}
            onPress={() => setCategory(null)}
            accessibilityLabel={`Searching ${category.name}; tap to search all categories`}
          >
            <Text style={styles.scopeChipText}>{category.name} ✕</Text>
          </TouchableOpacity>
        ) : categoryOffer ? (
          <TouchableOpacity
            style={styles.scopeOffer}
            onPress={() => setCategory(categoryOffer)}
            accessibilityLabel={`Narrow the search to ${categoryOffer.name}`}
          >
            <Text style={styles.scopeOfferText}>Narrow to {categoryOffer.name}</Text>
          </TouchableOpacity>
        ) : null}
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
          source={{ uri: soldUrl }}
          style={styles.webview}
          userAgent={EBAY_MOBILE_USER_AGENT}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          injectedJavaScript={pageReader('soldCount', true)}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            setVisibleReady(true);
          }}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onNavigationStateChange={(state) => setCanGoBack(!!state.canGoBack)}
        />
      )}

      {/* The other half of sell-through: the same search without the sold filter. It never needs to
          be seen, so it is a 1x1 transparent view. It waits until the visible page has loaded, so
          two requests never reach eBay at once and the page being read is not the one at risk of a
          bot check. */}
      {failed || !visibleReady ? null : (
        <WebView
          source={{ uri: activeUrl }}
          style={styles.hiddenWeb}
          userAgent={EBAY_MOBILE_USER_AGENT}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          injectedJavaScript={pageReader('activeCount', false)}
          onMessage={handleMessage}
        />
      )}
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#171923',
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748'
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  statusText: {
    color: '#CBD5E0',
    fontSize: 11,
    fontWeight: '700'
  },
  statusMuted: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '600'
  },
  scopeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#3182CE',
    marginLeft: 8
  },
  scopeChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800'
  },
  scopeOffer: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#2D3748',
    borderWidth: 1,
    borderColor: '#4A5568',
    marginLeft: 8
  },
  scopeOfferText: {
    color: '#90CDF4',
    fontSize: 11,
    fontWeight: '800'
  },
  hiddenWeb: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    bottom: 0,
    left: 0
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
