import { google } from 'googleapis';
import { getPersonalGmailAuth } from './google-auth';

// READ-ONLY: pulls art file index, priority list doc, and inventory sheets
// from the neworleansrecordpress@gmail.com Drive.

const NORP_LABEL_ART_FOLDER_ID = '1Un6Or5dJOj31vT9WvL6yWYCwuIE8pgdW';
const NORP_PRIORITY_DOC_ID = '1ErymrvuGgK4CZJDlLxFZviAOsLjG3Au77dPRFekQctg';
const PAPER_INVENTORY_SHEET_ID = '12mX2-Y1EzRgzm8tghBKqNjlJfu6lI2c-DO68aoGDLRY';
const LABEL_SHELVES_INVENTORY_SHEET_ID = '19Sdfdw2SHbnCU2skTidXEc8FjzC3koCSQvQuZeHIWcs';

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
