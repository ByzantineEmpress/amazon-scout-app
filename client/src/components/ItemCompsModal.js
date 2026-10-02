import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions
} from 'react-native';
import { CameraView, scanFromURLAsync } from 'expo-camera';
import { File } from 'expo-file-system';
import { guessItemName } from '../services/titleScan';
import { processBarcodeScanOnDevice } from '../services/barcodeService';
import { validateScannedCode, SCANNER_BARCODE_TYPES } from '../services/barcodeValidation';
import { fetchEbayLowestForQuery } from '../services/ebayService';
import EbayCompsModal from './EbayCompsModal';

/**
 * Photograph any item and look up its eBay sold comps.
 *
 * This is the general-purpose sibling of the book screen, for everything that is not a book and
 * has no reliable catalogue entry to look up: toys, tools, games, kitchenware, vintage anything.
 * There is no identifier to lean on, so the item is identified two ways at once and the better
 * answer wins:
 *
 *  - a barcode decoded from the still, which is exact but rare on the kind of goods worth
 *    photographing, and
 *  - the text on the packaging, which is always there and never exact.
 *
 * Either way the result lands in an editable field, because a wrong search costs more time than
 * correcting a right one saves. Nothing is written to History: this is a lookup, not a scan.
 *
 * The OCR module is required lazily. It is native, its entry point throws where the native code
 * is absent, and a top-level import would take Expo Go down with it for every other screen.
 */
let recognizeTextModule = null;

function getRecognizeText() {
  if (!recognizeTextModule) {
    recognizeTextModule = require('@infinitered/react-native-mlkit-text-recognition');
  }
  return recognizeTextModule.recognizeText;
}

/**
 * Types worth decoding from a still. A deliberate single shot can afford a wider net than the
 * live scanner, where a wrong read arrives uninvited - every candidate is still put through the
 * same check-digit validation before it is trusted.
 */
const STILL_BARCODE_TYPES = [...SCANNER_BARCODE_TYPES, 'upc_e'];

/** Pages a parcel shelf's worth of small print into a confident paragraph is not the goal. */
const PANEL_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.56);

