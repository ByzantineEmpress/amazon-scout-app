import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { extractIsbnCandidates } from '../services/isbn';
import { confirmScan, EMPTY_CONFIRMATION } from '../services/barcodeValidation';
import { guessTitleAndAuthor } from '../services/titleScan';
import { searchBooksByTitle } from '../services/titleSearch';
import { palette, space, type, layout } from '../design/theme';
import { Card, Button, Field, Chip, Stat } from '../design/primitives';

/**
 * The OCR module is required lazily. It is native, its entry point throws where the native code is
 * absent, and a top-level import would take the whole app down at startup in Expo Go.
 */
let recognizeTextModule = null;

function getRecognizeText() {
  if (!recognizeTextModule) {
    recognizeTextModule = require('@infinitered/react-native-mlkit-text-recognition');
  }
  return recognizeTextModule.recognizeText;
}

/**
 * Read a book that has no barcode.
 *
 * Two modes, deliberately different in behaviour:
 *
 *  - "ISBN" scans continuously. Books from the seventies and early eighties often have the number
 *    printed but no barcode, and in a shop you want hands-free: hold it in the box and it locks on.
 *    What makes that safe is the check digit - a misread digit breaks the checksum, so a wrong
 *    number is dropped rather than looked up - plus a requirement that two frames agree.
 *  - "Title" reads once, on a tap. It has to: the fields are editable, and a continuous loop would
 *    overwrite what the user just typed. Books older than ISBN (1970) have no number at all, so
 *    the title is then searched against OpenLibrary and the chosen edition carries an ISBN.
 *
 * The camera mounts ~350 ms late so the scanner behind it has released the device, and captures are
 * silent because this takes a frame every 700 ms while reading.
 */
export default function IsbnToolScreen({ onClose, onLookup }) {
  const insets = useSafeAreaInsets();
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

  // The previous screen's camera unmounts in the same commit; Android hands back a black preview if
  // a second camera takes the device while the first is still shutting down.
  useEffect(() => {
    const id = setTimeout(() => setCameraArmed(true), 350);
    return () => clearTimeout(id);
  }, []);

  /** Grab one frame, read it, and clean up the temporary file immediately. */
  const readFrame = async () => {
    const recognizeText = getRecognizeText();
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, shutterSound: false });
    try {
      return await recognizeText(photo.uri);
    } finally {
      try {
        new File(photo.uri).delete();
      } catch (_e) {
        // Cache cleanup is best-effort; the OS reclaims it.
      }
    }
  };

  // Continuous ISBN reading, only in ISBN mode.
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

        // Two agreeing frames before anything is offered, so a one-frame misread cannot produce a
        // plausible but wrong ISBN.
        const step = confirmScan(confirmRef.current, found[0]);
        confirmRef.current = step.state;
        if (!step.accept) {
          setStatus('Hold steady…');
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
    setStatus('Reading the page…');
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

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
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
          <View style={styles.starting} pointerEvents="none">
            <ActivityIndicator color={palette.accent} />
            <Text style={[styles.text, type.small, styles.muted, styles.startingText]}>
              Starting camera…
            </Text>
          </View>
        ) : null}

        {mode === 'isbn' ? (
          <View style={styles.reticleWrap} pointerEvents="none">
            <View style={styles.reticle}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
          </View>
        ) : null}

        <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
          <Chip label="ISBN" selected={mode === 'isbn'} onPress={() => setMode('isbn')} />
          <Chip label="Title" selected={mode === 'title'} onPress={() => setMode('title')} />
          <Chip label={torch ? '🔦 On' : '🔦'} selected={torch} onPress={() => setTorch((on) => !on)} />
          <View style={styles.spacer} />
          <Button label="Done" variant="secondary" size="sm" onPress={onClose} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottom}
        >
          <Card style={styles.panel}>
            <Text style={[styles.text, type.small, styles.status]}>{status}</Text>

            {mode === 'isbn' ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                {candidate ? (
                  <>
                    <Stat label="ISBN read from the page" value={candidate} />
                    <Button
                      label="Look this up"
                      onPress={() => {
                        onClose();
                        onLookup(candidate);
                      }}
                      style={styles.primaryAction}
                    />
                    <Button label="Scan again" variant="ghost" size="sm" onPress={rescan} />
                  </>
                ) : (
                  <Text style={[styles.text, type.small, styles.muted]}>
                    Hold the printed number inside the box. Ten and thirteen digits both work, with
                    or without hyphens. Every number is checksum-checked, so a misread is ignored
                    rather than looked up.
                  </Text>
                )}
              </ScrollView>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Button
                  label={reading ? 'Reading…' : '📖 Read the title page'}
                  variant="secondary"
                  loading={reading}
                  onPress={readTitle}
                />

                <Field
                  label="Title"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. The Great Gatsby"
                  autoCorrect={false}
                  style={styles.field}
                />
                <Field
                  label="Author (optional)"
                  value={author}
                  onChangeText={setAuthor}
                  placeholder="e.g. F. Scott Fitzgerald"
                  autoCorrect={false}
                />

                <Button
                  label={searching ? 'Searching…' : 'Search OpenLibrary'}
                  loading={searching}
                  disabled={!title.trim()}
                  onPress={runSearch}
                  style={styles.field}
                />

                {results.map((result) => (
                  <Card
                    key={result.key}
                    onPress={() => {
                      onClose();
                      onLookup(result.isbn);
                    }}
                    style={styles.result}
                  >
                    <Text style={[styles.text, type.body]} numberOfLines={2}>
                      {result.title}
                    </Text>
                    <Text style={[styles.text, type.small, styles.muted]} numberOfLines={1}>
                      {[result.author, result.year].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={[styles.text, type.small, styles.isbn]}>{result.isbn}</Text>
                  </Card>
                ))}

                {searched && results.length === 0 && !searching ? (
                  <Text style={[styles.text, type.small, styles.muted, styles.field]}>
                    Nothing matched. Try the first few words of the title.
                  </Text>
                ) : null}
              </ScrollView>
            )}
          </Card>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  isbn: { color: palette.good },

  starting: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  startingText: { marginTop: space.sm },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingBottom: space.sm,
    backgroundColor: 'rgba(5, 10, 18, 0.55)'
  },
  spacer: { flex: 1 },

  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: '80%', height: 84 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: palette.accent },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },

  bottom: { position: 'absolute', left: layout.gutter, right: layout.gutter, bottom: layout.gutter },
  panel: { backgroundColor: 'rgba(20, 30, 46, 0.96)', maxHeight: 360 },
  status: { color: palette.warn, marginBottom: space.md },
  primaryAction: { marginTop: space.lg, marginBottom: space.sm },
  field: { marginTop: space.md },
  result: { marginTop: space.sm, padding: space.md, gap: space.xxs }
});
