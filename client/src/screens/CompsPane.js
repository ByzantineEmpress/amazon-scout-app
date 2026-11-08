import React, { useState, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getEbaySoldUrl,
  getEbayActiveUrl,
  EBAY_MOBILE_USER_AGENT
} from '../services/ebayService';
import { pickEbayCategory } from '../services/ebayCategory';
import { sellThroughRate, sellThroughBand } from '../services/ebayHtml';
import { palette, space, type, layout } from '../design/theme';
import { Button, Chip, Badge, EmptyState } from '../design/primitives';

const SELL_THROUGH_TONES = { high: 'good', medium: 'warn', low: 'bad' };

/**
 * Runs inside a loaded results page and reports what it finds.
 *
 * The counts have to be read here rather than fetched by the app: eBay answers this project's HTTP
 * requests with 403, so the only requests that succeed are the ones a real browser engine makes -
 * which is exactly what these WebViews are.
 *
 * The count is looked for in eBay's own count heading first, and only then at the top of the page
 * text, so a listing titled "3 Results of a Study" cannot be mistaken for the number of results.
 * Every message carries the page URL so the caller can ignore anything that is not a search page.
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
 * eBay's own sold and completed listings, in the app.
 *
 * A WebView rather than a scrape, for a reason that is now measured rather than assumed: eBay
 * refuses the app's own HTTP requests with 403, but serves a real browser engine. So this is where
 * eBay's data actually is - prices, sell-through and the category it puts the search in.
 *
 * Two WebViews: the visible one shows the sold listings, and a hidden 1x1 one loads the same search
 * without the sold filter. Their result counts together are the sell-through figure. The hidden one
 * waits for the visible one to finish, so two requests never reach eBay at once.
 *
 * The category comes from eBay's own refinement links rather than a table in the app: a wrong
 * _sacat returns no results at all, silently, and eBay refuses the requests that would let an id be
 * checked from a development machine.
 */
export default function CompsPane({ onClose, query, marketplace = 'CA' }) {
  const insets = useSafeAreaInsets();
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
   * Counts are only accepted from a search page: once the user taps into a listing there is no
   * result count to read, and that must not wipe the figures already shown.
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

    // A page that ran the reader has loaded, whichever callback fired last. onLoadEnd is skipped
    // when a load is interrupted, which is how a page once ended up under a stuck scrim.
    setLoading(false);

    if (message.type === 'soldCount') {
      setSoldCount(Number.isFinite(message.count) ? message.count : null);
    } else if (message.type === 'activeCount') {
      setActiveCount(Number.isFinite(message.count) ? message.count : null);
    } else if (message.type === 'categories') {
      const best = pickEbayCategory(message.items);
      if (best) {
        setSuggested(best);
        // Apply the first category eBay offers, without being asked: the point of reading it from
        // the page is that the search lands in the right department. One tap clears it.
        if (!scopeApplied.current && !category) {
          scopeApplied.current = true;
          setCategory(best);
        }
      }
    }
  };

  const openInBrowser = async () => {
    try {
      await WebBrowser.openBrowserAsync(soldUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
      });
    } catch (_e) {
      // Nothing more to do; the eBay app is another route out.
    }
  };

  const handleShouldStartLoad = (request) => {
    if (request.url.startsWith('http')) return true;
    Linking.openURL(request.url).catch(() => {});
    return false;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {canGoBack ? (
            <Button
              label="‹"
              variant="ghost"
              size="sm"
              onPress={() => webRef.current?.goBack()}
              accessibilityLabel="Back"
            />
          ) : null}

          <View style={styles.headerText}>
            <Text style={[styles.text, type.heading]} numberOfLines={1}>
              Sold comps
            </Text>
            <Text style={[styles.text, type.small, styles.muted]} numberOfLines={1}>
              {marketplaceLabel}
              {category ? ` · ${category.name}` : ''}
              {query ? ` · ${query}` : ''}
            </Text>
          </View>

          <Button label="Browser" variant="ghost" size="sm" onPress={openInBrowser} />
          <Button label="Done" variant="secondary" size="sm" onPress={onClose} />
        </View>

        <View style={styles.statusRow}>
          {band ? (
            <Badge
              label={`Sell-through ${rate}%${countsKnown ? ` · ${soldCount} sold / ${activeCount} listed` : ''}`}
              tone={SELL_THROUGH_TONES[band]}
            />
          ) : (
            <Text style={[styles.text, type.small, styles.muted]}>
              {loading ? 'Reading eBay…' : 'Sell-through unavailable for this search'}
            </Text>
          )}

          {category ? (
            <Chip label={`${category.name} ✕`} onPress={() => setCategory(null)} />
          ) : categoryOffer ? (
            <Chip label={`Narrow to ${categoryOffer.name}`} onPress={() => setCategory(categoryOffer)} />
          ) : null}
        </View>

        {failed ? (
          <EmptyState
            icon="🏷️"
            title="eBay would not load here"
            body="It usually means eBay blocked the embedded view or asked for a consent step first."
            action={<Button label="Open in browser" onPress={openInBrowser} />}
          />
        ) : (
          <>
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

            {/* The other half of sell-through: the same search without the sold filter. Invisible -
                a 1x1 transparent view - and mounted only after the visible page has loaded. */}
            {visibleReady ? (
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
            ) : null}
          </>
        )}
        </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: palette.bg
  },
  text: { color: palette.text },
  muted: { color: palette.textMuted },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
    backgroundColor: palette.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: palette.border
  },
  headerText: { flex: 1, gap: space.xxs },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
    backgroundColor: palette.bg,
    borderBottomWidth: layout.hairline,
    borderBottomColor: palette.border
  },

  webview: { flex: 1, backgroundColor: palette.bg },
  hiddenWeb: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    bottom: 0,
    left: 0
  }
});
