import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Keyboard } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { palette, space, type } from '../design/theme';
import { Card, Button, Field } from '../design/primitives';

/**
 * Type or paste a barcode.
 *
 * Still a dialog rather than a screen, and deliberately so: it is a focused interruption of a
 * second or two, not somewhere you go. What changed is that it is built from the same primitives as
 * everything else, and it cleans what it is given - people paste ISBNs with hyphens and spaces from
 * a listing, and those are not barcodes.
 *
 * The parent mounts it only while it is open, so it starts from fresh state every time. Resetting
 * state inside an effect is what the linter rejects, and conditional mounting is the established
 * fix for it in this codebase.
 */
export default function ManualEntryDialog({ onClose, onSubmit }) {
  const [code, setCode] = useState('');
  const [pasted, setPasted] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) return;
      // Keep only what a barcode can contain: pasted ISBNs carry hyphens and spaces.
      const cleaned = text.trim().replace(/[^0-9X]/gi, '');
      if (!cleaned) return;
      setCode(cleaned);
      setPasted(true);
      setTimeout(() => setPasted(false), 2000);
    } catch (_e) {
      // Clipboard refused or empty; the field is still there to type into.
    }
  };

  const submit = () => {
    const cleaned = code.trim();
    if (!cleaned) return;
    Keyboard.dismiss();
    onSubmit(cleaned);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.dialog}>
          <Text style={[styles.text, type.title]}>Type a barcode</Text>
          <Text style={[styles.text, type.small, styles.muted, styles.body]}>
            {pasted ? 'Pasted and cleaned up.' : 'Digits from a barcode, or an ISBN. Hyphens are fine.'}
          </Text>

          <Field
            value={code}
            onChangeText={setCode}
            placeholder="9780441013593"
            keyboardType="default"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submit}
          />

          <View style={styles.actions}>
            <Button label="Paste" icon="📋" variant="ghost" size="sm" onPress={handlePaste} />
            <View style={styles.spacer} />
            <Button label="Cancel" variant="secondary" size="sm" onPress={onClose} />
            <Button label="Look up" onPress={submit} disabled={!code.trim()} size="sm" />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  backdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'center',
    paddingHorizontal: space.lg
  },
  dialog: { gap: space.sm },
  body: { marginBottom: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  spacer: { flex: 1 }
});
