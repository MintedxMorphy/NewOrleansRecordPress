import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const SHEETS_DB_ID = process.env.SHEETS_DB_ID!;

function getAuth(): JWT {
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, 'base64').toString('utf-8');
  const key = JSON.parse(raw);
  return new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export const TAB_HEADERS: Record<string, string[]> = {
  jobs: ['job_id','customer','contact_email','format','quantity','color','weight_g','package_type','stage','quote_date','deposit_date','ship_date_target','pvc_kg_needed','sleeves_needed','jackets_needed','labels_needed','total_price','deposit_received','balance_due','assigned_press','tracking_number','ups_service','shipping_cost','ship_status','delivery_date','notes'],
  inventory: ['material','sku','on_hand_qty','unit','reorder_point','supplier','last_ordered','unit_cost','notes'],
  customers: ['name','email','phone','total_orders','total_revenue','first_order_date','last_order_date','notes'],
  bills_inbox: ['email_id','date_received','sender','vendor_guess','amount_usd','due_date','invoice_number','status','pdf_drive_url','qbo_bill_id','notes'],
  email_log: ['timestamp','from','subject','classification','confidence','summary','action_taken','job_id','bill_id'],
  compound_alerts: ['timestamp','mbr1_value','wlk_value','oln_value','cl1_value','alert_level','message'],
  briefings: ['date','briefing_text','cash_total','ar_total','ap_total','active_jobs_count','low_inventory_count','days_to_next_payroll','next_payroll_amount','payroll_covered'],
  shipments: ['tracking_number','job_id','carrier','service','weight_lbs','dimensions','shipped_date','est_delivery','actual_delivery','status','last_status_update','total_cost','base_cost','fuel_surcharge','accessorials','notes'],
  payroll: ['pay_period_start','pay_period_end','check_date','gross_pay','employer_taxes','employer_benefits','total_employer_cost','employee_count','hours_total','status','notes'],
  employees: ['gusto_employee_id','name','role','employment_type','hourly_rate','annual_salary','start_date','active','notes'],
  qbo_cache: ['key','value','updated_at'],
  ups_tracking_log: ['timestamp','tracking_number','job_id','old_status','new_status','message'],
};

let _initialized = false;

async function ensureTabs() {
  if (_initialized) return;
  _initialized = true;
  const sheets = getSheetsClient();
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEETS_DB_ID });
    const existingTitles = new Set(meta.data.sheets?.map(s => s.properties?.title) ?? []);
    const requests: any[] = [];
    for (const [title, headers] of Object.entries(TAB_HEADERS)) {
      if (!existingTitles.has(title)) {
        requests.push({ addSheet: { properties: { title } } });
      }
    }
    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEETS_DB_ID, requestBody: { requests } });
    }
    // Write headers to any newly created or empty tabs
    for (const [title, headers] of Object.entries(TAB_HEADERS)) {
      if (!existingTitles.has(title)) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEETS_DB_ID,
          range: `${title}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [headers] },
        });
      }
    }
  } catch (e) {
    console.error('ensureTabs error:', e);
  }
}

export async function getSheet(tabName: string): Promise<Record<string, string>[]> {
  await ensureTabs();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_DB_ID,
    range: `${tabName}`,
  });
  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0] as string[];
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (row[i] as string) ?? ''; });
    return obj;
  });
}

export async function appendRow(tabName: string, rowObj: Record<string, string>): Promise<void> {
  await ensureTabs();
  const sheets = getSheetsClient();
  const headers = TAB_HEADERS[tabName];
  const row = headers.map(h => rowObj[h] ?? '');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEETS_DB_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

export async function updateRow(tabName: string, rowIndex: number, rowObj: Record<string, string>): Promise<void> {
  await ensureTabs();
  const sheets = getSheetsClient();
  const headers = TAB_HEADERS[tabName];
  const row = headers.map(h => rowObj[h] ?? '');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_DB_ID,
    range: `${tabName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

export async function findRow(tabName: string, field: string, value: string): Promise<{ row: Record<string, string>; rowIndex: number } | null> {
  const rows = await getSheet(tabName);
  const idx = rows.findIndex(r => r[field] === value);
  if (idx === -1) return null;
  return { row: rows[idx], rowIndex: idx + 2 }; // +2 for header row + 1-based
}

export async function upsertRow(tabName: string, matchField: string, matchValue: string, rowObj: Record<string, string>): Promise<void> {
  const existing = await findRow(tabName, matchField, matchValue);
  if (existing) {
    await updateRow(tabName, existing.rowIndex, { ...existing.row, ...rowObj });
  } else {
    await appendRow(tabName, rowObj);
  }
}
