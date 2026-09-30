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
import { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { extractIsbnCandidates } from '../services/isbn';
import { confirmScan, EMPTY_CONFIRMATION } from '../services/barcodeValidation';
import { guessTitleAndAuthor } from '../services/titleScan';
import { searchBooksByTitle } from '../services/titleSearch';

/**
 * The OCR module is loaded on first use rather than imported at the top, and that matters.
 * It is a native module, and its own entry point calls `requireNativeModule` the moment it is
 * evaluated - which throws wherever the native code is absent, Expo Go above all. A top-level
 * import here would therefore stop the whole app from starting in Expo Go, even for someone who
 * never opens this screen. Deferring it keeps `npm start` working for everything else, and this
 * screen simply reports that reading failed.
 */
let recognizeTextModule = null;

function getRecognizeText() {
  if (!recognizeTextModule) {
    recognizeTextModule = require('@infinitered/react-native-mlkit-text-recognition');
  }
  return recognizeTextModule.recognizeText;
}

/**
 * Reads a book that has no barcode.
 *
 * Two modes, deliberately different in behaviour:
 *
 *  - "ISBN" scans continuously. Older books that have an ISBN printed but no barcode are the
 *    whole point, and in a sale you want hands-free: hold the number in the box and it locks on.
 *    What makes that safe is the check digit - a misread digit breaks the checksum, so a wrong
 *    number is dropped rather than looked up - plus a requirement that two frames agree.
 *  - "Title" reads once, on a tap. It has to: the fields are editable, and a continuous loop
 *    would overwrite whatever the user just typed. Used for books that predate ISBN entirely.
 *
 * The preview is full-bleed, with the controls floating over it. An earlier version put the
 * camera in a fixed-height band, and the preview refused to fill it - the camera image occupied
 * the top of the band and the rest stayed black. Full screen is also the arrangement the main
 * scanner already uses successfully, and it gives ML Kit the largest image to read.
 */
const IS_ANDROID = Platform.OS === 'android';

export default function IsbnScanModal({ onClose, onLookup }) {
  const [mode, setMode] = useState('isbn');
  const [torch, setTorch] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [status, setStatus] = useState('Line up the printed number');
  const [reading, setReading] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraArmed, setCameraArmed] = useState(false);

  const cameraRef = useRef(null);
  const inFlight = useRef(false);
  const confirmRef = useRef(EMPTY_CONFIRMATION);
  const lockedRef = useRef(false);

  // The parent mounts this only while it is open, so state starts fresh every time and there is
  // no need to reset anything in an effect (which would cause cascading renders).

  // Mount the camera a beat late. The main viewfinder unmounts in the same React commit as this
  // screen mounts, and Android hands back a black preview - sometimes a bind failure - if a
  // second camera grabs the device while the first is still shutting down. The delay is hidden
  // behind the "Starting camera..." overlay.
  useEffect(() => {
    const id = setTimeout(() => setCameraArmed(true), 350);
    return () => clearTimeout(id);
  }, []);

  /** Capture one frame, OCR it, and clean the temporary file up immediately. */
  const readFrame = async () => {
    const recognizeText = getRecognizeText();
    // shutterSound: false matters more than it looks - this captures a frame every 700ms, and
    // a shutter click that often is unbearable in a quiet shop.
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.3,
      shutterSound: false
    });
    try {
      return await recognizeText(photo.uri);
    } finally {
      try {
        new File(photo.uri).delete();
      } catch (_e) {
        // Cache cleanup is best-effort; the OS reclaims it regardless.
      }
    }
  };

  // Continuous ISBN reading, only while this screen is in ISBN mode.
  useEffect(() => {
    if (mode !== 'isbn') return undefined;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || inFlight.current || lockedRef.current || !cameraRef.current) return;
      inFlight.current = true;
      try {
        const result = await readFrame();
        if (cancelled) return;

        const found = extractIsbnCandidates(result?.text || '');
        if (found.length === 0) {
          confirmRef.current = EMPTY_CONFIRMATION;
          setStatus('Line up the printed number');
          return;
        }

        // Two agreeing frames before anything is offered, so a one-frame misread cannot
        // produce a plausible-looking but wrong ISBN.
        const step = confirmScan(confirmRef.current, found[0]);
        confirmRef.current = step.state;
        if (!step.accept) {
          setStatus('Hold steady...');
          return;
        }

        lockedRef.current = true;
        setCandidate(found[0]);
        setStatus(found.length > 1 ? `${found.length} numbers found — check this one` : 'Found it');
      } catch (_e) {
        if (!cancelled) setStatus('Line up the printed number');
      } finally {
        inFlight.current = false;
      }
    };

    const id = setInterval(tick, 700);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  const readTitle = async () => {
    if (reading || !cameraRef.current) return;
    setReading(true);
    setStatus('Reading the page...');
    try {
      const result = await readFrame();
      const guess = guessTitleAndAuthor(result?.blocks);
      if (!guess.title && !guess.author) {
        setStatus('Could not read a title — try again, or type it below');
      } else {
        setTitle(guess.title || title);
        setAuthor(guess.author || author);
        setStatus('Check the details, then search');
      }
    } catch (_e) {
      setStatus('Reading failed — try again, or type it below');
    } finally {
      setReading(false);
    }
  };

  const runSearch = async () => {
    if (!title.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const found = await searchBooksByTitle({ title: title.trim(), author: author.trim() });
      setResults(found);
      setSearched(true);
      setStatus(found.length === 0 ? 'No matches — try fewer words' : `${found.length} possible matches`);
    } catch (_e) {
      setResults([]);
      setSearched(true);
      setStatus('Search failed — check your signal');
    } finally {
      setSearching(false);
    }
  };

  const rescan = () => {
    lockedRef.current = false;
    confirmRef.current = EMPTY_CONFIRMATION;
    setCandidate(null);
    setStatus('Line up the printed number');
  };

  const use = (code) => {
    onClose();
    onLookup(code);
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
              enableTorch={torch}
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

          {mode === 'isbn' ? (
            <View style={styles.reticleOverlay} pointerEvents="none">
              <View style={styles.reticleBox}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>
            </View>
          ) : (
            <View style={styles.pageHint} pointerEvents="none">
              <Text style={styles.pageHintText}>Fill the frame with the title page</Text>
            </View>
          )}
        </View>

        {/* Controls, floating over the preview */}
        <View style={styles.topBar}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Scan a Book Without a Barcode</Text>
            <TouchableOpacity
              style={[styles.torchBtn, torch && styles.torchBtnOn]}
              onPress={() => setTorch(!torch)}
            >
              <Text style={styles.torchBtnText}>{torch ? '🔦 On' : '🔦 Light'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'isbn' && styles.tabActive]}
              onPress={() => setMode('isbn')}
            >
              <Text style={[styles.tabText, mode === 'isbn' && styles.tabTextActive]}>ISBN number</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'title' && styles.tabActive]}
              onPress={() => setMode('title')}
            >
              <Text style={[styles.tabText, mode === 'title' && styles.tabTextActive]}>Title (pre-1970)</Text>
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

              {mode === 'isbn' ? (
                candidate ? (
                  <View style={styles.candidateCard}>
                    <Text style={styles.candidateLabel}>ISBN read from the page</Text>
                    <Text style={styles.candidateValue}>{candidate}</Text>
                    <TouchableOpacity style={styles.confirmBtn} onPress={() => use(candidate)}>
                      <Text style={styles.confirmBtnText}>Look this up</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkBtn} onPress={rescan}>
                      <Text style={styles.linkBtnText}>Scan again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.help}>
                    Hold the printed ISBN inside the box. Both 10- and 13-digit numbers work, with
                    or without hyphens. Every number is checksum-verified, so a misread is ignored
                    rather than looked up.
                  </Text>
                )
              ) : (
                <View>
                  <TouchableOpacity style={styles.readBtn} onPress={readTitle} disabled={reading}>
                    <Text style={styles.readBtnText}>
                      {reading ? 'Reading...' : '📖 Read the title page'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>Title</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. The Great Gatsby"
                    placeholderTextColor="#718096"
                    autoCorrect={false}
                  />

                  <Text style={styles.fieldLabel}>Author (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={author}
                    onChangeText={setAuthor}
                    placeholder="e.g. F. Scott Fitzgerald"
                    placeholderTextColor="#718096"
                    autoCorrect={false}
                  />

                  <TouchableOpacity
                    style={[styles.searchBtn, !title.trim() && styles.btnDisabled]}
                    onPress={runSearch}
                    disabled={!title.trim() || searching}
                  >
                    <Text style={styles.searchBtnText}>
                      {searching ? 'Searching...' : 'Search OpenLibrary'}
                    </Text>
                  </TouchableOpacity>

                  {searching ? <ActivityIndicator color="#48BB78" style={styles.spinner} /> : null}

                  {results.map((r) => (
                    <TouchableOpacity key={r.key} style={styles.resultRow} onPress={() => use(r.isbn)}>
                      <Text style={styles.resultTitle} numberOfLines={2}>{r.title}</Text>
                      <Text style={styles.resultMeta} numberOfLines={1}>
                        {[r.author, r.year].filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={styles.resultIsbn}>{r.isbn}</Text>
                    </TouchableOpacity>
                  ))}

                  {searched && results.length === 0 && !searching ? (
                    <Text style={styles.help}>
                      Nothing matched. Try just the first few words of the title.
                    </Text>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Keep the sheet to roughly half the screen so the preview stays usable behind it. */
const PANEL_MAX_HEIGHT = Math.round(Dimensions.get('window').height * (IS_ANDROID ? 0.52 : 0.58));

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
  torchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 8
  },
  torchBtnOn: { backgroundColor: '#D69E2E' },
  torchBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  doneBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, backgroundColor: '#38A169' },
  doneBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  topBar: { backgroundColor: 'rgba(15,23,42,0.9)' },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.14)'
  },
  tabActive: { backgroundColor: '#3182CE' },
  tabText: { color: '#CBD5E0', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },

  spacer: { flex: 1 },

  cameraStarting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)'
  },
  cameraStartingText: { color: '#A0AEC0', fontSize: 12, fontWeight: '700', marginTop: 8 },

  reticleOverlay: {
    position: 'absolute',
    top: '26%',
    left: 0,
    right: 0,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reticleBox: { width: '82%', height: 84 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: '#48BB78' },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  pageHint: { position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' },
  pageHintText: {
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
  status: { color: '#ECC94B', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  help: { color: '#A0AEC0', fontSize: 13, lineHeight: 19 },
  candidateCard: { backgroundColor: '#1A202C', borderRadius: 14, padding: 16, alignItems: 'center' },
  candidateLabel: { color: '#A0AEC0', fontSize: 12, fontWeight: '700' },
  candidateValue: {
    color: '#F8FAFC',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginVertical: 10
  },
  confirmBtn: {
    backgroundColor: '#38A169',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center'
  },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  linkBtn: { marginTop: 12, paddingVertical: 4 },
  linkBtnText: { color: '#90CDF4', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  readBtn: {
    backgroundColor: '#3182CE',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14
  },
  readBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  fieldLabel: { color: '#A0AEC0', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: {
    backgroundColor: '#1A202C',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2D3748',
    marginBottom: 10
  },
  searchBtn: {
    backgroundColor: '#38A169',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4
  },
  btnDisabled: { backgroundColor: '#2D3748' },
  searchBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  spinner: { marginTop: 12 },
  resultRow: {
    backgroundColor: '#1A202C',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#48BB78'
  },
  resultTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  resultMeta: { color: '#A0AEC0', fontSize: 12, marginTop: 3 },
  resultIsbn: { color: '#68D391', fontSize: 12, fontWeight: '700', marginTop: 3 }
});
