import { findRow, updateRow, getSheet, appendRow } from './sheets';

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const QBO_REALM_ID = () => (process.env.QBO_REALM_ID ?? '').trim();
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

async function getCachedToken(): Promise<string> {
  const cached = await findRow('qbo_cache', 'key', 'qbo_access_token');
  if (cached) {
    const expiry = parseInt(cached.row['updated_at'] ?? '0');
    if (Date.now() < expiry - 60_000) {
      return cached.row['value'];
    }
  }
  return refreshQBOToken();
}

async function getStoredRefreshToken(): Promise<string | null> {
  try {
    const cached = await findRow('qbo_cache', 'key', 'qbo_refresh_token');
    return cached?.row['value'] || null;
  } catch {
    return null;
  }
}

export async function refreshQBOToken(): Promise<string> {
  // Use stored refresh token (from previous refresh) or fall back to env var
  const storedToken = await getStoredRefreshToken();
  const refreshToken = storedToken || process.env.QBO_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error('No QBO refresh token available - re-authenticate at /api/qbo/connect');
  }

  const creds = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    signal: AbortSignal.timeout(8000), // 8s timeout
  });
  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  // Handle refresh error - clear stored token so we fall back to env on retry
  if (data.error || !data.access_token) {
    // If stored token failed, try env token once
    if (storedToken && process.env.QBO_REFRESH_TOKEN && storedToken !== process.env.QBO_REFRESH_TOKEN) {
      console.log('[QBO] Stored token invalid, trying env token');
      const retryRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(process.env.QBO_REFRESH_TOKEN)}`,
        signal: AbortSignal.timeout(8000),
      });
      const retryData = await retryRes.json() as typeof data;
      if (retryData.error || !retryData.access_token) {
        throw new Error(`QBO refresh failed: ${retryData.error_description || retryData.error || 'unknown'} - re-authenticate at /api/qbo/connect`);
      }
      Object.assign(data, retryData);
    } else {
      throw new Error(`QBO refresh failed: ${data.error_description || data.error || 'unknown'} - re-authenticate at /api/qbo/connect`);
    }
  }

  const expiry = Date.now() + ((data.expires_in ?? 3600) * 1000);

  // Save BOTH access token AND new refresh token (QBO rotates refresh tokens!)
  const saveToken = async (key: string, value: string, updatedAt: string) => {
    const existing = await findRow('qbo_cache', 'key', key);
    const row = { key, value, updated_at: updatedAt };
    if (existing) {
      await updateRow('qbo_cache', existing.rowIndex, row);
    } else {
      await appendRow('qbo_cache', row);
    }
  };

  await saveToken('qbo_access_token', data.access_token!, String(expiry));

  // Critical: persist new refresh token so next refresh uses it
  if (data.refresh_token) {
    await saveToken('qbo_refresh_token', data.refresh_token, new Date().toISOString());
  }

  return data.access_token!;
}

async function qboFetch(path: string): Promise<any> {
  const token = await getCachedToken();
  const realmId = QBO_REALM_ID();
  const res = await fetch(`${QBO_BASE}/${realmId}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000), // 8s timeout — fail fast when QBO is broken
  });
  return res.json();
}

export async function getARaging(): Promise<{ total: number; buckets: { current: number; days30: number; days60: number; days90plus: number } }> {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN) return { total: 0, buckets: { current: 0, days30: 0, days60: 0, days90plus: 0 } };
  try {
    const data = await qboFetch('reports/AgedReceivables?report_date=today&aging_period=30&num_periods=4');
    const rows = data?.Rows?.Row ?? [];
    let total = 0;
    const buckets = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    for (const row of rows) {
      if (row?.type === 'Section') {
        const cols = row?.Summary?.ColData ?? [];
        const vals = cols.map((c: any) => parseFloat(c.value ?? '0') || 0);
        buckets.current += vals[1] ?? 0;
        buckets.days30 += vals[2] ?? 0;
        buckets.days60 += vals[3] ?? 0;
        buckets.days90plus += vals[4] ?? 0;
        total += vals.slice(1).reduce((a: number, b: number) => a + b, 0);
      }
    }
    return { total, buckets };
  } catch {
    return { total: 0, buckets: { current: 0, days30: 0, days60: 0, days90plus: 0 } };
  }
}

export async function getAPAging(): Promise<{ total: number; pendingBills: number }> {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN) return { total: 0, pendingBills: 0 };
  try {
    const data = await qboFetch('reports/AgedPayables?report_date=today&aging_period=30&num_periods=4');
    const rows = data?.Rows?.Row ?? [];
    let total = 0;
    let pendingBills = 0;
    for (const row of rows) {
      if (row?.type === 'Section') {
        const cols = row?.Summary?.ColData ?? [];
        const vals = cols.map((c: any) => parseFloat(c.value ?? '0') || 0);
        total += vals.slice(1).reduce((a: number, b: number) => a + b, 0);
        pendingBills++;
      }
    }
    return { total, pendingBills };
  } catch {
    return { total: 0, pendingBills: 0 };
  }
}

