import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

export default function ManualEntryModal({ visible, onClose, onSubmit }) {
  const [barcode, setBarcode] = useState('');
  const [pastedNotice, setPastedNotice] = useState(false);

  useEffect(() => {
    if (visible) {
      setBarcode('');
      setPastedNotice(false);
    }
  }, [visible]);

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        const cleaned = text.trim().replace(/[^0-9X]/gi, '');
        if (cleaned) {
          setBarcode(cleaned);
          setPastedNotice(true);
          setTimeout(() => setPastedNotice(false), 2000);
        }
      }
    } catch (e) {}
  };

  const handleSubmit = () => {
    const cleaned = barcode.trim();
    if (!cleaned) return;
    Keyboard.dismiss();
    onSubmit(cleaned);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
            style={styles.keyboardAvoid}
          >
            <View style={styles.dialogCard}>
              <View style={styles.dialogHeader}>
                <Text style={styles.dialogTitle}>⌨️ Manual Barcode / ISBN</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.dialogSubtitle}>
                Type a 10-digit ISBN, 13-digit barcode, or paste from clipboard:
              </Text>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 9780132350884"
                  placeholderTextColor="#718096"
                  keyboardType="numeric"
                  value={barcode}
                  onChangeText={setBarcode}
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="search"
                  onSubmitEditing={handleSubmit}
                />
                {barcode.length > 0 ? (
                  <TouchableOpacity
                    style={styles.clearInputBtn}
                    onPress={() => setBarcode('')}
                  >
                    <Text style={styles.clearInputBtnText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.helperRow}>
                <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste}>
                  <Text style={styles.pasteBtnText}>
                    📋 {pastedNotice ? 'Pasted from Clipboard!' : 'Paste from Clipboard'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    !barcode.trim() && styles.submitBtnDisabled
                  ]}
                  onPress={handleSubmit}
                  disabled={!barcode.trim()}
                >
                  <Text style={styles.submitBtnText}>🔍 Look Up Barcode</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  keyboardAvoid: {
    width: '100%',
    maxWidth: 420
  },
  dialogCard: {
    backgroundColor: '#1A202C',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#4A5568',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  dialogTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800'
  },
  closeBtn: {
    padding: 6
  },
  closeBtnText: {
    color: '#A0AEC0',
    fontSize: 18,
    fontWeight: '700'
  },
  dialogSubtitle: {
    color: '#A0AEC0',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3182CE',
    marginBottom: 12
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 14,
    letterSpacing: 1
  },
  clearInputBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  clearInputBtnText: {
    color: '#A0AEC0',
    fontSize: 16,
    fontWeight: '700'
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 20
  },
  pasteBtn: {
    backgroundColor: '#2D3748',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  pasteBtnText: {
    color: '#63B3ED',
    fontSize: 13,
    fontWeight: '700'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2D3748',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelBtnText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700'
  },
  submitBtn: {
    flex: 2,
    backgroundColor: '#3182CE',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitBtnDisabled: {
    backgroundColor: '#4A5568',
    opacity: 0.6
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  }
});
