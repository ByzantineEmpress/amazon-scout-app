import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { CameraView, scanFromURLAsync } from 'expo-camera';
import { File } from 'expo-file-system';

import { guessItemName, findModelNumber } from '../services/titleScan';
import { processBarcodeScanOnDevice } from '../services/barcodeService';
import { validateScannedCode, SCANNER_BARCODE_TYPES } from '../services/barcodeValidation';
import { fetchEbayLowestForQuery } from '../services/ebayService';
import { sellThroughBand } from '../services/ebayHtml';
import { getSettings } from '../services/storage';
import { palette, space, type, layout } from '../design/theme';
import { Card, Button, Field, Chip, Badge, Loading } from '../design/primitives';
import EbayCompsModal from '../components/EbayCompsModal';

/**
 * The OCR module is required lazily. It is native, its entry point throws where the native code is
 * absent, and a top-level import would take the whole app down at startup in Expo Go - for every
 * screen, not just this one.
 */
let recognizeTextModule = null;

function getRecognizeText() {
  if (!recognizeTextModule) {
    recognizeTextModule = require('@infinitered/react-native-mlkit-text-recognition');
  }
  return recognizeTextModule.recognizeText;
}

/**
 * Types worth decoding from a still. A deliberate single shot can afford a wider net than the live
 * scanner, where a wrong read arrives uninvited - every candidate still goes through the same
 * check-digit validation before it is trusted.
 */
const STILL_BARCODE_TYPES = [...SCANNER_BARCODE_TYPES, 'upc_e'];

const SELL_THROUGH_TONES = { high: 'good', medium: 'warn', low: 'bad' };

/**
 * Photograph any item and find its eBay sold comps.
 *
 * The general-purpose sibling of the scanner: toys, tools, games, kitchenware, vintage anything.
 * There is no identifier to lean on, so the item is named two ways at once and the better answer
 * wins - a barcode decoded from the still (exact, but rare on the goods worth photographing) and
 * the text on the packaging (always there, never exact).
 *
 * Either way the result lands in an editable field, because a wrong search costs more time than
 * correcting a right one saves. Nothing is written to History: this is a lookup, not a scan.
 *
 * Two rules from the guide are load-bearing here: the camera mounts ~350 ms late, so the previous
 * screen's camera has released the device (Android returns a black preview otherwise), and
 * capturing a frame every second must be silent.
 */
