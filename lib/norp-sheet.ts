import { google } from 'googleapis';
import { getPersonalGmailAuth } from './google-auth';

const NORP_SHEET_ID = process.env.NORP_PRODUCTION_SHEET_ID!;

// READ-ONLY: This is the live production bible. Never write to this sheet.

export interface NORPJob {
  job_id: string;
  customer: string;
  matrix: string;
  quantity: string;
  colors: string;
  weight: string;
  speed: string;
  lacquer: string;
  stampers: string;
  test_pressings_sent: string;
  test_pressings_approved: string;
  labels_arrived: string;
  sleeves_arrived: string;
  jackets_arrived: string;
  ship_date: string;
  order_number: string;
  deposit: string;
  notes: string;
  due_note: string;
  stage: string;
}

function inferStage(row: string[]): string {
  const lacquer = row[5]?.trim() ?? '';        // F
  const stampers = row[6]?.trim() ?? '';       // G
  const tpsSent = row[8]?.trim() ?? '';        // I
  const tpsApproved = row[9]?.trim() ?? '';    // J
  const labelsArrived = row[12]?.trim() ?? ''; // M
  const sleevesArrived = row[15]?.trim() ?? '';// P
  const jacketsArrived = row[18]?.trim() ?? '';// S
  const shipDate = row[26]?.trim() ?? '';      // AA
  const deposit = row[27]?.trim().toLowerCase() ?? ''; // AB

  // ship: has ship date
  if (shipDate) return 'ship';

  // Check if TPs are approved
  const approved = tpsApproved.length > 0;

  // pressing: TPs approved AND all ordered components have arrived
  if (approved) {
    // Check if all components that were ordered have arrived
    // Simple logic: if they're non-empty, consider them arrived
    const allArrived = labelsArrived.length > 0 || sleevesArrived.length > 0 || jacketsArrived.length > 0;
    // If nothing was ordered OR things have arrived
    // For now, just check if jackets arrived (main component)
    if (jacketsArrived.length > 0) return 'pressing';
    return 'approved';
  }

  // test_pressing: Stampers done, TPs sent but not approved
  if (stampers.length > 0 && tpsSent.length > 0 && !approved) return 'test_pressing';

  // plates: Lacquer ordered but stampers not done
  if (lacquer.length > 0 && stampers.length === 0) return 'plates';

  // deposit: deposit received but no lacquer yet
  if ((deposit === 'y' || deposit === 'yes') && lacquer.length === 0) return 'deposit';

  // quote: everything else
  return 'quote';
}

function extractDueNote(projectName: string): string {
  // Match patterns like "DUE EARLY MAY", "DUE MAY 15", "DUE 5/15", etc.
  const match = projectName.match(/DUE\s+[A-Z0-9\/\.\-\s]+/i);
  return match ? match[0].trim() : '';
}

export async function getNORPJobs(): Promise<NORPJob[]> {
  const auth = getPersonalGmailAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: NORP_SHEET_ID,
    range: 'Production!A:AE',
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  // Skip header row
  const jobs: NORPJob[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const projectName = row[0]?.trim() ?? '';

    // Skip empty rows
    if (!projectName) continue;

    const matrix = row[1]?.trim() ?? '';
    const orderNumber = row[24]?.trim() ?? '';

    // Generate a unique job_id from matrix or order number
    const job_id = matrix || orderNumber || `norp-${i}`;

    jobs.push({
      job_id,
      customer: projectName,
      matrix,
      quantity: row[2]?.trim() ?? '',
      colors: row[3]?.trim() ?? '',
      weight: row[4]?.trim() ?? '',
      speed: row[30]?.trim() ?? '', // AE (index 30)
      lacquer: row[5]?.trim() ?? '',
      stampers: row[6]?.trim() ?? '',
      test_pressings_sent: row[8]?.trim() ?? '',
      test_pressings_approved: row[9]?.trim() ?? '',
      labels_arrived: row[12]?.trim() ?? '',
      sleeves_arrived: row[15]?.trim() ?? '',
      jackets_arrived: row[18]?.trim() ?? '',
      ship_date: row[26]?.trim() ?? '',
      order_number: orderNumber,
      deposit: row[27]?.trim() ?? '',
      notes: row[23]?.trim() ?? '', // X (index 23)
      due_note: extractDueNote(projectName),
      stage: inferStage(row),
    });
  }

  return jobs;
}

export async function getNORPInventory(): Promise<string[][]> {
  const auth = getPersonalGmailAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: NORP_SHEET_ID,
    range: 'Inventory!A:Z',
  });

  return (res.data.values as string[][]) ?? [];
}
