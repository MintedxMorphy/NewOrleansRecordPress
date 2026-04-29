import { google } from 'googleapis';
import { getPersonalGmailAuth } from './google-auth';
import { getNORPJobs, type NORPJob } from './norp-sheet';

// READ-ONLY: pulls art file index, priority list doc, and inventory sheets
// from the neworleansrecordpress@gmail.com Drive.

const NORP_LABEL_ART_FOLDER_ID = '1Un6Or5dJOj31vT9WvL6yWYCwuIE8pgdW';
const NORP_PRIORITY_DOC_ID = '1ErymrvuGgK4CZJDlLxFZviAOsLjG3Au77dPRFekQctg';
const PAPER_INVENTORY_SHEET_ID = '12mX2-Y1EzRgzm8tghBKqNjlJfu6lI2c-DO68aoGDLRY';
const LABEL_SHELVES_INVENTORY_SHEET_ID = '19Sdfdw2SHbnCU2skTidXEc8FjzC3koCSQvQuZeHIWcs';
const UPSTAIRS_STAMPERS_SHEET_ID = '1oxXSrDc9_Uh2LmXVhDBN_7CI2sGuSHvpFzDrFXBaWas';
const MOTHERS_INVENTORY_SHEET_ID = '1tjdxylZ7djEMjekkI_7jt_SwhcJ7javUGOO6xul5K5E';
const SST_INVENTORY_SHEET_ID = '1mqkhl56GmxEJu6s2C8K96z_vSNSXT5qalVIvIOHvIFw';
const IARC_SHIP_SPLITS_SHEET_ID = '15VfWY2hpZCKodjB7eAnZ_zP6LzbXEHXQripxLA7PQjg';
const NOVC_INVENTORY_SHEET_ID = '1dhq5qxqpFIJNAOna6JSgqWfQNX8Naok5xLKNhYmOFUI';
const SLEEVER_DOC_ID = '1_W2bsmSyTW1i3uNUqOlh9-65bmxddqYJlirEXPkccCM';

// Subfolders to scan within NORP Label Art (newest months first)
const ART_SUBFOLDER_NAMES = ['5.2026', '4.2026', '3.2026'];

export interface ArtFileEntry {
  sides: string[];           // e.g. ['A','B'] or ['A','B','C','D']
  receivedDate: string;      // ISO date of newest file in group
  folder: string;            // e.g. '5.2026'
}

export type ArtFileIndex = Record<string, ArtFileEntry>;

export interface InventorySummary {
  paperByMatrix: Record<string, number>;     // matrix_id -> count of paper rows mentioning it
  labelsByMatrix: Record<string, number>;    // matrix_id -> count of label rows mentioning it
  paperRowCount: number;
  labelRowCount: number;
}

// Extract matrix ID from a filename. Strips trailing -A.pdf, -B.pdf, -V1-A.pdf, etc.
// Examples:
//   "GP-57-A.pdf"           -> { matrix: "GP-57", side: "A" }
//   "TTB-01-B.pdf"          -> { matrix: "TTB-01", side: "B" }
//   "JazzBounce-A.pdf"      -> { matrix: "JazzBounce", side: "A" }
//   "DDLP-002-C.pdf"        -> { matrix: "DDLP-002", side: "C" }
//   "HC-069010v-V2-A.pdf"   -> { matrix: "HC-069010v", side: "A" }  (version stripped)
//   "LRS-NORP-LP-014-A.pdf" -> { matrix: "LRS-NORP-LP-014", side: "A" }
export function parseArtFilename(filename: string): { matrix: string; side: string } | null {
  const base = filename.replace(/\.[^.]+$/, ''); // strip extension
  // Match optional -V<digits> version segment then -<side letter>
  const m = base.match(/^(.+?)(?:-V\d+)?-([A-Z])$/i);
  if (!m) return null;
  return { matrix: m[1], side: m[2].toUpperCase() };
}

