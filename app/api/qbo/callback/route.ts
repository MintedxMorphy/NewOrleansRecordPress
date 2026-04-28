import { NextRequest, NextResponse } from 'next/server';

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

    // Return the tokens — user needs to set QBO_REFRESH_TOKEN in Vercel
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>QBO Connected</title>
<style>
  body { font-family: monospace; background: #0A0A0A; color: #E8E8E8; padding: 40px; }
  .success { color: #00E86A; font-size: 24px; font-weight: bold; margin-bottom: 24px; }
  .label { color: #9A9A9A; font-size: 12px; margin-top: 16px; }
  .value { background: #1A1A1A; border: 1px solid #2A2A2A; padding: 12px; border-radius: 6px; word-break: break-all; margin-top: 4px; font-size: 13px; }
  .note { color: #FFB800; margin-top: 24px; font-size: 14px; }
</style>
</head>
<body>
  <div class="success">✅ QBO Connected!</div>
  <div class="label">Realm ID (already set in Vercel):</div>
  <div class="value">${realmId ?? 'N/A'}</div>
  <div class="label">Refresh Token — copy this and send to Zero Cool:</div>
  <div class="value" id="rt">${data.refresh_token}</div>
  <div class="note">⚠️ Copy the refresh token above and send it to Zero Cool to set in Vercel.</div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
