import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return new NextResponse('Missing code parameter', { status: 400 });
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );

  const { tokens } = await oauth2.getToken(code);
  const refreshToken = tokens.refresh_token ?? '';

  // Save to file and log prominently for Vercel logs
  try { fs.writeFileSync('/tmp/google_refresh_token.txt', refreshToken); } catch {}
  console.log('========================================');
  console.log('GOOGLE REFRESH TOKEN (copy this):');
  console.log(refreshToken);
  console.log('========================================');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Google Connected</title>
<style>body{font-family:monospace;background:#0a0a0a;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:40px;max-width:600px;width:100%;text-align:center;}
.check{font-size:64px;margin-bottom:16px;}
h1{color:#00e86a;margin:0 0 12px;}
p{color:#9a9a9a;margin:8px 0;}
.token{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:16px;margin-top:20px;text-align:left;word-break:break-all;font-size:13px;color:#e8e8e8;}
.label{font-size:11px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;}
</style></head>
<body><div class="box">
  <div class="check">✅</div>
  <h1>Google Connected!</h1>
  <p>Copy your refresh token from Vercel logs and add it as <strong>GOOGLE_REFRESH_TOKEN</strong> env var.</p>
  <p>The token is also shown below:</p>
  <div class="token">
    <div class="label">Refresh Token</div>
    ${refreshToken || '<em style="color:#ff4444">No refresh token returned — try reconnecting with prompt=consent</em>'}
  </div>
</div></body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
