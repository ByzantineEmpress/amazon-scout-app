import React from 'react';
import { Modal } from 'react-native';
import SettingsScreen from '../screens/SettingsScreen';

/**
 * Settings, presented modally.
 *
 * A thin wrapper for the same reason as HistoryModal: the real component is
 * screens/SettingsScreen.js, shared with the redesigned shell.
 *
 * Note that settings now save as they change, so `onSettingsUpdated` fires on every change rather
 * than once when a Save button is pressed. Callers that hold settings in state (the scanner does,
 * for marketplace and the ITF-14 toggle) therefore stay in step without a round trip.
 */
export default function SettingsModal({ visible, onClose, onSettingsUpdated }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SettingsScreen onClose={onClose} onSettingsChange={onSettingsUpdated} />
    </Modal>
  );
}