async function findSubfolderId(drive: ReturnType<typeof google.drive>, parentId: string, name: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function listFolderFiles(drive: ReturnType<typeof google.drive>, folderId: string) {
  const files: Array<{ id: string; name: string; modifiedTime: string; createdTime: string }> = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, modifiedTime, createdTime, mimeType)',
      pageSize: 200,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') continue;
      files.push({
        id: f.id ?? '',
        name: f.name ?? '',
        modifiedTime: f.modifiedTime ?? '',
        createdTime: f.createdTime ?? '',
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

export async function getNORPArtFiles(): Promise<ArtFileIndex> {
  const auth = getPersonalGmailAuth();
  const drive = google.drive({ version: 'v3', auth });

  const index: ArtFileIndex = {};

  for (const subName of ART_SUBFOLDER_NAMES) {
    const subId = await findSubfolderId(drive, NORP_LABEL_ART_FOLDER_ID, subName);
    if (!subId) continue;
    const files = await listFolderFiles(drive, subId);
    for (const f of files) {
      const parsed = parseArtFilename(f.name);
      if (!parsed) continue;
      const { matrix, side } = parsed;
      const dateStr = (f.createdTime || f.modifiedTime || '').slice(0, 10);
      const existing = index[matrix];
      if (existing) {
        if (!existing.sides.includes(side)) existing.sides.push(side);
        // Keep most recent received date
        if (dateStr && dateStr > existing.receivedDate) existing.receivedDate = dateStr;
      } else {
        index[matrix] = { sides: [side], receivedDate: dateStr, folder: subName };
      }
    }
  }

  // Sort sides for each entry alphabetically
  for (const k of Object.keys(index)) {
    index[k].sides.sort();
  }

  return index;
}

export async function getNORPPriorityList(): Promise<string> {
  const auth = getPersonalGmailAuth();
  const drive = google.drive({ version: 'v3', auth });
  // Export Google Doc as plain text
  const res = await drive.files.export(
    { fileId: NORP_PRIORITY_DOC_ID, mimeType: 'text/plain' },
    { responseType: 'text' },
  );
  // googleapis returns string when responseType is 'text'
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

async function readSheetValues(sheetId: string, range: string): Promise<string[][]> {
  const auth = getPersonalGmailAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return (res.data.values as string[][]) ?? [];
}

// ── Press queue parser ────────────────────────────────────────────────────────

export interface PressQueueJob {
  matrix: string;
  customer: string;
  qty_from_doc: string;
  color_from_doc: string;
  quantity: string;
  colors: string;
  weight: string;
  stage: string;
  due_note: string;
  notes_from_doc: string;
}

export interface PressQueues {
  viryl: PressQueueJob[];
  finebilt: PressQueueJob[];
  test_pressings: string[];
  blocked: PressQueueJob[];
  raw_text: string;
}

// Heuristic: line starts with a 1-5 digit qty followed by a space and non-digit.
function isQtyLine(line: string): boolean {
  return /^\d{1,5}\s+\S/.test(line) && !/^\d{1,5}\s*$/.test(line);
}

// Heuristic: line looks like a matrix ID (possibly followed by " - notes").
function looksLikeMatrix(line: string): boolean {
  const head = line.split(/\s+-\s+/)[0].trim();
  if (!head || head.length > 50) return false;
  const words = head.split(/\s+/);
  if (words.length > 4) return false;
  const hasDigit = /\d/.test(head);
  const hasUpper = /[A-Z]/.test(head);
  if (!hasDigit && !hasUpper) return false;
  const lower = (head.match(/[a-z]/g) || []).length;
  const upperOrDigit = (head.match(/[A-Z0-9]/g) || []).length;
  if (lower > upperOrDigit) return false;
  return true;
}

function parseQtyColor(line: string): { qty: string; color: string } {
  const m = line.match(/^(\d{1,5})\s+(.+)$/);
  if (!m) return { qty: '', color: line };
  return { qty: m[1], color: m[2].trim() };
}

function splitMatrixAndNotes(line: string): { matrix: string; notes: string } {
  const parts = line.split(/\s+-\s+/);
  return {
    matrix: parts[0].trim(),
    notes: parts.slice(1).join(' - ').trim(),
  };
}

function buildEntry(
  matrix: string,
  notes: string,
  pending: { qty: string; color: string } | null,
  jobByMatrix: Map<string, NORPJob>,
): PressQueueJob {
  const job = matrix ? jobByMatrix.get(matrix.toUpperCase()) : undefined;
  return {
    matrix,
    customer: job?.customer ?? '',
    qty_from_doc: pending?.qty ?? '',
    color_from_doc: pending?.color ?? '',
    quantity: job?.quantity ?? '',
    colors: job?.colors ?? '',
    weight: job?.weight ?? '',
    stage: job?.stage ?? '',
    due_note: job?.due_note ?? '',
    notes_from_doc: notes,
  };
}

function parsePressQueues(text: string, jobs: NORPJob[]): PressQueues {
  const lines = text.split(/\r?\n/);
  const result: PressQueues = {
    viryl: [],
    finebilt: [],
    test_pressings: [],
    blocked: [],
    raw_text: text,
  };

  const jobByMatrix = new Map<string, NORPJob>();
  for (const j of jobs) {
    if (j.matrix) jobByMatrix.set(j.matrix.toUpperCase(), j);
  }

  type Section = 'none' | 'tests' | 'finebilt' | 'viryl' | 'blocked';
  let section: Section = 'none';
  let inProduction = false;
  let pending: { qty: string; color: string } | null = null;

  const flushOrphan = () => {
    if (!pending) return;
    if (section === 'finebilt' || section === 'viryl' || section === 'blocked') {
      const entry = buildEntry('', '', pending, jobByMatrix);
      if (section === 'finebilt') result.finebilt.push(entry);
      else if (section === 'viryl') result.viryl.push(entry);
      else result.blocked.push(entry);
    }
    pending = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const upper = line.toUpperCase();

    // Section headers (exact matches only — title line "VIRYL PRESS PRIORITY..." won't match)
    if (upper === 'TEST PRESSES' || upper === 'COLOR TESTS') {
      flushOrphan();
      section = 'tests';
      continue;
    }
    if (upper === 'PRODUCTION') {
      flushOrphan();
      inProduction = true;
      section = 'none';
      continue;
    }
    if (upper === 'FINEBILT' && inProduction) {
      flushOrphan();
      section = 'finebilt';
      continue;
    }
    if (upper === 'VIRYL' && inProduction) {
      flushOrphan();
      section = 'viryl';
      continue;
    }
    if (upper.startsWith('THESE NEED THINGS')) {
      flushOrphan();
      section = 'blocked';
      continue;
    }
    if (upper.startsWith('ISSUES:') || upper === 'ISSUES') {
      flushOrphan();
      section = 'none';
      continue;
    }

    if (section === 'tests') {
      if (looksLikeMatrix(line)) {
        const { matrix } = splitMatrixAndNotes(line);
        if (matrix) result.test_pressings.push(matrix);
      }
      continue;
    }

    if (section === 'finebilt' || section === 'viryl' || section === 'blocked') {
      if (isQtyLine(line)) {
        // New qty/color block — flush any prior pending as orphan
        flushOrphan();
        pending = parseQtyColor(line);
        continue;
      }

      if (looksLikeMatrix(line)) {
        const { matrix, notes } = splitMatrixAndNotes(line);
        const entry = buildEntry(matrix, notes, pending, jobByMatrix);
        if (section === 'finebilt') result.finebilt.push(entry);
        else if (section === 'viryl') result.viryl.push(entry);
        else result.blocked.push(entry);
        pending = null;
        continue;
      }

      // Other lines (commentary like "Finebilt - Ok to press") — skip
    }
  }

  // Final flush
  flushOrphan();

  return result;
}

export async function getPressQueues(): Promise<PressQueues> {
  const [text, jobs] = await Promise.all([
    getNORPPriorityList(),
    getNORPJobs().catch(() => [] as NORPJob[]),
  ]);
  return parsePressQueues(text, jobs);
}

export async function getNORPInventorySummary(): Promise<InventorySummary> {
  const [paperRows, labelRows] = await Promise.all([
    readSheetValues(PAPER_INVENTORY_SHEET_ID, 'A:Z').catch(() => [] as string[][]),
    readSheetValues(LABEL_SHELVES_INVENTORY_SHEET_ID, 'A:Z').catch(() => [] as string[][]),
  ]);

  const paperByMatrix: Record<string, number> = {};
  const labelsByMatrix: Record<string, number> = {};

  // Heuristic: scan every cell for matrix-id-like tokens (e.g. "GP-57", "AJB-LP-001")
  // We'll capture tokens of shape: 2-6 letters, dashes, digits, optional -LP-/-EP- segments.
  const matrixPattern = /\b[A-Z]{2,6}(?:-[A-Z0-9]{1,6}){1,4}\b/g;

  const tally = (rows: string[][], target: Record<string, number>) => {
    for (const row of rows) {
      const seenInRow = new Set<string>();
      for (const cell of row) {
        if (!cell) continue;
        const matches = String(cell).match(matrixPattern);
        if (!matches) continue;
        for (const m of matches) seenInRow.add(m);
      }
      for (const m of seenInRow) target[m] = (target[m] ?? 0) + 1;
    }
  };

  tally(paperRows, paperByMatrix);
  tally(labelRows, labelsByMatrix);

  return {
    paperByMatrix,
    labelsByMatrix,
    paperRowCount: paperRows.length,
    labelRowCount: labelRows.length,
  };
}

// ── New inventory types ───────────────────────────────────────────────────────

export interface StamperEntry {
  matrixId: string;
  boxes: string[];
  sides: string;
}

export interface MotherEntry {
  matrixId: string;
  box: string;
  sides: string;
}

export interface SSTEntry {
  artist: string;
  title: string;
  catNumber: string;
  stampersQty: string;
  labelsQty: string;
  jacketsQty: string;
  insertQty: string;
}

export interface IARCShipEntry {
  stockInDate: string;
  upc: string;
  catNumber: string;
  title: string;
  variant: string;
  format: string;
  qty: number;
}

export interface NOVCEntry {
  album: string;
  quantity: number;
  matrixId: string;
  overflow: string;
}

// ── Stampers inventory ────────────────────────────────────────────────────────

export async function getStampersInventory(): Promise<StamperEntry[]> {
  const rows = await readSheetValues(UPSTAIRS_STAMPERS_SHEET_ID, 'A:D').catch(() => [] as string[][]);
  const byMatrix: Record<string, StamperEntry> = {};
  for (const row of rows) {
    const matrixId = (row[0] || '').trim();
    if (!matrixId || matrixId.toLowerCase().includes('matrix')) continue;
    const box = (row[2] || row[1] || '').trim();
    const sides = (row[3] || '').trim();
    if (!byMatrix[matrixId]) {
      byMatrix[matrixId] = { matrixId, boxes: [], sides };
    }
    if (box && !byMatrix[matrixId].boxes.includes(box)) {
      byMatrix[matrixId].boxes.push(box);
    }
  }
  return Object.values(byMatrix).sort((a, b) => a.matrixId.localeCompare(b.matrixId));
}

// ── Mothers inventory ─────────────────────────────────────────────────────────

export async function getMothersInventory(): Promise<MotherEntry[]> {
  const rows = await readSheetValues(MOTHERS_INVENTORY_SHEET_ID, 'A:C').catch(() => [] as string[][]);
  const results: MotherEntry[] = [];
  for (const row of rows) {
    const matrixId = (row[0] || '').trim();
    if (!matrixId || matrixId.toLowerCase() === 'matrix') continue;
    results.push({
      matrixId,
      box: (row[1] || '').trim(),
      sides: (row[2] || '').trim(),
    });
  }
  return results;
}

// ── SST catalog inventory ─────────────────────────────────────────────────────

export async function getSSTInventory(): Promise<SSTEntry[]> {
  const rows = await readSheetValues(SST_INVENTORY_SHEET_ID, 'A:G').catch(() => [] as string[][]);
  const results: SSTEntry[] = [];
  for (const row of rows) {
    const artist = (row[0] || '').trim();
    if (!artist || artist.toLowerCase() === 'black flag' && !row[1]) continue; // skip pure artist header rows with no title
    const title = (row[1] || '').trim();
    if (!title) continue;
    results.push({
      artist,
      title,
      catNumber: (row[2] || '').trim(),
      stampersQty: (row[3] || '').trim(),
      labelsQty: (row[4] || '').trim(),
      jacketsQty: (row[5] || '').trim(),
      insertQty: (row[6] || '').trim(),
    });
  }
  return results;
}

// ── IARC ship splits ──────────────────────────────────────────────────────────

export async function getIARCShipSplits(): Promise<IARCShipEntry[]> {
  const rows = await readSheetValues(IARC_SHIP_SPLITS_SHEET_ID, 'A:G').catch(() => [] as string[][]);
  const results: IARCShipEntry[] = [];
  for (const row of rows) {
    const catNumber = (row[2] || '').trim();
    const title = (row[3] || '').trim();
    if (!catNumber && !title) continue;
    if (catNumber.toLowerCase().includes('cat') || title.toLowerCase().includes('title')) continue; // header
    const qtyRaw = (row[6] || '').trim();
    const qty = qtyRaw ? parseInt(qtyRaw.replace(/,/g, ''), 10) : 0;
    results.push({
      stockInDate: (row[0] || '').trim(),
      upc: (row[1] || '').trim(),
      catNumber,
      title,
      variant: (row[4] || '').trim(),
      format: (row[5] || '').trim(),
      qty: isNaN(qty) ? 0 : qty,
    });
  }
  return results;
}

// ── NOVC inventory ────────────────────────────────────────────────────────────

export async function getNOVCInventory(): Promise<NOVCEntry[]> {
  const rows = await readSheetValues(NOVC_INVENTORY_SHEET_ID, 'A:F').catch(() => [] as string[][]);
  const results: NOVCEntry[] = [];
  for (const row of rows) {
    const album = (row[1] || '').trim();
    if (!album || album.toLowerCase() === 'album') continue;
    const qtyRaw = (row[2] || '').trim();
    const qty = qtyRaw ? parseInt(qtyRaw, 10) : 0;
    results.push({
      album,
      quantity: isNaN(qty) ? 0 : qty,
      matrixId: (row[3] || '').trim(),
      overflow: (row[5] || '').trim(),
    });
  }
  return results;
}

// ── Sleever sheet (Google Doc) ────────────────────────────────────────────────

export async function getSleeversDoc(): Promise<string> {
  try {
    const auth = getPersonalGmailAuth();
    const docs = google.docs({ version: 'v1', auth });
    const res = await docs.documents.get({ documentId: SLEEVER_DOC_ID });
    const content = res.data.body?.content ?? [];
    return content
      .flatMap(el => el.paragraph?.elements?.map(e => e.textRun?.content ?? '') ?? [])
      .join('')
      .trim();
  } catch {
    return ''; // Docs API not yet enabled — returns empty, will work once enabled
  }
}
