import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getWorkspaceAuth } from '@/lib/google-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, any> = {
    sheetsDbId: process.env.SHEETS_DB_ID ? `✅ ${process.env.SHEETS_DB_ID.slice(0, 20)}...` : '❌ NOT SET',
    serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? '✅ SET' : '❌ NOT SET',
  };

  // Test 1: parse service account key
  try {
    const keyJson = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, 'base64').toString());
    results.serviceAccountEmail = `✅ ${keyJson.client_email}`;
    results.projectId = keyJson.project_id;
  } catch (e: any) {
    results.serviceAccountEmail = `❌ Parse error: ${e.message}`;
  }

  // Test 2: sheets access (direct SA, no impersonation)
  try {
    const keyJson = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, 'base64').toString());
    const auth = new google.auth.JWT({
      email: keyJson.client_email,
      key: keyJson.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({ spreadsheetId: process.env.SHEETS_DB_ID! });
    results.sheetsAccess = `✅ Connected: "${res.data.properties?.title}"`;
    results.sheetTabs = res.data.sheets?.map(s => s.properties?.title).join(', ');
  } catch (e: any) {
    results.sheetsAccess = `❌ ${e.message}`;
    results.sheetsError = e.code;
    results.sheetsErrorFull = JSON.stringify(e.errors || e.response?.data || e.stack?.slice(0,300));
  }

  // Test 3: gmail access
  try {
    const auth = getWorkspaceAuth('gregory@neworleansrecordpress.com');
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.getProfile({ userId: 'gregory@neworleansrecordpress.com' });
    results.gmailAccess = `✅ ${res.data.emailAddress} (${res.data.messagesTotal} messages)`;
  } catch (e: any) {
    results.gmailAccess = `❌ ${e.message}`;
  }

  // Test 4: AfterShip
  try {
    const { isAfterShipReady } = await import('@/lib/aftership-config');
    const { testAfterShipConnection } = await import('@/lib/aftership');
    const ready = await isAfterShipReady();
    results.aftershipKey = ready ? '✅ SET' : '❌ NOT SET';
    results.aftershipConnection = ready
      ? (await testAfterShipConnection()).ok ? '✅ Connected' : '❌ API error'
      : 'skipped';
  } catch (e: any) {
    results.aftershipConnection = `❌ ${e.message}`;
  }

  return NextResponse.json(results, { status: 200 });
}
