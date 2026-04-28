import { findRow, updateRow, appendRow } from './sheets';

const GUSTO_TOKEN_URL = 'https://api.gusto-demo.com/oauth/token'; // prod: api.gusto.com
const GUSTO_API = 'https://api.gusto.com/v1';

async function getCachedToken(): Promise<string> {
  const cached = await findRow('qbo_cache', 'key', 'gusto_access_token');
  if (cached) {
    const expiry = parseInt(cached.row['updated_at'] ?? '0');
    if (Date.now() < expiry - 60_000) {
      return cached.row['value'];
    }
  }
  return refreshGustoToken();
}

export async function refreshGustoToken(): Promise<string> {
  const res = await fetch('https://api.gusto.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GUSTO_CLIENT_ID,
      client_secret: process.env.GUSTO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.GUSTO_REFRESH_TOKEN,
    }),
  });
  const data = await res.json() as { access_token: string; expires_in: number };
  const expiry = Date.now() + ((data.expires_in ?? 7200) * 1000);
  const row = { key: 'gusto_access_token', value: data.access_token, updated_at: String(expiry) };
  const existing = await findRow('qbo_cache', 'key', 'gusto_access_token');
  if (existing) {
    await updateRow('qbo_cache', existing.rowIndex, row);
  } else {
    await appendRow('qbo_cache', row);
  }
  return data.access_token;
}

async function gustoFetch(path: string): Promise<any> {
  const token = await getCachedToken();
  const res = await fetch(`${GUSTO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return res.json();
}

export interface NextPayroll {
  checkDate: string;
  grossPay: number;
  employerTaxes: number;
  employerBenefits: number;
  totalEmployerCost: number;
  daysUntil: number;
}

export async function getNextPayroll(): Promise<NextPayroll | null> {
  try {
    const companyId = process.env.GUSTO_COMPANY_UUID!;
    const payrolls = await gustoFetch(`/companies/${companyId}/payrolls?processing_statuses[]=unprocessed&include=payroll_status_meta`);
    if (!Array.isArray(payrolls) || payrolls.length === 0) return null;
    const next = payrolls[0];
    const checkDate = next.check_date ?? '';
    const totals = next.totals ?? {};
    const grossPay = parseFloat(totals.gross_pay ?? '0');
    const employerTaxes = parseFloat(totals.employer_taxes ?? '0');
    const employerBenefits = parseFloat(totals.employer_benefits_contributions ?? '0');
    const totalEmployerCost = grossPay + employerTaxes + employerBenefits;
    const daysUntil = checkDate
      ? Math.max(0, Math.ceil((new Date(checkDate).getTime() - Date.now()) / 86400000))
      : 0;
    return { checkDate, grossPay, employerTaxes, employerBenefits, totalEmployerCost, daysUntil };
  } catch {
    return null;
  }
}

export async function getEmployees(): Promise<any[]> {
  try {
    const companyId = process.env.GUSTO_COMPANY_UUID!;
    const emps = await gustoFetch(`/companies/${companyId}/employees`);
    return Array.isArray(emps) ? emps : [];
  } catch {
    return [];
  }
}

export async function getPayrolls(): Promise<any[]> {
  try {
    const companyId = process.env.GUSTO_COMPANY_UUID!;
    const payrolls = await gustoFetch(`/companies/${companyId}/payrolls?include=totals`);
    const list = Array.isArray(payrolls) ? payrolls : [];
    return list.slice(0, 12);
  } catch {
    return [];
  }
}

export async function getPaySchedules(): Promise<any[]> {
  try {
    const companyId = process.env.GUSTO_COMPANY_UUID!;
    const schedules = await gustoFetch(`/companies/${companyId}/pay_schedules`);
    return Array.isArray(schedules) ? schedules : [];
  } catch {
    return [];
  }
}