export default function ItemCompsModal({ onClose, marketplace = 'CA' }) {
  const [phase, setPhase] = useState('ready'); // ready | reading | found
  const [query, setQuery] = useState('');
  const [decodedCode, setDecodedCode] = useState('');
  const [status, setStatus] = useState('Frame the item, then take the picture');
  const [lowest, setLowest] = useState(null);
  const [looking, setLooking] = useState(false);
  const [showComps, setShowComps] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraArmed, setCameraArmed] = useState(false);

  const cameraRef = useRef(null);

  // Mount the camera a beat late: the main viewfinder unmounts in the same React commit as this
  // screen mounts, and Android returns a black preview if a second camera grabs the device while
  // the first is still shutting down.
  useEffect(() => {
    const id = setTimeout(() => setCameraArmed(true), 350);
    return () => clearTimeout(id);
  }, []);

  const runLookup = async (phrase) => {
    const search = String(phrase ?? '').trim();
    if (!search) return;
    setLooking(true);
    try {
      const res = await fetchEbayLowestForQuery(search, marketplace);
      setLowest(res?.price ?? null);
    } catch (_e) {
      setLowest(null);
    } finally {
      setLooking(false);
    }
  };

  /**
   * Decode a product code from the still, accepting only codes that pass their check digit.
   *
   * scanFromURLAsync is a module-level export, not a method on the view ref. Note that iOS
   * supports only QR codes here, so this is effectively an Android advantage: on iOS the barcode
   * simply is not found and the packaging text carries the search.
   */
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

  const capture = async () => {
    if (phase === 'reading' || !cameraRef.current) return;
    setPhase('reading');
    setStatus('Reading the item...');
    setLowest(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, shutterSound: false });
      try {
        const code = await decodeBarcode(photo.uri);
        const recognized = await getRecognizeText()(photo.uri);
        await nameTheItem(code, recognized?.blocks);
      } finally {
        try {
          new File(photo.uri).delete();
        } catch (_e) {
          // Cache cleanup is best-effort; the OS reclaims it regardless.
        }
      }
    } catch (_e) {
      setPhase('ready');
      setStatus('Could not read that — try again with more light');
    }
  };

  const nameTheItem = async (code, blocks) => {
    const fromPackaging = guessItemName(blocks);

    // A barcode names the item exactly, so it is worth asking the catalogue before settling for
    // what was read off the box.
    let fromBarcode = '';
    if (code) {
      setStatus('Looking that barcode up...');
      try {
        const item = await processBarcodeScanOnDevice(code, marketplace);
        const title = item?.title;
        // The lookup has its own placeholder titles for "nothing found" and "no signal".
        // Searching eBay for "Item Queued Offline (No Cell Signal)" would be worse than using
        // what was read off the packaging.
        const usable = title && title !== 'Unknown Item' && item?.status !== 'OFFLINE_QUEUED';
        if (usable) fromBarcode = title;
      } catch (_e) {
        // Offline, or nothing on file for it; the packaging text still gets us there.
      }
    }

    const best = fromBarcode || fromPackaging;
    setDecodedCode(code || '');
    setQuery(best);
    setPhase('found');
    setStatus(
      best
        ? fromBarcode
          ? 'Named from the barcode — check it, then search'
          : 'Read from the packaging — check it, then search'
        : 'Nothing readable on that — type what it is'
    );

    if (best) runLookup(best);
  };

  const search = () => {
    const phrase = query.trim();
    if (!phrase) return;
    if (lowest === null) runLookup(phrase);
    setShowComps(true);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {/* Full-bleed preview, behind everything else */}
        <View style={StyleSheet.absoluteFill}>
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
            <View style={styles.cameraStarting} pointerEvents="none">
              <ActivityIndicator color="#48BB78" />
              <Text style={styles.cameraStartingText}>Starting camera...</Text>
            </View>
          ) : null}

          {phase === 'ready' ? (
            <View style={styles.hint} pointerEvents="none">
              <Text style={styles.hintText}>Fill the frame with the item</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.topBar}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Item Comps — Photo</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.spacer} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomWrap}
        >
          <View style={styles.panel}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.status}>{status}</Text>

              {phase === 'reading' ? (
                <View style={styles.readingRow}>
                  <ActivityIndicator color="#48BB78" />
                  <Text style={styles.readingText}>Reading the item...</Text>
                </View>
              ) : null}

              {phase === 'ready' ? (
                <TouchableOpacity style={styles.captureBtn} onPress={capture}>
                  <Text style={styles.captureBtnText}>📷 Take the Picture</Text>
                </TouchableOpacity>
              ) : null}

              {phase === 'found' ? (
                <View>
                  <Text style={styles.fieldLabel}>Search eBay sold listings for</Text>
                  <TextInput
                    style={styles.input}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="e.g. Lego Millennium Falcon"
                    placeholderTextColor="#718096"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={search}
                  />

                  <TouchableOpacity
                    style={[styles.searchBtn, !query.trim() && styles.btnDisabled]}
                    onPress={search}
                    disabled={!query.trim()}
                  >
                    <Text style={styles.searchBtnText}>🔎 Search eBay Sold</Text>
                  </TouchableOpacity>

                  <View style={styles.resultRow}>
                    {looking ? (
                      <View style={styles.readingRow}>
                        <ActivityIndicator size="small" color="#ECC94B" />
                        <Text style={styles.readingText}>Checking sold prices...</Text>
                      </View>
                    ) : lowest !== null ? (
                      <Text style={styles.lowestText}>
                        Lowest sold match:{' '}
                        <Text style={styles.lowestValue}>
                          {marketplace === 'US' ? '$' : 'CDN$ '}
                          {Number(lowest).toFixed(2)}
                        </Text>
                      </Text>
                    ) : (
                      <Text style={styles.noPriceText}>
                        No sold prices scraped — the search pane will still show them.
                      </Text>
                    )}
                  </View>

                  {decodedCode ? (
                    <TouchableOpacity
                      style={styles.codeChip}
                      onPress={() => {
                        setQuery(decodedCode);
                        runLookup(decodedCode);
                      }}
                    >
                      <Text style={styles.codeChipText}>Barcode read: {decodedCode} — tap to search it instead</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={styles.recaptureBtn} onPress={capture}>
                    <Text style={styles.recaptureBtnText}>📷 Take another picture</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* Mounted only while open, so each open starts from fresh state. */}
        {showComps ? (
          <EbayCompsModal
            onClose={() => setShowComps(false)}
            query={query}
            marketplace={marketplace}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 16
  },
  headerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', flex: 1 },
  doneBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, backgroundColor: '#38A169' },
  doneBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  topBar: { backgroundColor: 'rgba(15,23,42,0.9)' },

  spacer: { flex: 1 },

  cameraStarting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)'
  },
  cameraStartingText: { color: '#A0AEC0', fontSize: 12, fontWeight: '700', marginTop: 8 },
  hint: { position: 'absolute', top: '26%', left: 0, right: 0, alignItems: 'center' },
  hintText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },

  bottomWrap: { justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: PANEL_MAX_HEIGHT
  },
  status: { color: '#ECC94B', fontSize: 14, fontWeight: '800', marginBottom: 12 },

  captureBtn: {
    backgroundColor: '#3182CE',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center'
  },
  captureBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },

  readingRow: { flexDirection: 'row', alignItems: 'center' },
  readingText: { color: '#A0AEC0', fontSize: 13, fontWeight: '700', marginLeft: 8 },

  fieldLabel: { color: '#A0AEC0', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: {
    backgroundColor: '#1A202C',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#2D3748',
    marginBottom: 10
  },
  searchBtn: {
    backgroundColor: '#38A169',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  btnDisabled: { backgroundColor: '#2D3748' },
  searchBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },

  resultRow: { marginTop: 12, minHeight: 20 },
  lowestText: { color: '#A0AEC0', fontSize: 13, fontWeight: '700' },
  lowestValue: { color: '#68D391', fontSize: 15, fontWeight: '900' },
  noPriceText: { color: '#718096', fontSize: 12, lineHeight: 17 },

  codeChip: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748'
  },
  codeChipText: { color: '#90CDF4', fontSize: 11, fontWeight: '700' },

  recaptureBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  recaptureBtnText: { color: '#A0AEC0', fontSize: 13, fontWeight: '800' }
});
