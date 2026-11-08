import React, { useState, useEffect } from 'react';
import ItemCompsModal from '../components/ItemCompsModal';
import { getSettings } from '../services/storage';

/**
 * The comps tab.
 *
 * This deliberately hosts the existing photo-comps screen for now. That screen is still a modal
 * built on the old styles, and step 3 of the rebuild replaces it with a real screen using the
 * design system - so rather than half-convert it here, this hosts it unchanged. The feature is
 * reachable in the new shell from today, and nothing here will need to be redone when the screen
 * itself is rebuilt.
 */
export default function CompsScreen({ onNavigate }) {
  const [marketplace, setMarketplace] = useState('CA');

  useEffect(() => {
    let alive = true;
    getSettings().then((stored) => {
      if (alive) setMarketplace(stored.marketplace === 'US' ? 'US' : 'CA');
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ItemCompsModal
      marketplace={marketplace}
      onClose={() => {
        if (onNavigate) onNavigate('scan');
      }}
    />
  );
}
