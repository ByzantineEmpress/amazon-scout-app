import { processBarcodeScanOnDevice } from './barcodeService';
import { getOfflineQueue, clearOfflineQueue, addScanToHistory } from './storage';

/**
 * Scan a single barcode directly on-device
 * 100% Serverless - zero hosting cost, no server to run!
 */
export async function scanBarcode(barcode, marketplace = 'CA') {
  try {
    const data = await processBarcodeScanOnDevice(barcode, marketplace);
    return { success: true, data, offline: data.status === 'OFFLINE_QUEUED' };
  } catch (err) {
    console.error('Scan error:', err);
    return {
      success: false,
      data: {
        barcode,
        title: 'Error reading barcode',
        badge: 'ERROR',
        badgeColor: '#E53E3E',
        reason: err.message,
        canSell: false
      }
    };
  }
}

/**
 * Sync all queued barcodes on-device when cell service returns
 */
export async function syncOfflineQueue(marketplace = 'CA') {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { count: 0, items: [] };

  const results = [];
  for (const barcode of queue) {
    try {
      const item = await processBarcodeScanOnDevice(barcode, marketplace);
      results.push(item);
      await addScanToHistory(item);
    } catch (e) {
      results.push({ barcode, error: e.message });
    }
  }

  await clearOfflineQueue();
  return { count: results.length, items: results };
}
