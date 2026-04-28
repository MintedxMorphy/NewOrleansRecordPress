import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { appendRow, findRow, updateRow } from '@/lib/sheets';

// Step 2: Google redirects here with auth code — exchange it for tokens
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#e8e8e8">
        <h2 style="color:#ff4444">❌ Auth Error</h2>
        <p>${error}</p>
        <a href="/api/auth/personal-drive" style="color:#00e86a">Try again</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code received' }, { status: 400 });
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      'https://www.nolavinyl.com/api/auth/personal-drive/callback'
    );

    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      return new NextResponse(`
        <html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#e8e8e8">
          <h2 style="color:#ffb800">⚠️ No refresh token returned</h2>
          <p>Google only returns a refresh token on first authorization. If you've already authorized before, revoke access first at 
          <a href="https://myaccount.google.com/permissions" style="color:#00e86a">myaccount.google.com/permissions</a>
          then try again.</p>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html' } });
    }

    // Store in Google Sheet (qbo_cache) so it persists
    const row = { key: 'google_personal_refresh_token', value: refreshToken, updated_at: new Date().toISOString() };
    const existing = await findRow('qbo_cache', 'key', 'google_personal_refresh_token');
    if (existing) {
      await updateRow('qbo_cache', existing.rowIndex, row);
    } else {
      await appendRow('qbo_cache', row);
    }

    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#e8e8e8;max-width:700px;margin:0 auto">
        <h2 style="color:#00e86a">✅ Connected!</h2>
        <p><strong>neworleansrecordpress@gmail.com</strong> Drive + Gmail access is now authorized.</p>
        <p>The refresh token has been stored securely.</p>
        <p style="font-size:12px;color:#666;margin-top:8px">Token (copy this to Vercel as GOOGLE_PERSONAL_REFRESH_TOKEN):</p>
        <textarea style="width:100%;height:80px;background:#141414;color:#00e86a;border:1px solid #2a2a2a;padding:8px;font-size:11px;font-family:monospace" onclick="this.select()">${refreshToken}</textarea>
        <p style="margin-top:20px"><a href="/dashboard" style="background:#00e86a;color:#000;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:700">→ Go to Dashboard</a></p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });

  } catch (e: any) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#e8e8e8">
        <h2 style="color:#ff4444">❌ Token exchange failed</h2>
        <p>${e.message}</p>
        <a href="/api/auth/personal-drive" style="color:#00e86a">Try again</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
}
