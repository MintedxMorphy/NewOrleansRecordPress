/**
 * Analyze 140g vs 180g vinyl orders from QBO invoices
 *
 * Calculates PVC giveaway when 180g is pressed but 140g was ordered
 * 40g/record waste × $690/MT PVC spot price
 *
 * Usage: QBO_CLIENT_ID=... QBO_CLIENT_SECRET=... QBO_REFRESH_TOKEN=... node scripts/analyze-vinyl-weights.mjs
 */

import 'dotenv/config';

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';

async function getAccessToken() {
  const creds = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(process.env.QBO_REFRESH_TOKEN)}`,
  });
  const data = await res.json();
  if (data.error) throw new Error(`Auth failed: ${data.error_description || data.error}`);
  return data.access_token;
}

async function qboQuery(token, query) {
  const realmId = process.env.QBO_REALM_ID;
  const res = await fetch(`${QBO_BASE}/${realmId}/query?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  return res.json();
}

function parseWeight(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/180\s*g|180\s*gram/i.test(lower)) return 180;
  if (/140\s*g|140\s*gram/i.test(lower)) return 140;
  if (/heavyweight|heavy\s+weight/i.test(lower)) return 180;
  if (/standard|lightweight|light\s+weight/i.test(lower)) return 140;
  return null;
}

async function main() {
  console.log('Fetching QBO access token...');
  const token = await getAccessToken();
  console.log('Token acquired.\n');

  // Get invoices from last 12 months
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const startStr = startDate.toISOString().split('T')[0];

  console.log(`Querying invoices since ${startStr}...`);

  const query = `SELECT * FROM Invoice WHERE TxnDate >= '${startStr}' MAXRESULTS 1000`;
  const data = await qboQuery(token, query);
  const invoices = data?.QueryResponse?.Invoice || [];

  console.log(`Found ${invoices.length} invoices.\n`);

  let total140g = 0;
  let total180g = 0;
  let totalUnknown = 0;
  let qty140g = 0;
  let qty180g = 0;
  let qtyUnknown = 0;
  const details = [];

  for (const inv of invoices) {
    const lines = inv.Line || [];
    for (const line of lines) {
      if (line.DetailType !== 'SalesItemLineDetail') continue;

      const desc = line.Description || '';
      const itemName = line.SalesItemLineDetail?.ItemRef?.name || '';
      const qty = line.SalesItemLineDetail?.Qty || 1;
      const amount = line.Amount || 0;

      const weight = parseWeight(desc) || parseWeight(itemName);

      if (weight === 140) {
        total140g += amount;
        qty140g += qty;
      } else if (weight === 180) {
        total180g += amount;
        qty180g += qty;
      } else {
        totalUnknown += amount;
        qtyUnknown += qty;
        if (desc || itemName) {
          details.push({ invNum: inv.DocNumber, desc: desc || itemName, qty, amount });
        }
      }
    }
  }

  console.log('=== VINYL WEIGHT ANALYSIS ===\n');
  console.log('Orders by Weight:');
  console.log(`  140g: ${qty140g.toLocaleString()} records ($${total140g.toLocaleString()})`);
  console.log(`  180g: ${qty180g.toLocaleString()} records ($${total180g.toLocaleString()})`);
  console.log(`  Unknown: ${qtyUnknown.toLocaleString()} line items ($${totalUnknown.toLocaleString()})`);
  console.log('');

  // PVC giveaway calculation
  // If 180g is pressed when 140g was ordered, that's 40g waste per record
  // Assumption: All 140g orders may have been pressed at 180g
  const wastePerRecord = 0.040; // 40g in kg
  const pvcSpot = 690; // $/MT
  const pvcPerKg = pvcSpot / 1000; // $/kg

  const potentialWasteKg = qty140g * wastePerRecord;
  const potentialWasteMT = potentialWasteKg / 1000;
  const potentialCost = potentialWasteKg * pvcPerKg;

  console.log('=== PVC GIVEAWAY ESTIMATE ===');
  console.log('(If all 140g orders pressed at 180g)\n');
  console.log(`  140g orders: ${qty140g.toLocaleString()} records`);
  console.log(`  Waste per record: 40g (180g - 140g)`);
  console.log(`  Total waste: ${potentialWasteKg.toFixed(1)} kg (${potentialWasteMT.toFixed(3)} MT)`);
  console.log(`  PVC spot price: $${pvcSpot}/MT`);
  console.log(`  Estimated giveaway value: $${potentialCost.toFixed(2)}`);
  console.log('');

  if (details.length > 0 && details.length <= 20) {
    console.log('=== UNCLASSIFIED LINE ITEMS (sample) ===');
    for (const d of details.slice(0, 20)) {
      console.log(`  Invoice ${d.invNum}: "${d.desc}" (qty: ${d.qty}, $${d.amount})`);
    }
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
