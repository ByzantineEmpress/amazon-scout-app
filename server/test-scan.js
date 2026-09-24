const { processBarcodeScan } = require('./barcodeService');

async function runTests() {
  console.log('🧪 Starting Gating & Barcode Recognition Tests...\n');

  const testCases = [
    {
      label: 'Known Hard-Gated Pearson Textbook (Clean Code)',
      barcode: '9780132350884',
      expectedStatus: 'HARD_GATED'
    },
    {
      label: 'Disney Gated Media Title (The Lion King)',
      barcode: '786936854183',
      expectedStatus: 'HARD_GATED'
    },
    {
      label: 'Nintendo Video Game (Mario)',
      barcode: '045496590741',
      expectedStatus: 'HARD_GATED'
    },
    {
      label: 'Standard Non-Gated Trade Book (The Great Gatsby)',
      barcode: '9780743273565',
      expectedStatus: 'UNGATED'
    }
  ];

  for (const tc of testCases) {
    console.log(`-----------------------------------------------------`);
    console.log(`Testing: ${tc.label} [Barcode: ${tc.barcode}]`);
    try {
      const res = await processBarcodeScan(tc.barcode);
      console.log(`Title: ${res.title}`);
      console.log(`Publisher/Brand: ${res.publisher || 'N/A'}`);
      console.log(`Category: ${res.category}`);
      console.log(`Status: [${res.badge}] (${res.status})`);
      console.log(`Can Sell: ${res.canSell}`);
      console.log(`Requires Invoices: ${res.requiresInvoices}`);
      console.log(`Reason: ${res.reason}`);
      console.log(`Payload Size: ~${JSON.stringify(res).length} bytes`);
    } catch (err) {
      console.error('Error testing barcode:', tc.barcode, err.message);
    }
  }

  console.log('\n✅ Testing completed!');
}

runTests();