export async function getBankBalances(): Promise<Array<{ accountName: string; balance: number }>> {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN) return [];
  try {
    const data = await qboFetch('query?query=SELECT%20*%20FROM%20Account%20WHERE%20AccountType%20IN%20(%27Bank%27%2C%27Credit%20Card%27)%20MAXRESULTS%2050');
    const accounts = data?.QueryResponse?.Account ?? [];
    return accounts.map((a: any) => ({
      accountName: a.Name ?? 'Unknown',
      balance: parseFloat(a.CurrentBalance ?? '0'),
    }));
  } catch {
    return [];
  }
}

export async function getBankBalancesFromReport(): Promise<Array<{ accountName: string; balance: number }>> {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN) return [];
  try {
    const data = await qboFetch('reports/BalanceSheet?date_macro=Today&minorversion=65');
    const rows = data?.Rows?.Row ?? [];
    const accounts: Array<{ accountName: string; balance: number }> = [];

    const walkRows = (rowList: any[]) => {
      for (const row of rowList) {
        if (row?.type === 'Data') {
          const cols = row?.ColData ?? [];
          const name = cols[0]?.value ?? '';
          const val = parseFloat(cols[1]?.value ?? '0') || 0;
          if (name && val !== 0) accounts.push({ accountName: name, balance: val });
        }
        // Only recurse once — avoid double-walking Section rows
        if (row?.Rows?.Row) walkRows(row.Rows.Row);
      }
    };
    walkRows(rows);

    return accounts.filter(a =>
      /check|saving|cash|bank|3025|3870|resource/i.test(a.accountName)
    );
  } catch {
    return getBankBalances();
  }
}

export async function getMTDRevenue(): Promise<number> {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN) return 0;
  try {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end = now.toISOString().split('T')[0];
    const data = await qboFetch(`reports/ProfitAndLoss?start_date=${start}&end_date=${end}`);
    const rows = data?.Rows?.Row ?? [];
    for (const row of rows) {
      if (row?.type === 'Section' && row?.group === 'Income') {
        const summary = row?.Summary?.ColData ?? [];
        return parseFloat(summary[1]?.value ?? '0') || 0;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

// Levenshtein distance helper
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

export interface CreateBillParams {
  vendorName: string;
  amount: number;
  dueDate: string;
  invoiceNumber?: string;
  lineDescription?: string;
}

export interface CreateBillResult {
  ok?: boolean;
  billId?: string;
  duplicate?: boolean;
  existingBillId?: string;
  vendorNotFound?: boolean;
  error?: string;
}

async function qboPost(path: string, body: any): Promise<any> {
  const token = await getCachedToken();
  const realmId = QBO_REALM_ID();
  const res = await fetch(`${QBO_BASE}/${realmId}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function createDraftBill(params: CreateBillParams): Promise<CreateBillResult> {
  try {
    const realmId = QBO_REALM_ID();

    // Find vendor
    const encodedName = encodeURIComponent(`SELECT * FROM Vendor WHERE DisplayName = '${params.vendorName.replace(/'/g, "\\'")}'`);
    const vendorData = await qboFetch(`query?query=${encodedName}`);
    let vendor = vendorData?.QueryResponse?.Vendor?.[0];

    if (!vendor) {
      // Try fuzzy match
      const allVendors = await qboFetch(`query?query=${encodeURIComponent('SELECT * FROM Vendor MAXRESULTS 100')}`);
      const vendors = allVendors?.QueryResponse?.Vendor ?? [];
      for (const v of vendors) {
        if (levenshtein((v.DisplayName ?? '').toLowerCase(), params.vendorName.toLowerCase()) < 3) {
          vendor = v;
          break;
        }
      }
    }

    if (!vendor) {
      return { vendorNotFound: true };
    }

    // Duplicate check: same vendor + amount within ±7 days
    const checkFrom = new Date(params.dueDate);
    checkFrom.setDate(checkFrom.getDate() - 7);
    const checkTo = new Date(params.dueDate);
    checkTo.setDate(checkTo.getDate() + 7);
    const dupQuery = encodeURIComponent(
      `SELECT * FROM Bill WHERE VendorRef = '${vendor.Id}' AND TotalAmt = '${params.amount}' AND DueDate >= '${checkFrom.toISOString().split('T')[0]}' AND DueDate <= '${checkTo.toISOString().split('T')[0]}'`
    );
    const dupData = await qboFetch(`query?query=${dupQuery}`);
    const existingBills = dupData?.QueryResponse?.Bill ?? [];
    if (existingBills.length > 0) {
      return { duplicate: true, existingBillId: existingBills[0].Id };
    }

    // Create draft bill
    const billBody = {
      VendorRef: { value: vendor.Id, name: vendor.DisplayName },
      APAccountRef: { name: 'Accounts Payable (A/P)' },
      DueDate: params.dueDate,
      TotalAmt: params.amount,
      Line: [{
        Amount: params.amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: { name: 'Uncategorized Expense' },
        },
        Description: params.lineDescription ?? params.invoiceNumber ?? 'Imported from email',
      }],
      DocNumber: params.invoiceNumber,
      PrivateNote: 'Draft - imported automatically. Requires review.',
    };

    const result = await qboPost('bill', billBody);
    const billId = result?.Bill?.Id;
    if (!billId) return { error: 'QBO returned no Bill ID', ...result };
    return { ok: true, billId };
  } catch (e: any) {
    return { error: e?.message ?? 'Unknown error' };
  }
}