export default function CompsScreen() {
  const [phase, setPhase] = useState('ready'); // ready | reading | found
  const [marketplace, setMarketplace] = useState('CA');
  const [query, setQuery] = useState('');
  const [decodedCode, setDecodedCode] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('');
  const [lowest, setLowest] = useState(null);
  const [comps, setComps] = useState(null);
  const [looking, setLooking] = useState(false);
  const [compsVisible, setCompsVisible] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraArmed, setCameraArmed] = useState(false);

  const cameraRef = useRef(null);
  const inputRef = useRef(null);

  // The camera mounts a beat late: the previous tab's camera unmounts in the same React commit as
  // this screen mounts, and Android hands back a black preview if a second camera takes the device
  // while the first is still shutting down.
  useEffect(() => {
    const id = setTimeout(() => setCameraArmed(true), 350);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let alive = true;
    getSettings().then((stored) => {
      if (alive) setMarketplace(stored.marketplace === 'US' ? 'US' : 'CA');
    });
    return () => {
      alive = false;
    };
  }, []);

  // When nothing could be read, the field is the way forward, so put the cursor in it - but only
  // when it is empty, or the keyboard would cover a perfectly good guess.
  useEffect(() => {
    if (phase !== 'found' || query.trim()) return undefined;
    const id = setTimeout(() => inputRef.current?.focus(), 320);
    return () => clearTimeout(id);
  }, [phase, query]);

  const runLookup = async (phrase) => {
    const search = String(phrase ?? '').trim();
    if (!search) return;
    setLooking(true);
    try {
      const result = await fetchEbayLowestForQuery(search, marketplace);
      setLowest(result?.price ?? null);
      // Keep the whole response, so a field the service adds later flows through without a second
      // place having to remember it.
      setComps(result || null);
    } catch (_e) {
      setLowest(null);
      setComps(null);
    } finally {
      setLooking(false);
    }
  };

  /** Decode a product code from the still, accepting only codes that pass their check digit. */
  const decodeBarcode = async (uri) => {
    try {
      const found = await scanFromURLAsync(uri, STILL_BARCODE_TYPES);
      for (const result of found || []) {
        const check = validateScannedCode(result?.data);
        if (check.ok) return check.code;
      }
    } catch (_e) {
      // A still with no readable barcode is the ordinary case for boxed goods.
    }
    return '';
  };

  const nameTheItem = async (code, blocks) => {
    const fromPackaging = guessItemName(blocks);
    const readModel = findModelNumber(blocks);

    let fromBarcode = '';
    if (code) {
      setStatus('Looking that barcode up…');
      try {
        const found = await processBarcodeScanOnDevice(code, marketplace);
        const title = found?.title;
        // The lookup has placeholder titles for "nothing found" and "no signal"; searching eBay
        // for "Item Queued Offline (No Cell Signal)" would be worse than the packaging text.
        const usable = title && title !== 'Unknown Item' && found?.status !== 'OFFLINE_QUEUED';
        if (usable) fromBarcode = title;
      } catch (_e) {
        // Offline, or nothing on file: the packaging text still gets us there.
      }
    }

    const best = fromBarcode || fromPackaging;
    setDecodedCode(code || '');
    setModel(readModel);
    setQuery(best);
    setPhase('found');
    setStatus(
      best
        ? fromBarcode
          ? 'Named from the barcode — check it, then search'
          : 'Read from the item — check it, then search'
        : 'Nothing readable — type what it is, or try the label underneath'
    );

    if (best) runLookup(best);
  };

  const capture = async () => {
    if (phase === 'reading' || !cameraRef.current) return;
    setPhase('reading');
    setStatus('');
    setLowest(null);
    setComps(null);

    try {
      // Silent: a shutter click every time you photograph a shelf is unbearable.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, shutterSound: false });
      try {
        const code = await decodeBarcode(photo.uri);
        const recognized = await getRecognizeText()(photo.uri);
        await nameTheItem(code, recognized?.blocks);
      } finally {
        try {
          new File(photo.uri).delete();
        } catch (_e) {
          // Cache cleanup is best-effort; the OS reclaims it.
        }
      }
    } catch (_e) {
      setPhase('ready');
      setStatus('Could not read that — try again with more light');
    }
  };

  const search = () => {
    const phrase = query.trim();
    if (!phrase) return;
    if (lowest === null) runLookup(phrase);
    setCompsVisible(true);
  };

  const band = sellThroughBand(comps?.sellThrough);

  return (
    <View style={styles.root}>
      {cameraArmed ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          animateShutter={false}
          onCameraReady={() => setCameraReady(true)}
          onMountError={(err) => {
            setCameraReady(false);
            setStatus(`Camera unavailable: ${err?.message || 'unknown error'}`);
          }}
        />
      ) : null}

      {!cameraReady ? (
        <View style={styles.starting} pointerEvents="none">
          <ActivityIndicator color={palette.accent} />
          <Text style={[styles.text, type.small, styles.muted, styles.startingText]}>
            Starting camera…
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom}
      >
        <Card style={styles.panel}>
          {phase === 'ready' ? (
            <>
              <Text style={[styles.text, type.heading]}>Find sold prices for anything</Text>
              <Text style={[styles.text, type.small, styles.muted, styles.panelBody]}>
                Photograph the item. A barcode or a model number gives the best search, but anything
                printed on it helps.
              </Text>
              <Button label="Take the picture" icon="📷" size="lg" onPress={capture} />
            </>
          ) : null}

          {phase === 'reading' ? <Loading label="Reading the item…" /> : null}

          {phase === 'found' ? (
            <>
              {status ? (
                <Text style={[styles.text, type.small, styles.muted, styles.status]}>{status}</Text>
              ) : null}

              <Field
                label="Search eBay sold for"
                value={query}
                onChangeText={setQuery}
                placeholder="What is it?"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={search}
                ref={inputRef}
              />

              {looking ? (
                <Loading label="Checking sold prices…" />
              ) : lowest !== null ? (
                <View style={styles.resultRow}>
                  <Text style={[styles.text, type.small, styles.muted]}>Lowest sold</Text>
                  <Text style={[styles.text, type.title, styles.good]}>
                    {comps?.currencyPrefix || (marketplace === 'US' ? '$' : 'CDN$ ')}
                    {Number(lowest).toFixed(2)}
                  </Text>
                  {band ? <Badge label={`Sell-through ${comps.sellThrough}%`} tone={SELL_THROUGH_TONES[band]} /> : null}
                </View>
              ) : null}

              <Button label="Search sold comps" icon="🏷️" onPress={search} style={styles.searchButton} />

              <View style={styles.chips}>
                {decodedCode ? (
                  <Chip
                    label={`Barcode ${decodedCode}`}
                    onPress={() => {
                      setQuery(decodedCode);
                      runLookup(decodedCode);
                    }}
                  />
                ) : null}
                {model && model !== query.trim() ? (
                  <Chip
                    label={`Model ${model}`}
                    onPress={() => {
                      setQuery(model);
                      runLookup(model);
                    }}
                  />
                ) : null}
                <Chip label="Take another" onPress={capture} />
              </View>
            </>
          ) : null}
        </Card>
      </KeyboardAvoidingView>

      {compsVisible ? (
        <EbayCompsModal
          onClose={() => setCompsVisible(false)}
          query={query}
          marketplace={marketplace}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  good: { color: palette.good },

  starting: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  startingText: { marginTop: space.sm },

  bottom: {
    position: 'absolute',
    left: layout.gutter,
    right: layout.gutter,
    bottom: layout.gutter
  },
  panel: { backgroundColor: 'rgba(20, 30, 46, 0.96)' },
  panelBody: { marginTop: space.xs, marginBottom: space.lg },
  status: { marginBottom: space.md },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md
  },
  searchButton: { marginTop: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }
});
