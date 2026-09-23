import axios from 'axios';
import { addToOfflineQueue, getOfflineQueue, clearOfflineQueue } from './storage';

/**
 * Scan a single barcode through the backend proxy
 */
export async function scanBarcode(barcode, serverUrl) {
  const url = `${serverUrl.replace(/\/+$/, '')}/api/scan`;

  try {
    const response = await axios.post(
      url,
      { barcode },
      { timeout: 4500 } // Short timeout for low-service environments
    );
    return { success: true, data: response.data, offline: false };
  } catch (err) {
    console.warn(`Scan request failed for ${barcode}:`, err.message);

    // Save barcode to offline queue for later resolution
    await addToOfflineQueue(barcode);

    return {
      success: false,
      offline: true,
      data: {
        barcode,
        title: 'Saved to Offline Queue (No Cell Signal)',
        status: 'OFFLINE_QUEUED',
        badge: 'OFFLINE QUEUED',
        badgeColor: '#718096',
        reason: 'Network timeout in low service. Queued for auto-sync.',
        canSell: null,
        sellerCentralUrl: `https://sellercentral.amazon.com/productsearch?q=${barcode}`
      }
    };
  }
}

/**
 * Sync all queued barcodes when cell service is restored
 */
export async function syncOfflineQueue(serverUrl) {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { count: 0, items: [] };

  const url = `${serverUrl.replace(/\/+$/, '')}/api/batch-scan`;

  try {
    const response = await axios.post(url, { barcodes: queue }, { timeout: 10000 });
    await clearOfflineQueue();
    return { success: true, ...response.data };
  } catch (err) {
    console.error('Failed to sync offline queue:', err.message);
    throw err;
  }
}

/**
 * Check backend connection status
 */
export async function testServerConnection(serverUrl) {
  try {
    const url = `${serverUrl.replace(/\/+$/, '')}/health`;
    const response = await axios.get(url, { timeout: 3000 });
    return { ok: true, data: response.data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
