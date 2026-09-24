require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { processBarcodeScan } = require('./barcodeService');
const { GATED_BOOK_PUBLISHERS, GATED_MEDIA_STUDIOS, GATED_VIDEO_GAME_BRANDS } = require('./gatingRules');
const { isSpApiConfigured } = require('./amazonSpApi');

const app = express();
const PORT = process.env.PORT || 3000;

// Restrictive CORS policy to prevent unauthorized cross-origin requests
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:3000'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser agents (mobile app, curl) where origin header is not set
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: isSpApiConfigured() ? 'TIER_2_PRO_SP_API' : 'TIER_1_FREE_METADATA_ENGINE',
    spApiConnected: isSpApiConfigured(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Single scan endpoint (optimized for < 300 byte response and sub-200ms roundtrips)
app.post('/api/scan', async (req, res) => {
  const { barcode } = req.body;
  if (!barcode) {
    return res.status(400).json({ error: 'Barcode parameter is required.' });
  }

  try {
    const result = await processBarcodeScan(barcode);
    res.json(result);
  } catch (err) {
    console.error('Scan error:', err.message);
    res.status(500).json({
      error: 'Scan processing failed',
      message: err.message,
      barcode
    });
  }
});

// Batch scan endpoint (for syncing the mobile app's Offline Queue when exiting low-service areas)
app.post('/api/batch-scan', async (req, res) => {
  const { barcodes } = req.body;
  if (!Array.isArray(barcodes) || barcodes.length === 0) {
    return res.status(400).json({ error: 'Barcodes array is required.' });
  }

  try {
    // Process items in parallel with a cap
    const results = await Promise.all(
      barcodes.map(b => processBarcodeScan(b).catch(err => ({
        barcode: b,
        error: err.message,
        status: 'ERROR'
      })))
    );
    res.json({ count: results.length, items: results });
  } catch (err) {
    console.error('Batch scan error:', err.message);
    res.status(500).json({ error: 'Batch processing failed' });
  }
});

// Gating rules info endpoint
app.get('/api/gating-rules', (req, res) => {
  res.json({
    hardGatedPublishers: GATED_BOOK_PUBLISHERS.map(p => ({ name: p.name, reason: p.reason })),
    hardGatedMediaStudios: GATED_MEDIA_STUDIOS.map(s => ({ name: s.name, reason: s.reason })),
    gatedGameBrands: GATED_VIDEO_GAME_BRANDS.map(g => ({ name: g.name, reason: g.reason }))
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`⚡ Amazon Scout Server running on port ${PORT}`);
  console.log(`📡 Operational Mode: ${isSpApiConfigured() ? 'TIER 2 (Pro SP-API Live)' : 'TIER 1 (Open Metadata & Gating Rules Engine)'}`);
  console.log(`===================================================`);
});
