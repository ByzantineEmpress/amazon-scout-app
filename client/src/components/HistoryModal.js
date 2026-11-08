import React from 'react';
import { Modal } from 'react-native';
import HistoryScreen from '../screens/HistoryScreen';

/**
 * History, presented modally.
 *
 * This is deliberately a thin wrapper: the screen itself lives in screens/HistoryScreen.js and is
 * the same component the redesigned shell will host as a tab. Keeping the modal here means the
 * current app can show the rebuilt screen today, without waiting for the rest of the redesign, and
 * deleting this file later removes nothing but a <Modal>.
 */
export default function HistoryModal({ visible, onClose, onItemSelect }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <HistoryScreen onClose={onClose} onItemSelect={onItemSelect} />
    </Modal>
  );
}
