import { NextRequest, NextResponse } from 'next/server';
import { findRow, updateRow, appendRow } from '@/lib/sheets';

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error, message: 'QBO authorization denied' }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No authorization code received' }, { status: 400 });
  }

  try {
    const creds = Buffer.from(
      `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://www.nolavinyl.com/api/qbo/callback',
      }).toString(),
    });

    const data = await res.json() as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      x_refresh_token_expires_in?: number;
      error?: string;
    };

    if (data.error || !data.refresh_token) {
      return NextResponse.json({ error: 'Failed to exchange code', details: data }, { status: 500 });
    }

    // Auto-save realm ID and refresh token to qbo_cache sheet
    try {
      const saveValue = async (key: string, value: string) => {
        const existing = await findRow('qbo_cache', 'key', key);
        const row = { key, value, updated_at: new Date().toISOString() };
        if (existing) await updateRow('qbo_cache', existing.rowIndex, row);
        else await appendRow('qbo_cache', row);
      };
      if (realmId) await saveValue('qbo_realm_id_from_oauth', realmId);
      // Save under both keys: primary key for refresh code, backup key for reference
      await saveValue('qbo_refresh_token', data.refresh_token);
      await saveValue('qbo_refresh_token_from_oauth', data.refresh_token);
    } catch (_) { /* non-fatal */ }

    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>QBO Connected</title>
<style>
  body { font-family: monospace; background: #0A0A0A; color: #E8E8E8; padding: 40px; }
  .success { color: #00E86A; font-size: 24px; font-weight: bold; margin-bottom: 24px; }
  .label { color: #9A9A9A; font-size: 12px; margin-top: 20px; text-transform: uppercase; letter-spacing: 0.08em; }
  .value { background: #1A1A1A; border: 1px solid #2A2A2A; padding: 12px; border-radius: 6px; word-break: break-all; margin-top: 6px; font-size: 13px; cursor: pointer; }
  .critical { border-color: #FF4444 !important; }
  .note { color: #FFB800; margin-top: 24px; font-size: 14px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="success">✅ QBO OAuth Complete!</div>

  <div class="note">⚠️ Send BOTH values below to Zero Cool so he can update Vercel.</div>

  <div class="label">🔴 REALM ID — send this to Zero Cool:</div>
  <div class="value critical" onclick="navigator.clipboard.writeText('${realmId ?? ''}')">${realmId ?? 'NOT RETURNED — something went wrong'}</div>

  <div class="label">Refresh Token — send this to Zero Cool:</div>
  <div class="value" onclick="navigator.clipboard.writeText('${data.refresh_token}')">${data.refresh_token}</div>

  <div class="note">Both values have been saved to your NORP_OPS_DB sheet (qbo_cache tab) as backup.</div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
